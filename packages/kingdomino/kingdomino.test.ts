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
  const episode = kingdomino.newEpisode(players, _.range(1, 4));
  unroll(episode, [
    claim(alice, 0),
    claim(bob, 1),
    claim(cecile, 2),
    KingdominoAction.placeTile(
      alice,
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      bob,
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      cecile,
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
  ]);

  assert.equal(episode.currentState.nextAction, undefined);
});

function claim(player: Player, offerIndex: number) {
  return KingdominoAction.claimTile(player, { offerIndex: offerIndex });
}
