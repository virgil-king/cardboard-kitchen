import { newestModelPath } from "training";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { evalEpisodeBatch } from "./eval-concurrent.js";

const modelPath = newestModelPath("kingdomino", "conv3");
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = KingdominoConvolutionalModel.load(modelPath);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);


async function main() {
  evalEpisodeBatch((await model).inferenceModel, episodeCount);
}

main();
