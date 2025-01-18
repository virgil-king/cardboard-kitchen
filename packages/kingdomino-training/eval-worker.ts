import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { KingdominoModel } from "kingdomino-agent";
import { Range } from "immutable";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { kingdominoExperiment } from "./config.js";
import { ModelMetadata } from "agent";
import {
  ControllerMessage,
  EvalWorkerMessage,
  LogDirectory,
  TypedMessagePort,
} from "training";
import { AgentResult, evalEpisodeBatch } from "./eval-concurrent-2.js";
import gzip from "node-gzip";
import { SettablePromise } from "game";
import { createModel } from "./model.js";

// No more than one eval worker should run at a time since this code
// assumes it's the only writer to the log file and eval episodes
// directory

const messagePort = new TypedMessagePort<EvalWorkerMessage, ControllerMessage>(
  worker_threads.workerData as worker_threads.MessagePort
);

let modelNumber = 0;

const logFilePath = await kingdominoExperiment.logFile();

const episodesPath = await kingdominoExperiment.evalEpisodesDirectory();
const episodesDir = new LogDirectory(
  episodesPath,
  kingdominoExperiment.evalMaxEpisodeBytes
);

export type EvalLogEntry = {
  time: string;
  results: [string, AgentResult][];
  modelMetadata?: ModelMetadata;
};

let log: Array<EvalLogEntry>;

try {
  log = JSON.parse(
    fs.readFileSync(logFilePath, {
      encoding: "utf-8",
    })
  );
} catch (e) {
  log = new Array<EvalLogEntry>();
}

/**
 * A box that can hold a value and allows a caller to wait for and consume
 * the current or next value. Equivalent to a semaphore with one permit plus
 * a variable.
 */
class Rendezvous<T> {
  value: T | undefined;
  promise: SettablePromise<T> | undefined;
  constructor(initialValue?: T) {
    this.value = initialValue;
  }
  set(value: T) {
    if (this.promise != undefined) {
      this.promise.fulfill(value);
      this.promise = undefined;
    } else {
      this.value = value;
    }
  }
  consume(): Promise<T> {
    if (this.value != undefined) {
      const result = Promise.resolve(this.value);
      this.value = undefined;
      return result;
    }
    if (this.promise == undefined) {
      this.promise = new SettablePromise<T>();
    }
    return this.promise.promise;
  }
}

const newModelAvailable = new Rendezvous<boolean>();

messagePort.onMessage(async (message) => {
  switch (message.type) {
    case "new_model_available":
      newModelAvailable.set(true);
      break;
    default:
      messagePort.postMessage({
        type: "log",
        message: `Unexpected message type ${message.type}`,
      });
  }
});

async function main() {
  while (true) {
    await newModelAvailable.consume();
    const model = await createModel(kingdominoExperiment);
    messagePort.postMessage({ type: "log", message: "loaded new model" });
    await evaluate(model);
  }
}

async function evaluate(model: KingdominoModel) {
  console.log(`Eval TFJS backend is ${tf.getBackend()}`);
  const date = new Date();
  const agentIdToResult = new Map<string, AgentResult>();
  for (const i of Range(0, kingdominoExperiment.evalBatchCount)) {
    const batchResult = await evalEpisodeBatch(
      model.inferenceModel,
      kingdominoExperiment.evalEpisodesPerBatch
    );
    for (const [agentId, result] of batchResult.agentIdToResult.entries()) {
      let cumulativeResult = agentIdToResult.get(agentId);
      if (cumulativeResult == undefined) {
        cumulativeResult = { value: 0, timeMs: 0 };
        agentIdToResult.set(agentId, cumulativeResult);
      }
      cumulativeResult.value +=
        result.value / kingdominoExperiment.evalBatchCount;
      cumulativeResult.timeMs += result.timeMs;
    }

    for (const episode of batchResult.episodeTrainingData) {
      const episodeString = JSON.stringify(episode.encode(), undefined, 2);
      const episodeBlob = await gzip.gzip(episodeString);
      episodesDir.writeData(episodeBlob);
    }
  }

  const logEntry = {
    time: date.toISOString(),
    results: [...agentIdToResult.entries()],
    modelMetadata: model.metadata,
  } satisfies EvalLogEntry;
  log.push(logEntry);
  const logString = JSON.stringify(log, undefined, 4);
  fs.writeFileSync(logFilePath, logString);

  messagePort.postMessage({
    type: "log",
    message: `completed evaluation for "${model.description}": ${JSON.stringify(
      logEntry,
      undefined,
      2
    )}`,
  });

  messagePort.postMessage({
    type: "log",
    message: `memory: ${JSON.stringify(tf.memory(), undefined, 2)}`,
  });
}

main();
