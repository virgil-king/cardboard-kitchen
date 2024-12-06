import { train_parallel, modelsDirectory } from "training";
import _ from "lodash";
import {
  Kingdomino,
} from "kingdomino";
import { LogDirectory } from "training";
import {
  SELF_PLAY_WORKER_COUNT,
  TRAINING_BATCH_SIZE,
  TRAINING_MAX_EPISODE_BYTES,
  TRAINING_MAX_MODEL_BYTES,
  TRAINING_SAMPLE_BUFFER_SIZE,
} from "./config.js";
import { createModel, saveModel } from "./model.js";

// Top-level script for Kingdomino training

const modelName = "test";
const home = process.env.HOME;

async function main() {
  const model = await createModel(modelName);

  model.logSummary();

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
    saveModel,
    episodesDir
  );
}

main();
