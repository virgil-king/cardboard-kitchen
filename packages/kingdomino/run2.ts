import { Player, Players, train_parallel } from "game";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";
import _ from "lodash";
import { KingdominoModel } from "./model.js";

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
const sampleBufferSize = batchSize * 32;
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

const model = KingdominoModel.fresh();

// const filename = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;

const now = new Date();
const home = process.env.HOME;
// const modelsDir = `~/models/kingdomino/${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}-${now.getSeconds()}`;
const modelsDir = `${home}/models/kingdomino/${now.toISOString()}`;

train_parallel(
  Kingdomino.INSTANCE,
  model,
  batchSize,
  sampleBufferSize,
  "./out/worker.js",
  modelsDir
);

// const elapsed = Date.now() - start;
// console.log(
//   `${episodeCount} episodes took ${elapsed}ms (${
//     elapsed / episodeCount
//   } ms/episode)`
// );
