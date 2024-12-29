import {
  decodeOrThrow,
  driveAsyncGenerators,
  EpisodeConfiguration,
  Player,
  Players,
  requireDefined,
  SettablePromise,
  sleep,
} from "game";
import { gumbelSelfPlayEpisode } from "training";
import { Kingdomino } from "kingdomino";
import * as worker_threads from "node:worker_threads";
import { Range } from "immutable";
import { mcts, modelCodec, ModelCodecType } from "agent";
import * as tf from "@tensorflow/tfjs-node-gpu";
import { SELF_PLAY_MCTS_CONFIG, kingdominoExperiment } from "./config.js";
import { KingdominoModel } from "kingdomino-agent";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let model: KingdominoModel | undefined;
let newModelJson: ModelCodecType | undefined;

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const episodeConfig = new EpisodeConfiguration(players);

const ready = new SettablePromise<undefined>();

messagePort.on("message", async (message: any) => {
  console.log(`Self-play worker received new model`);
  // Save the serialized model so the main loop can consume it and
  // dispose the old model in between batches
  newModelJson = decodeOrThrow(modelCodec, message);
  ready.fulfill(undefined);
});

async function acquireModel(): Promise<KingdominoModel> {
  await ready.promise;

  if (newModelJson != undefined) {
    if (model != undefined) {
      model.dispose();
      // https://github.com/tensorflow/tfjs/issues/8471
      tf.disposeVariables();
    }
    model = await KingdominoModel.fromJson(newModelJson);
    newModelJson = undefined;
  }

  return requireDefined(model);
}

async function main() {
  while (true) {
    const localModel = await acquireModel();

    const startMs = performance.now();

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

    messagePort.postMessage(episodes.map((episode) => episode.encode()));

    await sleep(0);
  }
}

main();
