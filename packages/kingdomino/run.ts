import { Player, Players, runEpisode } from "game";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players([alice, bob]);
const randomAgent = new RandomKingdominoAgent();
const agents = new Map([
  [alice.id, randomAgent],
  [bob.id, randomAgent],
]);
for (let i = 0; i < 1; i++) {
  const episode = runEpisode(kingdomino, players, agents);
  console.log(
    JSON.stringify(episode.currentState.props.playerIdToState, undefined, 2)
  );
  console.log(
    JSON.stringify(
      [...episode.currentState.props.playerIdToState.values()].map((state) =>
        state.board.locationStates.entries()
      )
    )
  );
  console.log(
    `Results: ${JSON.stringify(
      players.players.map((player) => {
        episode.currentState.playerState(player.id);
      })
    )}`
  );
}
