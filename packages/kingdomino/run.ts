import { Player, Players, runEpisode } from "game";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";
import _ from "lodash";
import { Task, createScope, sleep } from "effection";

// const kingdomino = new Kingdomino();
// const alice = new Player("alice", "Alice");
// const bob = new Player("bob", "Bob");
// const players = new Players([alice, bob]);
// const randomAgent = new RandomKingdominoAgent();
// const agents = new Map([
//   [alice.id, randomAgent],
//   [bob.id, randomAgent],
// ]);
// for (let i = 0; i < 1; i++) {
//   const episode = runEpisode(kingdomino, players, agents);
//   console.log(
//     JSON.stringify(episode.currentState.props.playerIdToState, undefined, 2)
//   );
//   console.log(
//     JSON.stringify(
//       [...episode.currentState.props.playerIdToState.values()].map((state) =>
//         state.board.locationStates.entries()
//       )
//     )
//   );
//   console.log(
//     `Results: ${JSON.stringify(
//       players.players.map((player) => {
//         episode.currentState.playerState(player.id);
//       })
//     )}`
//   );
// }

function* generate() {
  for (const i of _.range(1, 1000)) {
    yield i;
  }
}

let startCount = 0;

function* slowly() {
  const myStartCount = startCount++;
  for (let value of generate()) {
    console.log(`${myStartCount} ${value}`);
    yield* sleep(100);
  }
}

const [scope, destroyScope] = createScope();
let task: Task<void> | undefined = undefined;

function restart() {
  const previousTask = task;
  task = scope.run(function* () {
    if (previousTask != undefined) {
      yield* previousTask.halt();
    }
    yield* slowly();
  });
  setTimeout(restart, 1000);
}

restart();
