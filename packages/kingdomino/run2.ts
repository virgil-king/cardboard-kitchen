import { train_parallel, Model } from "training";
import { Kingdomino } from "./kingdomino.js";
import _ from "lodash";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoAction } from "./action.js";
import { KingdominoState } from "./state.js";
import { newestModelPath } from "training";

const batchSize = 1024;
const sampleBufferSize = batchSize * 1024;

const modelName = "conv2";
const home = process.env.HOME;

async function main() {
  const model = await createModel();

  const modelsDir = `${home}/models/kingdomino/${modelName}/${new Date().toISOString()}`;
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
  const modelPath = newestModelPath("kingdomino", "conv2");
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
