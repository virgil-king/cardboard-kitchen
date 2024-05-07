import { Direction, Rectangle, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { Map } from "immutable";
import { LocationState, PlaceTile, centerX, centerY } from "./base.js";
import { PlayerBoard } from "./board.js";
import { Tile } from "./tile.js";

test("occupiedRectangle: tiles reach top right of play area: result includes edges", () => {
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
  assert.isTrue(
    board.occupiedRectangle().equals(expected),
    `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(board.occupiedRectangle())}`
  );
});

test("occupiedRectangle: tiles reach bottom left of play area: result includes edges", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(centerX - 1, centerY), new LocationState(1, 0)],
      [new Vector2(centerX - 2, centerY), new LocationState(1, 1)],
      [new Vector2(centerX - 3, centerY), new LocationState(2, 0)],
      [new Vector2(centerX - 4, centerY), new LocationState(2, 1)],
      [new Vector2(centerX - 4, centerY - 1), new LocationState(3, 0)],
      [new Vector2(centerX - 4, centerY - 2), new LocationState(3, 1)],
      [new Vector2(centerX - 4, centerY - 3), new LocationState(4, 0)],
      [new Vector2(centerX - 4, centerY - 4), new LocationState(4, 1)],
    ])
  );

  const expected = new Rectangle(centerX - 4, centerY, centerX, centerY - 4);
  assert.isTrue(
    board.occupiedRectangle().equals(expected),
    `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(board.occupiedRectangle())}`
  );
});

test("isPlacementAllowed: can't place on center square", () => {
  const board = new PlayerBoard(Map());

  assert.isFalse(
    board.isPlacementAllowed(
      new PlaceTile(new Vector2(0, 0), Direction.RIGHT),
      Tile.withNumber(1)
    )
  );
});

test("score: no crowns", () => {
  const board = new PlayerBoard(Map()).withTile(
    new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    1
  );

  assert.equal(board.score(), 0);
});

test("score: counts one crown", () => {
  const board = new PlayerBoard(Map()).withTile(
    new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    19
  );

  assert.equal(board.score(), 1);
});

test("score: two point territory", () => {
  const board = new PlayerBoard(Map())
    .withTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
      19
    )
    .withTile(
      new PlaceTile(new Vector2(1, 1), Direction.RIGHT),
      14
    );

  assert.equal(board.score(), 2);
});

test("score: four point territory", () => {
  const board = new PlayerBoard(Map())
    .withTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
      19
    )
    .withTile(
      new PlaceTile(new Vector2(1, 1), Direction.RIGHT),
      20
    );

  assert.equal(board.score(), 4);
});

test("score: two four point territories", () => {
  const board = new PlayerBoard(Map())
    .withTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
      19
    )
    .withTile(
      new PlaceTile(new Vector2(1, 1), Direction.RIGHT),
      20
    )
    .withTile(
      new PlaceTile(new Vector2(-1, 0), Direction.LEFT),
      24
    )
    .withTile(
      new PlaceTile(new Vector2(-1, 1), Direction.LEFT),
      25
    );

  assert.equal(board.score(), 8);
});

test("score: territory not connected to center", () => {
  const board = new PlayerBoard(Map())
    .withTile(
      new PlaceTile(new Vector2(-1, 0), Direction.LEFT),
      1
    )
    .withTile(
      new PlaceTile(new Vector2(-4, 0), Direction.RIGHT),
      24
    )
    .withTile(
      new PlaceTile(new Vector2(-4, 1), Direction.LEFT),
      25
    );

  assert.equal(board.score(), 4);
});

test("score: ring shape", () => {
  const board = new PlayerBoard(Map())
    //   W F F H
    // W W     H
    //   C H H H
    .withTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
      1
    )

    .withTile(
      new PlaceTile(new Vector2(3, 0), Direction.UP),
      2
    )
    .withTile(
      new PlaceTile(new Vector2(2, 2), Direction.RIGHT),
      24
    )
    .withTile(
      new PlaceTile(new Vector2(1, 2), Direction.LEFT),
      17
    )
    .withTile(
      new PlaceTile(new Vector2(0, 1), Direction.LEFT),
      7
    );

  assert.equal(board.score(), 2);
});
