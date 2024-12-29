import { KingdominoModel } from "kingdomino-agent";
import * as tf from "@tensorflow/tfjs-node-gpu";
import fs from "node:fs/promises";
import { ModelMetadata, modelMetadataCodec } from "agent";
import { Experiment } from "training";
import { decodeOrThrow } from "game";

export async function createModel(
  experiment: Experiment
): Promise<KingdominoModel> {
  const modelPath = await experiment.newestModelPath();
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

/**
 * @param path path to the directory containing the model files
 */
export async function loadModelFromFile(
  path: string
): Promise<KingdominoModel> {
  console.log(`Loading model from ${path}`);
  const layersModel = await tf.loadLayersModel(`file://${path}/model.json`);
  console.log(
    `Input shape is ${(layersModel.input as tf.SymbolicTensor[]).map(
      (t) => t.shape
    )}`
  );

  const metadata = await loadMetadata(path);
  return new KingdominoModel(layersModel, metadata);
}

async function loadMetadata(dir: string): Promise<ModelMetadata | undefined> {
  try {
    const metadataJson = await fs.readFile(`${dir}/metadata.json`, {
      encoding: "utf-8",
    });
    const result = decodeOrThrow(modelMetadataCodec, JSON.parse(metadataJson));
    console.log(`Loaded model metadata ${JSON.stringify(result)}`);
    return result;
  } catch (e) {
    console.log(`Error loading model metadata: ${e}`);
    return undefined;
  }
}

export async function saveModel(model: KingdominoModel, path: string) {
  await model.model.save(`file://${path}`);
  if (model.metadata != undefined) {
    await fs.writeFile(
      `${path}/metadata.json`,
      JSON.stringify(model.metadata, undefined, 2),
      { flag: "w" }
    );
  }
}
