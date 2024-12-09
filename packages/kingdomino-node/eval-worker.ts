import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { KingdominoModel } from "kingdomino";
import { Range } from "immutable";
import { evalEpisodeBatch } from "./eval-concurrent.js";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { kingdominoConv7 } from "./config.js";
import { ModelCodecType, ModelMetadata } from "mcts";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let modelNumber = 0;

const logFilePath = await kingdominoConv7.logFile();

type EvalLogEntry = {
  time: string;
  subjectPoints: number;
  baselinePoints: number;
  modelMetadata?: ModelMetadata;
};

const log = new Array<EvalLogEntry>();

let evalsInProgress = 0;

messagePort.on("message", async (message: any) => {
  evalsInProgress++;
  const typedMessage = message as ModelCodecType;
  const model = await KingdominoModel.fromJson(typedMessage);
  modelNumber++;
  console.log(
    `Eval worker model #${modelNumber} with metadata ${JSON.stringify(
      model.metadata
    )}`
  );

  try {
    await evaluate(model);
  } finally {
    model.dispose();
  }

  messagePort.postMessage(undefined);
});

async function evaluate(model: KingdominoModel) {
  const date = new Date();
  let subjectPoints = 0;
  let baselinePoints = 0;
  for (const i of Range(0, kingdominoConv7.evalBatchCount)) {
    const batchResult = await evalEpisodeBatch(
      model.inferenceModel,
      kingdominoConv7.evalEpisodesPerBatch
    );
    console.log(
      `Eval thread memory: ${JSON.stringify(tf.memory(), undefined, 2)}`
    );
    subjectPoints += batchResult.subjectPoints;
    baselinePoints += batchResult.baselinePoints;
    console.log(`Eval completed batch ${i}`);
    const totalTimeMs = batchResult.subjectTimeMs + batchResult.baselineTimeMs;
    console.log(
      `Subject time: ${Math.round(batchResult.subjectTimeMs)}ms (${Math.round(
        (100 * batchResult.subjectTimeMs) / totalTimeMs
      )}%)`
    );
    console.log(
      `Baseline time: ${Math.round(batchResult.baselineTimeMs)}ms (${Math.round(
        (100 * batchResult.baselineTimeMs) / totalTimeMs
      )}%)`
    );
  }

  const logEntry = {
    time: date.toISOString(),
    subjectPoints: subjectPoints,
    baselinePoints: baselinePoints,
    modelMetadata: model.metadata,
  } satisfies EvalLogEntry;
  log.push(logEntry);
  const logString = JSON.stringify(log, undefined, 4);
  console.log(
    `Eval worker completed batch for ${modelNumber}: ${JSON.stringify(
      logEntry
    )}`
  );
  fs.writeFileSync(logFilePath, logString);
  evalsInProgress--;
  if (evalsInProgress > 0) {
    console.log(`${evalsInProgress} evals in progress`);
  }
}
