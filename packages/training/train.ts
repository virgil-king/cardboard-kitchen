import {
  Action,
  Game,
  GameConfiguration,
  GameState,
  requireDefined,
  SettablePromise,
  sleep,
} from "game";
import { List, Map } from "immutable";
import { Model, TrainingModel } from "agent/model.js";
import { EpisodeBuffer } from "./episodebuffer.js";
import * as worker_threads from "node:worker_threads";
import fs from "node:fs/promises";
import { EpisodeTrainingData, StateTrainingData } from "agent";
import { LogDirectory } from "./logdirectory.js";
import * as tf from "@tensorflow/tfjs";
import gzip from "node-gzip";
import zlib from "node:zlib";

// This file provides the logic for the main thread of the training system

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
    EpisodeTrainingData<C, S, A>
  >(sampleBufferSize);

  const bufferReady = new SettablePromise<undefined>();

  function addEpisodeToBuffer(message: any): EpisodeTrainingData<C, S, A> {
    const decoded = EpisodeTrainingData.decode(game, message);
    buffer.addEpisode(decoded);
    if (buffer.sampleCount() >= batchSize) {
      bufferReady.fulfill(undefined);
    }
    return decoded;
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
  let samplesReceived = 0;

  const workersStartedMs = performance.now();
  function receiveEpisodeBatch(episodes: Array<any>) {
    for (const episodeJson of episodes) {
      const decoded = addEpisodeToBuffer(episodeJson);
      if (!testing) {
        const episodeString = JSON.stringify(episodeJson, undefined, 1);
        const episodeBlob = zlib.gzipSync(episodeString);
        episodesDir.writeData(episodeBlob);
      }
      episodesReceived++;
      samplesReceived += decoded.count();
    }
    episodeBatchesReceived++;
    const sinceWorkersStartedMs = performance.now() - workersStartedMs;
    console.log(
      `Received self-play batch; seconds per episode: ${decimalFormat.format(
        sinceWorkersStartedMs / 1_000 / episodesReceived
      )}`
    );
    const elapsed = performance.now() - workersStartedMs;
    console.log(
      `Samples generated per second: ${samplesReceived / (elapsed / 1000)}`
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

  const trainingStartedMs = performance.now();
  let trainedSampleCount = 0;

  let batch = sampleBatch(game, buffer, trainingModel, batchSize);
  while (true) {
    const beforeStep = performance.now();
    const stepResult = await generateBatchAndTrain(
      game,
      buffer,
      trainingModel,
      batch
    );
    batch = stepResult.batch;
    const loss = stepResult.loss;
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
        performance.now() - beforeStep
      )} ms`
    );
    trainedSampleCount += batch.length;
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
      console.log(
        `Main thread memory: ${JSON.stringify(tf.memory(), undefined, 2)}`
      );
      const elapsed = performance.now() - trainingStartedMs;
      console.log(
        `Samples trained per second: ${trainedSampleCount / (elapsed / 1000)}`
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
    yield await readGzippedJson(path);
  }
}

async function readGzippedJson(path: string): Promise<any> {
  const compressedBytes = await fs.readFile(path);
  const decompressedBytes = await gzip.ungzip(compressedBytes);
  return JSON.parse(decompressedBytes.toString("utf-8"));
}

type StepResult<T> = {
  loss: number;
  batch: ReadonlyArray<T>;
};

function sampleBatch<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT
>(
  game: Game<C, S, A>,
  buffer: EpisodeBuffer<
    StateTrainingData<C, S, A>,
    EpisodeTrainingData<C, S, A>
  >,
  trainingModel: TrainingModel<C, S, A, EncodedSampleT>,
  batchSize: number
): ReadonlyArray<EncodedSampleT> {
  const batch = buffer.sample(batchSize, (sample) => {
    const result = iterableLengthAtLeast(game.legalActions(sample.snapshot), 2);
    return result;
  });
  return batch.map((sample) => {
    return trainingModel.encodeSample(sample);
  });
}

function iterableLengthAtLeast(
  iterable: Iterable<unknown>,
  count: number
): boolean {
  let visitedCount = 0;
  for (const item of iterable) {
    visitedCount++;
    if (visitedCount >= count) {
      return true;
    }
  }
  return false;
}

/**
 * Concurrently trains {@link model} on {@link batch} and samples a new batch
 */
async function generateBatchAndTrain<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT
>(
  game: Game<C, S, A>,
  buffer: EpisodeBuffer<
    StateTrainingData<C, S, A>,
    EpisodeTrainingData<C, S, A>
  >,
  trainingModel: TrainingModel<C, S, A, EncodedSampleT>,
  batch: ReadonlyArray<EncodedSampleT>
) {
  const trainingResult = trainingModel.train(batch);
  const batchStart = performance.now();
  const newBatch = sampleBatch(game, buffer, trainingModel, batch.length);
  console.log(`Batch preparation took ${performance.now() - batchStart} ms`);
  return {
    loss: await trainingResult,
    batch: newBatch,
  } as StepResult<EncodedSampleT>;
}
