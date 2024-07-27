import { SettablePromise, requireDefined, sleep } from "studio-util";
import { EpisodeConfiguration, Player, Players } from "game";
import { MctsConfig, MctsStats, episode as gameEpisode } from "training";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { Kingdomino } from "./kingdomino.js";
import * as worker_threads from "node:worker_threads";
import { Map } from "immutable";
import * as fs from "fs";
import { KingdominoConvolutionalModel } from "./model-cnn.js";

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
  simulationCount: 128,
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

async function main() {
  await ready.promise;

  while (true) {
    const localModel = requireDefined(model);

    const mctsContext = {
      config: mctsConfig,
      game: Kingdomino.INSTANCE,
      model: localModel.inferenceModel,
      stats: new MctsStats(),
    };
    const playerIdToMctsContext = Map(
      players.players.map((player) => [player.id, mctsContext])
    );

    const startMs = performance.now();
    const episodeTrainingData = gameEpisode(
      Kingdomino.INSTANCE,
      playerIdToMctsContext,
      episodeConfig
    );
    console.log(
      `Scores: ${episodeTrainingData.terminalState.props.playerIdToState
        .valueSeq()
        .map((state) => state.score)
        .toArray()
        .sort((a, b) => a - b)}`
    );

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

    messagePort.postMessage(episodeTrainingData.toJson());

    const encoded = episodeTrainingData.toJson();
    fs.writeFileSync(
      `${gamesDir}/${new Date().toISOString()}`,
      JSON.stringify(encoded, undefined, 1)
    );

    await sleep(0);
  }
}

main();
