import {
  Action,
  Game,
  GameConfiguration,
  GameState,
  requireDefined,
  SettablePromise,
} from "game";
import { List, Map } from "immutable";
import { ModelEncoder, TransferableBatch } from "agent/model.js";
import { EpisodeBuffer } from "./episodebuffer.js";
import * as worker_threads from "node:worker_threads";
import fs from "node:fs/promises";
import { EpisodeTrainingData, StateTrainingData } from "agent";
import { LogDirectory } from "./logdirectory.js";
import gzip from "node-gzip";
import zlib from "node:zlib";
import {
  ControllerMessage,
  createPorts,
  EvalWorkerMessage,
  LogMessage,
  NewModelAvailableMessage,
  SelfPlayWorkerMessage,
  TrainingWorkerMessage,
  TypedMessagePort,
} from "./messaging.js";

// This file provides the logic for the main thread of the training system.
// The main thread is response for preparing training batches, collecting
// and saving self-play episodes, and distributing messages between workers.

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const saveSelfPlayEpisodes = true;

/**
 * @param batchSize number of state samples to use per batch
 */
export async function train_parallel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  T extends TransferableBatch
>(
  game: Game<C, S, A>,
  encoder: ModelEncoder<C, S, A, T>,
  batchSize: number,
  sampleBufferSize: number,
  trainingWorkerScript: string,
  selfPlayWorkerScript: string,
  selfPlayWorkerCount: number,
  evalWorkerScript: string,
  episodesDir: LogDirectory
) {
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
  log(
    `loaded ${initialEpisodeCount} episodes; sample buffer size is ${buffer.sampleCount()} with maximum ${sampleBufferSize}`
  );

  let samplesReceived = 0;
  let episodesReceived = 0;
  const workersStartedMs = performance.now();
  function receiveEpisodeBatch(episodes: ReadonlyArray<any>) {
    for (const episodeJson of episodes) {
      const decoded = addEpisodeToBuffer(episodeJson);
      if (saveSelfPlayEpisodes) {
        const episodeString = JSON.stringify(episodeJson, undefined, 1);
        const episodeBlob = zlib.gzipSync(episodeString);
        episodesDir.writeData(episodeBlob);
      }
      episodesReceived++;
      samplesReceived += decoded.count();
    }
    const elapsed = performance.now() - workersStartedMs;
    log(
      `received self-play batch; samples generated per second: ${
        samplesReceived / (elapsed / 1000)
      }`
    );
  }

  const selfPlayWorkerPorts = new Array<
    TypedMessagePort<ControllerMessage, SelfPlayWorkerMessage>
  >();
  for (let i = 0; i < selfPlayWorkerCount; i++) {
    const ports = createPorts<ControllerMessage, SelfPlayWorkerMessage>();
    ports.localPort.onMessage((message) => {
      switch (message.type) {
        case "episode_batch": {
          receiveEpisodeBatch(message.batch);
          break;
        }
        case "log": {
          handleLogMessage(`self-play worker #${i}`, message);
          break;
        }
        default:
          log(`unsupported message type ${message.type}`);
      }
    });
    new worker_threads.Worker(selfPlayWorkerScript, {
      workerData: ports.remotePort,
      transferList: [ports.remotePort],
    });
    selfPlayWorkerPorts.push(ports.localPort);
  }
  log(`spawned ${selfPlayWorkerCount} self play workers`);

  const evalWorkerPorts = createPorts<ControllerMessage, EvalWorkerMessage>();
  new worker_threads.Worker(evalWorkerScript, {
    workerData: evalWorkerPorts.remotePort,
    transferList: [evalWorkerPorts.remotePort],
  });
  evalWorkerPorts.localPort.onMessage((message) => {
    switch (message.type) {
      case "log": {
        handleLogMessage("eval worker", message);
        break;
      }
      default:
        log(`Unexpected message type ${message.type}`);
        break;
    }
  });

  // Don't start the training worker until we have a sufficient sample buffer,
  // to avoid having to handle batch requests when we can't produce a batch
  await bufferReady.promise;

  // Training worker
  let samplesTrained = 0;
  let trailingLosses = List<number>();
  const start = performance.now();
  let lastBatchCompletionReceived = start;
  const trainingWorkerPorts = createPorts<
    ControllerMessage,
    TrainingWorkerMessage<T>
  >();
  new worker_threads.Worker(trainingWorkerScript, {
    workerData: trainingWorkerPorts.remotePort,
    transferList: [trainingWorkerPorts.remotePort],
  });
  trainingWorkerPorts.localPort.onMessage((message: ControllerMessage) => {
    switch (message.type) {
      case "log": {
        handleLogMessage(`training worker`, message);
        break;
      }
      case "batch_request": {
        const batch = sampleBatch(buffer, encoder, batchSize);
        trainingWorkerPorts.localPort.postMessage(
          { type: "training_batch", batch },
          batch.transfers
        );
        break;
      }
      case "training_batch_complete": {
        samplesTrained += batchSize;
        const now = performance.now();
        const batchElapsed = now - lastBatchCompletionReceived;
        lastBatchCompletionReceived = now;
        const totalElapsed = now - start;
        const overallLoss = message.loss[0];
        trailingLosses = trailingLosses.push(overallLoss);
        if (trailingLosses.count() > 100) {
          trailingLosses = trailingLosses.shift();
        }
        const trailingLoss =
          trailingLosses.reduce((reduction, next) => reduction + next, 0) /
          trailingLosses.count();
        log(
          `training batch complete:\ntime: ${Math.round(
            batchElapsed
          )} ms\nlosses: ${JSON.stringify(
            message.loss
          )}\nsliding window loss: ${trailingLoss}\nsamples trained per second: ${decimalFormat.format(
            samplesTrained / (totalElapsed / 1000)
          )}\n`
        );
        break;
      }
      case "new_model_available": {
        const message = {
          type: "new_model_available",
        } satisfies NewModelAvailableMessage;
        for (const port of selfPlayWorkerPorts) {
          port.postMessage(message);
        }
        evalWorkerPorts.localPort.postMessage(message);
        break;
      }
      default:
        log(`unsupported message type ${message.type}`);
    }
  });
}

function handleLogMessage(workerLabel: string, message: LogMessage) {
  log(`${workerLabel}: ${message.message}`);
}

function log(message: string) {
  console.log(`${new Date().toISOString()}: ${message}`);
}

async function* loadEpisodesJson(episodesDir: string): AsyncGenerator<any> {
  const files = await fs.readdir(episodesDir);
  let filenameToModTime = Map<string, number>();
  for (const filename of files) {
    const stat = await fs.stat(episodesDir + "/" + filename);
    filenameToModTime = filenameToModTime.set(filename, stat.mtimeMs);
  }
  const filesByDescendingModTime = files.sort(
    (a, b) =>
      requireDefined(filenameToModTime.get(b)) -
      requireDefined(filenameToModTime.get(a))
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

function sampleBatch<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  T extends TransferableBatch
>(
  buffer: EpisodeBuffer<
    StateTrainingData<C, S, A>,
    EpisodeTrainingData<C, S, A>
  >,
  encoder: ModelEncoder<C, S, A, T>,
  batchSize: number
): T {
  const samples = buffer.sample(batchSize);
  return encoder.encodeTrainingBatch(samples);
}
