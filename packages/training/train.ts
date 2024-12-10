import { SettablePromise, requireDefined, sleep } from "studio-util";
import { Action, Game, GameConfiguration, GameState } from "game";
import { List, Map } from "immutable";
import { Model } from "../mcts/model.js";
import { EpisodeBuffer, SimpleArrayLike } from "./episodebuffer.js";
import * as worker_threads from "node:worker_threads";
import fs from "node:fs/promises";
import { EpisodeTrainingData, StateTrainingData } from "training-data";
import { LogDirectory } from "./logdirectory.js";
import * as tf from "@tensorflow/tfjs";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const textEncoder = new TextEncoder();

// When true, generated data like self-play episodes and models won't
// be saved to persistent storage
const testing = false;

const timeBetweenModelSavesMs = 15 * 60 * 1_000;

/**
 * How many self-play episode batches to receive from all self-play
 * workers between issuing updated models. The goal of this mechanism
 * is to avoid sending models faster than self-play workers can use
 * them.
 */
const selfPlayBatchesBetweenModelUpdates = 1;

/**
 * @param batchSize number of state samples to use per batch
 */
export async function train_parallel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT,
  ModelT extends Model<C, S, A, EncodedSampleT>
>(
  game: Game<C, S, A>,
  model: ModelT,
  batchSize: number,
  sampleBufferSize: number,
  selfPlayWorkerScript: string,
  selfPlayWorkerCount: number,
  evalWorkerScript: string,
  modelsDir: LogDirectory,
  saveModel: (model: ModelT, path: string) => Promise<void>,
  episodesDir: LogDirectory
) {
  const trainingModel = model.trainingModel(batchSize);
  const encodedModel = await model.toJson();

  const buffer = new EpisodeBuffer<
    StateTrainingData<C, S, A>,
    SimpleArrayLike<StateTrainingData<C, S, A>>
  >(sampleBufferSize);

  const bufferReady = new SettablePromise<undefined>();

  function addEpisodeToBuffer(message: any) {
    const decoded = EpisodeTrainingData.decode(game, message);
    const encodedSamples = decoded.stateTrainingDataArray();
    buffer.addEpisode(new SimpleArrayLike(encodedSamples));
    if (buffer.sampleCount() >= batchSize) {
      bufferReady.fulfill(undefined);
    }
  }

  let initialEpisodeCount = 0;
  for await (const encodedEpisode of loadEpisodesJson(episodesDir.path)) {
    addEpisodeToBuffer(encodedEpisode);
    initialEpisodeCount++;
    if (buffer.sampleCount() >= sampleBufferSize) {
      break;
    }
  }
  console.log(
    `Loaded ${initialEpisodeCount} episodes; sample buffer size is ${buffer.sampleCount()} with maximum ${sampleBufferSize}`
  );

  let episodesReceived = 0;
  let episodeBatchesReceived = 0;
  const workersStartedMs = performance.now();
  function receiveEpisodeBatch(episodes: Array<any>) {
    for (const episodeJson of episodes) {
      addEpisodeToBuffer(episodeJson);
      if (!testing) {
        episodesDir.writeData(
          textEncoder.encode(JSON.stringify(episodeJson, undefined, 1))
        );
      }
      episodesReceived++;
    }
    episodeBatchesReceived++;
    const sinceWorkersStartedMs = performance.now() - workersStartedMs;
    console.log(
      `Seconds per episode: ${decimalFormat.format(
        sinceWorkersStartedMs / 1_000 / episodesReceived
      )}`
    );
  }

  const workers = new Array<worker_threads.Worker>();
  const workerPorts = new Array<worker_threads.MessagePort>();
  for (let i = 0; i < selfPlayWorkerCount; i++) {
    const channel = new worker_threads.MessageChannel();
    channel.port1.on("message", receiveEpisodeBatch);
    const worker = new worker_threads.Worker(selfPlayWorkerScript, {
      workerData: channel.port2,
      transferList: [channel.port2],
    });
    channel.port1.postMessage(encodedModel);
    workers.push(worker);
    workerPorts.push(channel.port1);
  }
  console.log(`Spawned ${selfPlayWorkerCount} self play workers`);

  const evalWorkerChannel = new worker_threads.MessageChannel();
  new worker_threads.Worker(evalWorkerScript, {
    workerData: evalWorkerChannel.port2,
    transferList: [evalWorkerChannel.port2],
  });
  evalWorkerChannel.port1.on("message", async (_) => {
    console.log(`Received completion from eval worker; sending new model`);
    const encodedModel = await model.toJson();
    evalWorkerChannel.port1.postMessage(encodedModel);
    console.log(
      `Main thread memory: ${JSON.stringify(tf.memory(), undefined, 2)}`
    );
  });

  await bufferReady.promise;

  // Kick off first eval loop
  evalWorkerChannel.port1.postMessage(await model.toJson());

  let episodeBatchesBetweenModelUpdates =
    selfPlayWorkerCount * selfPlayBatchesBetweenModelUpdates;
  let episodeBatchesReceivedAtLastModelUpdate = 0;
  let lastSaveTime = performance.now();
  let trailingLosses = List<number>();
  while (true) {
    const beforeBatch = performance.now();
    const batch = buffer.sample(batchSize).map((sample) => {
      return trainingModel.encodeSample(sample);
    });
    const beforeTrain = performance.now();
    const loss = await trainingModel.train(batch);
    const afterTrain = performance.now();
    const totalBatchTime = afterTrain - beforeBatch;
    console.log(
      `Batch time ${decimalFormat.format(
        (100 * (beforeTrain - beforeBatch)) / totalBatchTime
      )}% data prep, ${decimalFormat.format(
        (100 * (afterTrain - beforeTrain)) / totalBatchTime
      )}% training`
    );
    trailingLosses = trailingLosses.push(loss);
    if (trailingLosses.count() > 100) {
      trailingLosses = trailingLosses.shift();
    }
    const trailingLoss =
      trailingLosses.reduce((reduction, next) => reduction + next, 0) /
      trailingLosses.count();
    console.log(`Sliding window loss: ${trailingLoss}`);
    console.log(
      `Training step took ${decimalFormat.format(
        performance.now() - beforeBatch
      )} ms`
    );
    await sleep(0);
    const episodeBatchesReceivedSinceLastModelUpdate =
      episodeBatchesReceived - episodeBatchesReceivedAtLastModelUpdate;
    if (
      episodeBatchesReceivedSinceLastModelUpdate >=
      episodeBatchesBetweenModelUpdates
    ) {
      console.log(
        `Broadcasting updated model after ${episodeBatchesReceived} episode batches`
      );
      episodeBatchesReceivedAtLastModelUpdate = episodeBatchesReceived;
      const encodedModel = await model.toJson();
      for (const port of workerPorts) {
        port.postMessage(encodedModel);
      }
    }
    const now = performance.now();
    const timeSinceLastSave = now - lastSaveTime;
    if (
      modelsDir != undefined &&
      timeSinceLastSave > timeBetweenModelSavesMs &&
      !testing
    ) {
      await modelsDir.write(async (path) => {
        await fs.mkdir(path);
        return saveModel(model, path);
      });
      lastSaveTime = now;
      console.log(
        `Saved model after ${decimalFormat.format(timeSinceLastSave)} ms`
      );
    }
  }
}

async function* loadEpisodesJson(episodesDir: string): AsyncGenerator<any> {
  const files = await fs.readdir(episodesDir);
  let filenameToModeTime = Map<string, number>();
  for (const filename of files) {
    const stat = await fs.stat(episodesDir + "/" + filename);
    filenameToModeTime = filenameToModeTime.set(filename, stat.mtimeMs);
  }
  const filesByDescendingModTime = files.sort(
    (a, b) =>
      requireDefined(filenameToModeTime.get(b)) -
      requireDefined(filenameToModeTime.get(a))
  );
  for (const filename of filesByDescendingModTime) {
    const path = episodesDir + "/" + filename;
    console.log(`Loading episode ${path}`);
    const episodeString = await fs.readFile(path, {
      encoding: "utf8",
    });
    yield JSON.parse(episodeString);
  }
}
