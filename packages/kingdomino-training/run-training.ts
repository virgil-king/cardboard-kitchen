import { ExperimentController } from "training";
import _ from "lodash";
import { Kingdomino } from "kingdomino";
import { kingdominoExperiment } from "./config.js";
import { KingdominoModelEncoder } from "kingdomino-agent";

// Top-level script for Kingdomino training

async function main() {
  const controller = new ExperimentController(
    Kingdomino.INSTANCE,
    KingdominoModelEncoder.INSTANCE,
    "./out/training-worker.js",
    "./out/self-play-worker.js",
    "./out/eval-worker.js",
    kingdominoExperiment
  );

  await controller.run();
}

main();
