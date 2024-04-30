import {
  adjacentEmptyLocations,
  possiblePlacements,
  streamingRandom,
} from "./randomplayer.js";

import { test } from "vitest";
import { assert } from "chai";
import { Kingdomino } from "./kingdomino.js";
import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Map, Set } from "immutable";
import { Direction, Vector2 } from "./util.js";
import {
  LocationState,
  PlaceTile,
  PlayerBoard,
  centerX,
  centerY,
} from "./base.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

test("adjacentEmptyLocations: empty board: yields four adjacent locations", () => {
  const result = Set(adjacentEmptyLocations(new PlayerBoard(Map())));

  assert.isTrue(
    result.equals(
      Set([
        new Vector2(centerX - 1, centerY),
        new Vector2(centerX, centerY + 1),
        new Vector2(centerX + 1, centerY),
        new Vector2(centerX, centerY - 1),
      ])
    )
  );
});

test("adjacentEmptyLocations: one tile placed: yields eight adjacent locations", () => {
  const result = Set(
    adjacentEmptyLocations(
      new PlayerBoard(
        Map([
          [new Vector2(centerX + 1, centerY), new LocationState(1, 0)],
          [new Vector2(centerX + 2, centerY), new LocationState(1, 1)],
        ])
      )
    )
  );

  console.log(result);
  assert.isTrue(
    result.equals(
      Set([
        new Vector2(centerX - 1, centerY),
        new Vector2(centerX, centerY + 1),
        new Vector2(centerX + 1, centerY + 1),
        new Vector2(centerX + 2, centerY + 1),
        new Vector2(centerX + 3, centerY),
        new Vector2(centerX + 2, centerY - 1),
        new Vector2(centerX + 1, centerY - 1),
        new Vector2(centerX, centerY - 1),
      ])
    )
  );
});

test("possiblePlacements: returns all options for first tile", () => {
  const state = kingdomino.newGame(new Players([alice, bob, cecile]));
  const startOfSecondRound = unroll(state, [claim(0), claim(1), claim(2)]);

  const placements = Set(possiblePlacements(startOfSecondRound));

  console.log(JSON.stringify(startOfSecondRound));
  console.log(placements.toJSON());
  assert.equal(placements.count(), 24);
  const check = (x: number, y: number, direction: Direction) => {
    assert.isTrue(
      placements.contains(new PlaceTile(new Vector2(x, y), direction))
    );
  };
  check(3, 4, Direction.DOWN);
  check(3, 4, Direction.LEFT);
  check(3, 4, Direction.UP);
  check(4, 5, Direction.LEFT);
  check(4, 5, Direction.UP);
  check(4, 5, Direction.RIGHT);
  check(5, 4, Direction.UP);
  check(5, 4, Direction.RIGHT);
  check(5, 4, Direction.DOWN);
  check(4, 3, Direction.RIGHT);
  check(4, 3, Direction.DOWN);
  check(4, 3, Direction.LEFT);
});

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}

test("streamingRandom: returns some item", () => {
  const candidates = [0, 1, 2];
  const items = function* () {
    for (const item of candidates) {
      yield item;
    }
  };

  const result = streamingRandom(items());

  assert(candidates.indexOf(result) != -1);
});
