import { Player } from "game";
import { train_parallel } from "training";
import { Kingdomino } from "./kingdomino.js";
import _ from "lodash";
import { HiddenLayerStructure, KingdominoModel } from "./model.js";

// const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
// const players = new Players(alice, bob, cecile, derek);
// const randomAgent = new RandomKingdominoAgent();
// const agents = new Map([
//   [alice.id, randomAgent],
//   [bob.id, randomAgent],
// ]);
// const start = Date.now();
// const episodeCount = 100;
const batchSize = 128;
// const batchCount = 2048;
const sampleBufferSize = batchSize * 256;
// for (let i = 0; i < episodeCount; i++) {
// const episode = runEpisode(kingdomino, players, agents);
// console.log(
//   JSON.stringify(episode.currentState.props.playerIdToState, undefined, 2)
// );
// console.log(
//   JSON.stringify(
//     [...episode.currentState.props.playerIdToState.values()].map((state) =>
//       state.board.locationStates.entries()
//     )
//   )
// );
// console.log(
//   `Results: ${JSON.stringify(
//     players.players.map((player) => {
//       episode.currentState.playerState(player.id);
//     })
//   )}`
// );
// }

async function main() {
  const modelPath = process.argv.length > 2 ? process.argv[2] : undefined;
  let model: KingdominoModel;
  if (modelPath == undefined) {
    model = KingdominoModel.fresh(HiddenLayerStructure.FOUR_EIGHTH_SIZE);
    console.log("Created randomly initialized model");
  } else {
    model = await KingdominoModel.load(modelPath);
    console.log(`Loaded model from ${modelPath}`);
  }

  const now = new Date();
  const home = process.env.HOME;
  // const modelsDir = `~/models/kingdomino/${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
  const modelsDir = `${home}/models/kingdomino/four_hidden_layers/${now.toISOString()}`;

  train_parallel(
    Kingdomino.INSTANCE,
    model,
    batchSize,
    sampleBufferSize,
    "./out/worker.js",
    modelsDir
  );
}

main();

// const filename = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;

// const elapsed = Date.now() - start;
// console.log(
//   `${episodeCount} episodes took ${elapsed}ms (${
//     elapsed / episodeCount
//   } ms/episode)`
// );
