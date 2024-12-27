import {} from "training";
import { evalEpisodeBatch } from "./eval-concurrent.js";
import { loadModelFromFile } from "./model.js";
import { kingdominoExperiment } from "./config.js";

// Runs evaluation batches using eval-concurrent

const modelPath = await kingdominoExperiment.newestModelPath();
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = loadModelFromFile(modelPath);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);

async function main() {
  const result = await evalEpisodeBatch((await model).inferenceModel, episodeCount);
  console.log(JSON.stringify(result.episodeTrainingData[0].encode(), undefined, 1));
}

main();
