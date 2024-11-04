import { train_parallel, Model, modelsDirectory } from "training";
import { Kingdomino } from "./kingdomino.js";
import _ from "lodash";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoAction } from "./action.js";
import { KingdominoState } from "./state.js";
import { newestModelPath, LogDirectory } from "training";
import {
  SELF_PLAY_WORKER_COUNT,
  TRAINING_BATCH_SIZE,
  TRAINING_MAX_EPISODE_BYTES,
  TRAINING_MAX_MODEL_BYTES,
  TRAINING_SAMPLE_BUFFER_SIZE,
} from "./config.js";

const modelName = "conv4";
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
  const result = await KingdominoConvolutionalModel.load(modelPath);
  console.log(`Loaded model from ${modelPath}`);
  return result;
}

function freshModel() {
  const result = KingdominoConvolutionalModel.fresh();
  console.log("Created randomly initialized model");
  return result;
}

main();
