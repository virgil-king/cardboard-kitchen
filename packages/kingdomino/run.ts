import { Player, Players } from "game";
import { RandomKingdominoAgent } from "./randomplayer.js";
import _ from "lodash";
import { KingdominoModel } from "./model-linear.js";

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

const model = KingdominoModel.fresh();

// train(
//   Kingdomino.INSTANCE,
//   model.inferenceModel,
//   model.trainingModel(batchSize),
//   new EpisodeConfiguration(players),
//   new MctsConfig({
//     simulationCount: 16,
//     randomPlayoutConfig: { weight: 1, agent: randomAgent },
//   }),
//   batchSize,
//   batchCount,
//   256
// );

// const elapsed = Date.now() - start;
// console.log(
//   `${episodeCount} episodes took ${elapsed}ms (${
//     elapsed / episodeCount
//   } ms/episode)`
// );
