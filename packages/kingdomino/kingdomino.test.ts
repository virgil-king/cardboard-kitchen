import { assert } from "chai";
import { Player, Players, unroll } from "game";
import { test } from "vitest";
import { KingdominoAction } from "./action.js";
import { PlaceTile } from "./base.js";
import { Vector2, Direction } from "./util.js";
import _ from "lodash";
import { Kingdomino } from "./kingdomino.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

test("placeTile: end of game: next action is undefined", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players, _.range(1, 4));
  unroll(episode, [
    claim(alice, 0),
    claim(bob, 1),
    claim(cecile, 2),
    new KingdominoAction({
      player: alice,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
    new KingdominoAction({
      player: bob,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
    new KingdominoAction({
      player: cecile,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
  ]);

  assert.equal(episode.currentState.nextAction, undefined);
});

// function unrollGenerator<InT, OutT>(
//   generator: Generator<OutT, OutT, InT>,
//   inputs: Array<InT>
// ): OutT {
//   let first = generator.next();
// //   console.log(`first=${JSON.stringify(first)}`);
//   let result = first.value;
//   for (const input of inputs) {
//     let step = generator.next(input);
//     // console.log(`step=${JSON.stringify(step)}`);
//     result = step.value;
//     if (step.done == true) {
//     //   console.log(`done=true`);
//       break;
//     }
//   }
//   return result;
// }

function claim(player: Player, offerIndex: number) {
  return new KingdominoAction({
    player: player,
    claimTile: { offerIndex: offerIndex },
  });
}
