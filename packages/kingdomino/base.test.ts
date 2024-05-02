import { Direction, Rectangle, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { Map } from "immutable";
import {
  LocationState,
  PlaceTile,
  PlayerBoard,
  centerX,
  centerY,
} from "./base.js";
import { Tile } from "./tile.js";

test("PlayerBoard#occupiedRectangle: tiles reach edge of play area: result includes edges", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(centerX + 1, centerY), new LocationState(1, 0)],
      [new Vector2(centerX + 2, centerY), new LocationState(1, 1)],
      [new Vector2(centerX + 3, centerY), new LocationState(2, 0)],
      [new Vector2(centerX + 4, centerY), new LocationState(2, 1)],
      [new Vector2(centerX + 4, centerY + 1), new LocationState(3, 0)],
      [new Vector2(centerX + 4, centerY + 2), new LocationState(3, 1)],
      [new Vector2(centerX + 4, centerY + 3), new LocationState(4, 0)],
      [new Vector2(centerX + 4, centerY + 4), new LocationState(4, 1)],
    ])
  );

  const expected = new Rectangle(centerX, centerY + 4, centerX + 4, centerY);
  assert(
    board.occupiedRectangle().equals(expected),
    `Expected ${expected} but got ${board.occupiedRectangle()}`
  );
});

test("PlayerBoard#isPlacementAllowed: can't place on center square", () => {
  const board = new PlayerBoard(Map());

  assert.isFalse(
    board.isPlacementAllowed(
      new PlaceTile(new Vector2(0, 0), Direction.RIGHT),
      Tile.withNumber(1)
    )
  );
});
