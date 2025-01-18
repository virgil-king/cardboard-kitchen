import {
  driveAsyncGenerators,
  EpisodeConfiguration,
  Player,
  Players,
  sleep,
} from "game";
import {
  ControllerMessage,
  gumbelSelfPlayEpisode,
  SelfPlayWorkerMessage,
  TypedMessagePort,
} from "training";
import { Kingdomino } from "kingdomino";
import * as worker_threads from "node:worker_threads";
import { Range } from "immutable";
import { mcts } from "agent";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { SELF_PLAY_MCTS_CONFIG, kingdominoExperiment } from "./config.js";
import { createModel } from "./model.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const episodeConfig = new EpisodeConfiguration(players);

const GUMBEL_SIMULATION_COUNT = 32; // 72;
const GUMBEL_ACTION_COUNT = 4; // 8;

const messagePort = new TypedMessagePort<
  SelfPlayWorkerMessage,
  ControllerMessage
>(worker_threads.workerData as worker_threads.MessagePort);

let model = await createModel(kingdominoExperiment);
let newModelAvailable = false;

messagePort.onMessage((message: SelfPlayWorkerMessage) => {
  switch (message.type) {
    case "new_model_available": {
      newModelAvailable = true;
      break;
    }
  }
});

async function main() {
  messagePort.postMessage({
    type: "log",
    message: `TFJS backend is ${tf.getBackend()}`,
  });

  while (true) {
    if (newModelAvailable) {
      model = await createModel(kingdominoExperiment);
      messagePort.postMessage({
        type: "log",
        message: `loaded new model`,
      });
    }

    const mctsContext = {
      config: SELF_PLAY_MCTS_CONFIG,
      game: Kingdomino.INSTANCE,
      model: model.inferenceModel,
      stats: new mcts.MctsStats(),
    };

    const generators = Range(0, kingdominoExperiment.selfPlayEpisodesPerBatch)
      .map(() => {
        return gumbelSelfPlayEpisode(
          Kingdomino.INSTANCE,
          mctsContext,
          episodeConfig,
          GUMBEL_SIMULATION_COUNT,
          GUMBEL_ACTION_COUNT
        );
      })
      .toArray();

    const episodes = await driveAsyncGenerators(generators, (snapshots) => {
      const startMs = performance.now();
      const result = model.inferenceModel.infer(snapshots);
      mctsContext.stats.inferenceTimeMs += performance.now() - startMs;
      return result;
    });

    messagePort.postMessage({
      type: "episode_batch",
      batch: episodes.map((episode) => episode.encode()),
    });

    messagePort.postMessage({
      type: "log",
      message: `memory: ${JSON.stringify(tf.memory(), undefined, 2)}`,
    });

    await sleep(0);
  }
}

main();
