import {
  SettablePromise,
  driveGenerators,
  requireDefined,
  sleep,
} from "studio-util";
import { EpisodeConfiguration, Player, Players } from "game";
import {
  MctsConfig,
  MctsStats,
  trainingEpisode,
} from "training";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { Kingdomino } from "./kingdomino.js";
import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { Range } from "immutable";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let model: KingdominoConvolutionalModel | undefined;

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const episodeConfig = new EpisodeConfiguration(players);
const randomAgent = new RandomKingdominoAgent();

const mctsConfig = new MctsConfig({
  simulationCount: 256,
  randomPlayoutConfig: { weight: 1, agent: randomAgent },
});

const ready = new SettablePromise<undefined>();

messagePort.on("message", async (message: any) => {
  const newModel = await KingdominoConvolutionalModel.fromJson(message);
  model?.model.dispose();
  model = newModel;
  console.log(`Received new model`);
  ready.fulfill(undefined);
});

const home = process.env.HOME;
const gamesDir = `${home}/ckdata/kingdomino/games`;
fs.mkdirSync(gamesDir, { recursive: true });

const concurrentEpisodeCount = 64;

async function main() {
  await ready.promise;

  while (true) {
    const startMs = performance.now();

    const localModel = requireDefined(model);

    const mctsContext = {
      config: mctsConfig,
      game: Kingdomino.INSTANCE,
      model: localModel.inferenceModel,
      stats: new MctsStats(),
    };

    const generators = Range(0, concurrentEpisodeCount)
      .map((i) => {
        return trainingEpisode(Kingdomino.INSTANCE, mctsContext, episodeConfig);
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
      `Inference time: ${
        mctsContext.stats.inferenceTimeMs / elapsedMs
      } of total`
    );
    console.log(
      `Random playout time: ${
        mctsContext.stats.randomPlayoutTimeMs / elapsedMs
      } of total`
    );

    for (const episode of episodes) {
      console.log(
        `Scores: ${episode.terminalState.props.playerIdToState
          .valueSeq()
          .map((state) => state.score)
          .toArray()
          .sort((a, b) => a - b)}`
      );

      // messagePort.postMessage(episode.toJson());

      // const encoded = episode.toJson();
      // fs.writeFileSync(
      //   `${gamesDir}/${new Date().toISOString()}`,
      //   JSON.stringify(encoded, undefined, 1)
      // );
    }

    messagePort.postMessage(episodes.map((episode) => episode.toJson()));

    await sleep(0);
  }
}

main();
