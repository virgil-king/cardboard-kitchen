import { requireDefined } from "studio-util";
import {} from "training";
import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoModel,
  KingdominoState,
} from "kingdomino";
import * as fs from "node:fs";
import { Map } from "immutable";
import { EpisodeTrainingData } from "training-data";
import { EpisodeSnapshot } from "game";
import { Model } from "mcts";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { loadModelFromFile } from "./model.js";
import { kingdominoExperiment } from "./config.js";

const modelName = "conv3";
const home = process.env.HOME;
const modelsDir = `${home}/ckdata/kingdomino/models/${modelName}/`;
const episodesDir = `${home}/ckdata/kingdomino/games`;
const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

async function main() {
  const model = await createModel();
  const episode = loadEpisode(episodesDir);

  console.log(
    `Current player ID is ${episode.get(0).snapshot.state.currentPlayerId}`
  );

  const inferenceCount = 1000;
  const nonBatchTime = measure(inferenceCount, () => {
    model.inferenceModel.infer([episode.get(0).snapshot]);
  });
  console.log(
    `Non-batch time: ${decimalFormat.format(
      nonBatchTime
    )} ms (${decimalFormat.format(
      nonBatchTime / inferenceCount
    )} ms per inference)`
  );

  const batchTime = measure(1, () => {
    const snapshot = episode.get(0).snapshot;
    model.inferenceModel.infer(
      new Array<EpisodeSnapshot<KingdominoConfiguration, KingdominoState>>(
        inferenceCount
      ).fill(snapshot)
    );
  });
  console.log(
    `Batch time: ${decimalFormat.format(batchTime)} ms (${decimalFormat.format(
      batchTime / inferenceCount
    )} ms per inference)`
  );
}

main();

function measure(count: number, action: () => void): number {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    action();
  }
  const end = performance.now();
  return end - start;
}

function loadEpisode(
  episodesDir: string
): EpisodeTrainingData<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
> {
  const files = fs.readdirSync(episodesDir);
  let filenameToModTime = Map<string, number>();
  for (const filename of files) {
    const stat = fs.statSync(episodesDir + "/" + filename);
    filenameToModTime = filenameToModTime.set(filename, stat.mtimeMs);
  }
  const filesByDescendingModTime = files.sort(
    (a, b) =>
      requireDefined(filenameToModTime.get(b)) -
      requireDefined(filenameToModTime.get(a))
  );
  const path = episodesDir + "/" + filesByDescendingModTime[0];
  console.log(`Loading episode ${path}`);
  const episodeString = fs.readFileSync(path, {
    encoding: "utf8",
  });
  const episodeJson = JSON.parse(episodeString);
  return EpisodeTrainingData.decode(Kingdomino.INSTANCE, episodeJson);
}

async function createModel(): Promise<
  Model<KingdominoConfiguration, KingdominoState, KingdominoAction, any>
> {
  const modelPath = await kingdominoExperiment.newestModelPath();
  if (modelPath == undefined) {
    return freshModel();
  }
  const result = await loadModelFromFile(modelPath);
  console.log(`Loaded model from ${modelPath}`);
  return result;
}

function freshModel() {
  const result = KingdominoModel.fresh();
  console.log("Created randomly initialized model");
  return result;
}
