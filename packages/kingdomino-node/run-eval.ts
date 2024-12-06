import { newestModelPath } from "training";
import { KingdominoModel } from "kingdomino";
import { evalEpisodeBatch } from "./eval-concurrent.js";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { loadModelFromFile } from "./model.js";

const modelPath = newestModelPath("kingdomino", "conv3");
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
