import {
  SettablePromise,
  driveAsyncGenerators,
  requireDefined,
  sleep,
} from "studio-util";
import { EpisodeConfiguration, Player, Players } from "game";
import { gumbelSelfPlayEpisode } from "training";
import { Kingdomino, KingdominoModel } from "kingdomino";
import * as worker_threads from "node:worker_threads";
import { Range } from "immutable";
import { mcts, ModelCodecType } from "mcts";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { SELF_PLAY_MCTS_CONFIG, kingdominoExperiment } from "./config.js";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let model: KingdominoModel | undefined;

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const episodeConfig = new EpisodeConfiguration(players);

const ready = new SettablePromise<undefined>();

messagePort.on("message", async (message: any) => {
  const typedMessage = message as ModelCodecType;
  const newModel = await KingdominoModel.fromJson(typedMessage);
  model?.dispose();
  model = newModel;
  console.log(
    `Self-play worker received new model with metadata ${JSON.stringify(
      newModel.metadata
    )}`
  );
  ready.fulfill(undefined);
});

async function main() {
  await ready.promise;

  while (true) {
    const startMs = performance.now();

    const localModel = requireDefined(model);

    const mctsContext = {
      config: SELF_PLAY_MCTS_CONFIG,
      game: Kingdomino.INSTANCE,
      model: localModel.inferenceModel,
      stats: new mcts.MctsStats(),
    };

    const generators = Range(0, kingdominoExperiment.selfPlayEpisodesPerBatch)
      .map(() => {
        return gumbelSelfPlayEpisode(
          Kingdomino.INSTANCE,
          mctsContext,
          episodeConfig,
          32,
          4
        );
      })
      .toArray();

    const episodes = await driveAsyncGenerators(generators, (snapshots) => {
      const startMs = performance.now();
      const result = localModel.inferenceModel.infer(snapshots);
      mctsContext.stats.inferenceTimeMs += performance.now() - startMs;
      return result;
    });

    const elapsedMs = performance.now() - startMs;
    console.log(
      `Self-play inference time: ${
        mctsContext.stats.inferenceTimeMs / elapsedMs
      }% of total`
    );
    console.log(
      `Self-play random playout time: ${
        mctsContext.stats.randomPlayoutTimeMs / elapsedMs
      }% of total`
    );

    console.log(
      `Self-play thread memory: ${JSON.stringify(tf.memory(), undefined, 2)}`
    );

    messagePort.postMessage(episodes.map((episode) => episode.toJson()));

    await sleep(0);
  }
}

main();
