import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { Range } from "immutable";
import { evalEpisodeBatch, EvalResult } from "./eval-concurrent.js";
import { EVAL_BATCHES, EVAL_EPISODES_PER_BATCH } from "./config.js";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let modelNumber = 0;

const home = process.env.HOME;
const logsDir = `${home}/ckdata/kingdomino/logs`;
fs.mkdirSync(logsDir, { recursive: true });
const logFilePath = `${logsDir}/${new Date().toISOString()}`;

type EvalLogEntry = {
  time: string;
  results: EvalResult;
};

const log = new Array<EvalLogEntry>();

let evalsInProgress = 0;

messagePort.on("message", async (message: any) => {
  evalsInProgress++;
  const date = new Date();
  const newModel = await KingdominoConvolutionalModel.fromJson(message);
  modelNumber++;
  console.log(`Eval worker received model #${modelNumber}`);

  let subjectPoints = 0;
  let baselinePoints = 0;
  for (const i of Range(0, EVAL_BATCHES)) {
    const batchResult = evalEpisodeBatch(
      newModel.inferenceModel,
      EVAL_EPISODES_PER_BATCH
    );
    subjectPoints += batchResult.subjectPoints;
    baselinePoints += batchResult.baselinePoints;
    console.log(`Eval completed batch ${i}`);
  }

  const logEntry = {
    time: date.toISOString(),
    results: {
      subjectPoints: subjectPoints,
      baselinePoints: baselinePoints,
    },
  } satisfies EvalLogEntry;
  log.push(logEntry);
  const logString = JSON.stringify(log, undefined, 4);
  console.log(`Eval worker completed batch for ${modelNumber}: ${JSON.stringify(logEntry)}`);
  fs.writeFileSync(logFilePath, logString);
  evalsInProgress--;
  if (evalsInProgress > 0) {
    console.log(`${evalsInProgress} evals in progress`);
  }

  messagePort.postMessage(undefined);
});
