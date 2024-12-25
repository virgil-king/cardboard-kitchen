import { ExperimentController } from "training";
import _ from "lodash";
import { Kingdomino } from "kingdomino";
import { kingdominoExperiment } from "./config.js";
import { createModel, saveModel } from "./model.js";

// Top-level script for Kingdomino training

async function main() {
  const model = await createModel(kingdominoExperiment);

  model.logSummary();

  const controller = new ExperimentController(
    Kingdomino.INSTANCE,
    model,
    "./out/self-play-worker.js",
    "./out/eval-worker.js",
    kingdominoExperiment,
    saveModel
  );

  await controller.run();
}

main();
