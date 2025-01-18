import { requireDefined, SettablePromise } from "game";
import {
  BatchRequestMessage,
  ControllerMessage,
  LogDirectory,
  TrainingWorkerMessage,
  TypedMessagePort,
} from "training";
import * as worker_threads from "node:worker_threads";
import { kingdominoExperiment } from "./config.js";
import { KingdominoTransferableBatch } from "kingdomino-agent";
import { createModel, saveModel } from "./model.js";
import * as tf from "@tensorflow/tfjs-node-gpu";
import * as fs from "node:fs/promises";

const saveModels = true;
const timeBetweenModelSavesMs = 30 * 60 * 1_000;

const messagePort = new TypedMessagePort<
  TrainingWorkerMessage<KingdominoTransferableBatch>,
  ControllerMessage
>(worker_threads.workerData as worker_threads.MessagePort);

const model = await createModel(kingdominoExperiment);
const trainingModel = model.trainingModel(
  kingdominoExperiment.trainingBatchSize
);

const modelsDir = new LogDirectory(
  await kingdominoExperiment.modelsDirectory(),
  kingdominoExperiment.trainingMaxModelBytes
);

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

class Queue<T> {
  readonly items = new Array<T>();
  readonly promises = new Array<SettablePromise<T>>();
  add(item: T) {
    if (this.promises.length > 0) {
      const promise = requireDefined(this.promises.shift());
      promise.fulfill(item);
    } else {
      this.items.push(item);
    }
  }
  /**
   * Returns a {@link Promise} which will receive the next value emitted by the queue
   */
  next(): Promise<T> {
    const promise = new SettablePromise<T>();
    if (this.items.length > 0) {
      promise.fulfill(requireDefined(this.items.shift()));
    } else {
      this.promises.push(promise);
    }
    return promise.promise;
  }
}

const batchQueue = new Queue<KingdominoTransferableBatch>();

messagePort.onMessage((message) => {
  batchQueue.add(message.batch);
});

async function main() {
  messagePort.postMessage({
    type: "log",
    message: `TFJS backend is ${tf.getBackend()}`,
  });

  // Initial request
  messagePort.postMessage({ type: "batch_request" } as BatchRequestMessage);

  let lastSaveTime = performance.now();

  while (true) {
    const batch = await batchQueue.next();
    // Request another batch in parallel with processing the previous batch
    messagePort.postMessage({ type: "batch_request" } as BatchRequestMessage);
    const loss = await trainingModel.train(batch);
    messagePort.postMessage({
      type: "training_batch_complete",
      loss: loss,
    });

    const now = performance.now();
    const timeSinceLastSave = now - lastSaveTime;
    if (modelsDir != undefined && timeSinceLastSave > timeBetweenModelSavesMs) {
      if (saveModels) {
        await modelsDir.write(async (path) => {
          await fs.mkdir(path);
          return saveModel(model, path);
        });
      }
      lastSaveTime = now;
      messagePort.postMessage({
        type: "log",
        message: `saved model after ${decimalFormat.format(
          timeSinceLastSave
        )} ms`,
      });
      messagePort.postMessage({ type: "new_model_available" });
    }
  }
}

main();
