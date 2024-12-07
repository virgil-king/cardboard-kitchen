import {} from "training";
import { evalEpisodeBatch } from "./eval-concurrent.js";
import { loadModelFromFile } from "./model.js";
import { kingdominoConv7 } from "./config.js";

const modelPath = await kingdominoConv7.newestModelPath();
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = loadModelFromFile(modelPath);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);

async function main() {
  evalEpisodeBatch((await model).inferenceModel, episodeCount);
}

main();
