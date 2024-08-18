import { train_parallel, Model, modelsDirectory } from "training";
import { Kingdomino } from "./kingdomino.js";
import _ from "lodash";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoAction } from "./action.js";
import { KingdominoState } from "./state.js";
import { newestModelPath } from "training";

const batchSize = 128;
const sampleBufferSize = 1024 * 1024;

const modelName = "conv3";
const home = process.env.HOME;

async function main() {
  const model = await createModel();

  const modelsDir = modelsDirectory("kingdomino", modelName);
  const episodesDir = `${home}/ckdata/kingdomino/games`;

  train_parallel(
    Kingdomino.INSTANCE,
    model,
    batchSize,
    sampleBufferSize,
    "./out/worker.js",
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
