import { EpisodeConfiguration, Player, Players, train } from "game";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";
import _ from "lodash";
import { Task, createScope, sleep } from "effection";
import { KingdominoModel } from "./model.js";
import { MctsConfig } from "game/out/mcts.js";

// const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const randomAgent = new RandomKingdominoAgent();
// const agents = new Map([
//   [alice.id, randomAgent],
//   [bob.id, randomAgent],
// ]);
// const start = Date.now();
// const episodeCount = 100;
const batchSize = 128;
const batchCount = 2048;
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

train(
  Kingdomino.INSTANCE,
  new KingdominoModel(batchSize),
  new EpisodeConfiguration(players),
  new MctsConfig({
    simulationCount: 16,
    randomPlayoutConfig: { weight: 1, agent: randomAgent },
  }),
  batchSize,
  batchCount,
  256
);

// const elapsed = Date.now() - start;
// console.log(
//   `${episodeCount} episodes took ${elapsed}ms (${
//     elapsed / episodeCount
//   } ms/episode)`
// );
