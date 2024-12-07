import { ExperimentController } from "training";
import _ from "lodash";
import { Kingdomino } from "kingdomino";
import { kingdominoConv7 } from "./config.js";
import { createModel, saveModel } from "./model.js";

// Top-level script for Kingdomino training

async function main() {
  const model = await createModel(kingdominoConv7);

  model.logSummary();

  const controller = new ExperimentController(
    Kingdomino.INSTANCE,
    model,
    "./out/self-play-worker.js",
    "./out/eval-worker.js",
    kingdominoConv7,
    saveModel
  );

  await controller.run();
}

main();
