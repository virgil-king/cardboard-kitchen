import { SettablePromise, requireDefined, sleep } from "studio-util";
import { KingdominoModel } from "./model.js";
import {
  EpisodeConfiguration,
  MctsConfig,
  MctsStats,
  Player,
  Players,
  episode as gameEpisode,
} from "game";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { Kingdomino } from "./kingdomino.js";
import * as worker_threads from "node:worker_threads";
import { Map } from "immutable";
import * as fs from "node:fs";
import { fileSystem } from "@tensorflow/tfjs-node-gpu/dist/io/file_system.js";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let model: KingdominoModel | undefined;

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
  //   const artifacts = message: any.data as tfcore.io.ModelArtifacts;
  const newModel = await KingdominoModel.fromJson(message);
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

    const episodeTrainingData = gameEpisode(
      Kingdomino.INSTANCE,
      playerIdToMctsContext,
      episodeConfig
    );
    // const lastDataPoint =
    //   episodeTrainingData.dataPoints[episodeTrainingData.dataPoints.length - 1];
    console.log(
      `Scores: ${episodeTrainingData.terminalState.props.playerIdToState
        .valueSeq()
        .map((state) => state.score)
        .toArray()}`
    );
    // console.log(`Completed episode`);

    messagePort.postMessage(episodeTrainingData.toJson());

    const encoded = episodeTrainingData.toJson();
    const path = fs.writeFileSync(
      `${gamesDir}/${new Date().toISOString()}`,
      JSON.stringify(encoded, undefined, 1)
    );

    await sleep(0);
  }
}

main();
