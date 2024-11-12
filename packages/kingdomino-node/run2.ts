import { train_parallel, modelsDirectory } from "training";
import _ from "lodash";
import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoModel,
  KingdominoState,
  SELF_PLAY_WORKER_COUNT,
  TRAINING_BATCH_SIZE,
  TRAINING_MAX_EPISODE_BYTES,
  TRAINING_MAX_MODEL_BYTES,
  TRAINING_SAMPLE_BUFFER_SIZE,
} from "kingdomino";
import { newestModelPath, LogDirectory } from "training";
import { Model } from "mcts";
import * as tf from "@tensorflow/tfjs-node-gpu";

// Top-level script for Kingdomino training

const modelName = "conv6";
const home = process.env.HOME;

async function main() {
  const model = await createModel();

  const modelsDirPath = modelsDirectory("kingdomino", modelName);
  const modelsDir = new LogDirectory(modelsDirPath, TRAINING_MAX_MODEL_BYTES);

  const episodesDirPath = `${home}/ckdata/kingdomino/games`;
  const episodesDir = new LogDirectory(
    episodesDirPath,
    TRAINING_MAX_EPISODE_BYTES
  );

  train_parallel(
    Kingdomino.INSTANCE,
    model,
    TRAINING_BATCH_SIZE,
    TRAINING_SAMPLE_BUFFER_SIZE,
    "./out/self-play-worker.js",
    SELF_PLAY_WORKER_COUNT,
    "./out/eval-worker.js",
    modelsDir,
    episodesDir
  );
}

async function createModel(): Promise<
  Model<KingdominoConfiguration, KingdominoState, KingdominoAction, any>
> {
  const modelPath = newestModelPath("kingdomino", modelName);
  if (modelPath == undefined) {
    return freshModel();
  }
  const result = await KingdominoModel.load(modelPath, tf);
  console.log(`Loaded model from ${modelPath}`);
  return result;
}

function freshModel() {
  const result = KingdominoModel.fresh(tf);
  console.log("Created randomly initialized model");
  return result;
}

main();
