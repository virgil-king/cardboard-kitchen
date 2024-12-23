import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { KingdominoModel } from "kingdomino";
import { Range } from "immutable";
import { AgentResult, evalEpisodeBatch } from "./eval-concurrent.js";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { kingdominoConv7 } from "./config.js";
import { ModelCodecType, ModelMetadata } from "mcts";
import { LogDirectory } from "training";

// No more than one eval worker should run at a time since this code
// assumes it's the only writer to the log file and eval episodes
// directory

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let modelNumber = 0;

const logFilePath = await kingdominoConv7.logFile();

const episodesPath = await kingdominoConv7.evalEpisodesDirectory();
const episodesDir = new LogDirectory(
  episodesPath,
  kingdominoConv7.evalMaxEpisodeBytes
);
const textEncoder = new TextEncoder();

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
  console.log(`Loaded ${log.length} existing logs`);
} catch (e) {
  console.log(`Error loading prior logs: ${e}`);
  log = new Array<EvalLogEntry>();
}

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
  const agentIdToResult = new Map<string, AgentResult>();
  for (const i of Range(0, kingdominoConv7.evalBatchCount)) {
    const batchResult = await evalEpisodeBatch(
      model.inferenceModel,
      kingdominoConv7.evalEpisodesPerBatch
    );
    for (const [agentId, result] of batchResult.agentIdToResult.entries()) {
      let cumulativeResult = agentIdToResult.get(agentId);
      if (cumulativeResult == undefined) {
        cumulativeResult = { value: 0, timeMs: 0 };
        agentIdToResult.set(agentId, cumulativeResult);
      }
      cumulativeResult.value += result.value;
      cumulativeResult.timeMs += result.timeMs;
    }
    console.log(
      `Eval thread memory: ${JSON.stringify(tf.memory(), undefined, 2)}`
    );

    for (const episode of batchResult.episodeTrainingData) {
      episodesDir.writeData(
        textEncoder.encode(JSON.stringify(episode.toJson(), undefined, 2))
      );
    }
  }

  const logEntry = {
    time: date.toISOString(),
    results: [...agentIdToResult.entries()],
    modelMetadata: model.metadata,
  } satisfies EvalLogEntry;
  log.push(logEntry);
  const logString = JSON.stringify(log, undefined, 4);
  console.log(
    `Eval worker completed batch for ${modelNumber}: ${JSON.stringify(
      logEntry,
      undefined,
      2
    )}`
  );
  fs.writeFileSync(logFilePath, logString);

  evalsInProgress--;
  if (evalsInProgress > 0) {
    console.log(`${evalsInProgress} evals in progress`);
  }
}
