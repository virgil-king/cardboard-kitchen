import {
  SettablePromise,
  driveGenerators,
  requireDefined,
  sleep,
} from "studio-util";
import { EpisodeConfiguration, Player, Players } from "game";
import { selfPlayEpisode } from "training";
import {
  Kingdomino,
  KingdominoModel,
  SELF_PLAY_EPISODES_PER_BATCH,
  SELF_PLAY_MCTS_CONFIG,
} from "kingdomino";
import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { Range } from "immutable";
import { MctsStats } from "mcts";
import * as tf from "@tensorflow/tfjs-node-gpu";

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
  const newModel = await KingdominoModel.fromJson(message, tf);
  model?.model.dispose();
  model = newModel;
  console.log(`Self-play worker received new model`);
  ready.fulfill(undefined);
});

const home = process.env.HOME;
const gamesDir = `${home}/ckdata/kingdomino/games`;
fs.mkdirSync(gamesDir, { recursive: true });

async function main() {
  await ready.promise;

  while (true) {
    const startMs = performance.now();

    const localModel = requireDefined(model);

    const mctsContext = {
      config: SELF_PLAY_MCTS_CONFIG,
      game: Kingdomino.INSTANCE,
      model: localModel.inferenceModel,
      stats: new MctsStats(),
    };

    const generators = Range(0, SELF_PLAY_EPISODES_PER_BATCH)
      .map((i) => {
        return selfPlayEpisode(Kingdomino.INSTANCE, mctsContext, episodeConfig);
      })
      .toArray();

    const episodes = driveGenerators(generators, (snapshots) => {
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

    for (const episode of episodes) {
      console.log(
        `Scores: ${episode.terminalState.props.playerIdToState
          .valueSeq()
          .map((state) => state.score)
          .toArray()
          .sort((a, b) => a - b)}`
      );
    }

    messagePort.postMessage(episodes.map((episode) => episode.toJson()));

    await sleep(0);
  }
}

main();
