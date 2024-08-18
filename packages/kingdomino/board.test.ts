import { Direction, Rectangle, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { Map, Range } from "immutable";
import {
  KingdominoVectors,
  LocationState,
  PlaceTile,
  boardIndices,
  centerX,
  centerY,
  playAreaRadius,
} from "./base.js";
import { PlayerBoard, extend } from "./board.js";
import { Terrain, Tile } from "./tile.js";

test("occupiedRectangle: tiles reach top right of play area: result includes edges", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(centerX + 1, centerY), LocationState.instance(1, 0)],
      [new Vector2(centerX + 2, centerY), LocationState.instance(1, 1)],
      [new Vector2(centerX + 3, centerY), LocationState.instance(2, 0)],
      [new Vector2(centerX + 4, centerY), LocationState.instance(2, 1)],
      [new Vector2(centerX + 4, centerY + 1), LocationState.instance(3, 0)],
      [new Vector2(centerX + 4, centerY + 2), LocationState.instance(3, 1)],
      [new Vector2(centerX + 4, centerY + 3), LocationState.instance(4, 0)],
      [new Vector2(centerX + 4, centerY + 4), LocationState.instance(4, 1)],
    ])
  );

  const expected = new Rectangle(centerX, centerY + 5, centerX + 5, centerY);
  assert.isTrue(
    board.occupiedRectangle.equals(expected),
    `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(
      board.occupiedRectangle
    )}`
  );
});

test("occupiedRectangle: tiles reach bottom left of play area: result includes edges", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(centerX - 1, centerY), LocationState.instance(1, 0)],
      [new Vector2(centerX - 2, centerY), LocationState.instance(1, 1)],
      [new Vector2(centerX - 3, centerY), LocationState.instance(2, 0)],
      [new Vector2(centerX - 4, centerY), LocationState.instance(2, 1)],
      [new Vector2(centerX - 4, centerY - 1), LocationState.instance(3, 0)],
      [new Vector2(centerX - 4, centerY - 2), LocationState.instance(3, 1)],
      [new Vector2(centerX - 4, centerY - 3), LocationState.instance(4, 0)],
      [new Vector2(centerX - 4, centerY - 4), LocationState.instance(4, 1)],
    ])
  );

  const expected = new Rectangle(
    centerX - 4,
    centerY + 1,
    centerX + 1,
    centerY - 4
  );
  assert.isTrue(
    board.occupiedRectangle.equals(expected),
    `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(
      board.occupiedRectangle
    )}`
  );
});

test("occupiedRectangle: empty board: returns rectangle around center tile", () => {
  const occupiedRectangle = new PlayerBoard(Map()).occupiedRectangle;

  const expected = new Rectangle(0, 1, 1, 0);
  assert.isTrue(
    occupiedRectangle.equals(expected),
    `Expected ${expected} but got ${occupiedRectangle}`
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

test("isPlacementAllowed: would make kingdom too big (negative direction)", () => {
  const board = new PlayerBoard(Map())
    .withTile(new PlaceTile(new Vector2(-1, 0), Direction.LEFT), 3)
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 4);

  assert.isFalse(
    board.isPlacementAllowed(
      new PlaceTile(new Vector2(-2, 1), Direction.LEFT),
      Tile.withNumber(5)
    )
  );
});

test("isPlacementAllowed: would make kingdom too big (positive direction)", () => {
  const board = new PlayerBoard(Map())
    .withTile(new PlaceTile(new Vector2(-1, 0), Direction.LEFT), 3)
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 4);

  assert.isFalse(
    board.isPlacementAllowed(
      new PlaceTile(new Vector2(2, 1), Direction.RIGHT),
      Tile.withNumber(5)
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
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 19)
    .withTile(new PlaceTile(new Vector2(1, 1), Direction.RIGHT), 14);

  assert.equal(board.score(), 2);
});

test("score: four point territory", () => {
  const board = new PlayerBoard(Map())
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 19)
    .withTile(new PlaceTile(new Vector2(1, 1), Direction.RIGHT), 20);

  assert.equal(board.score(), 4);
});

test("score: two four point territories", () => {
  const board = new PlayerBoard(Map())
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 19)
    .withTile(new PlaceTile(new Vector2(1, 1), Direction.RIGHT), 20)
    .withTile(new PlaceTile(new Vector2(-1, 0), Direction.LEFT), 24)
    .withTile(new PlaceTile(new Vector2(-1, 1), Direction.LEFT), 25);

  assert.equal(board.score(), 8);
});

test("score: territory not connected to center", () => {
  const board = new PlayerBoard(Map())
    .withTile(new PlaceTile(new Vector2(-1, 0), Direction.LEFT), 1)
    .withTile(new PlaceTile(new Vector2(-4, 0), Direction.RIGHT), 24)
    .withTile(new PlaceTile(new Vector2(-4, 1), Direction.LEFT), 25);

  assert.equal(board.score(), 4);
});

test("score: ring shape", () => {
  const board = new PlayerBoard(Map())
    //   W F F H
    // W W     H
    //   C H H H
    .withTile(new PlaceTile(new Vector2(1, 0), Direction.RIGHT), 1)

    .withTile(new PlaceTile(new Vector2(3, 0), Direction.UP), 2)
    .withTile(new PlaceTile(new Vector2(2, 2), Direction.RIGHT), 24)
    .withTile(new PlaceTile(new Vector2(1, 2), Direction.LEFT), 17)
    .withTile(new PlaceTile(new Vector2(0, 1), Direction.LEFT), 7);

  assert.equal(board.score(), 2);
});

test("extend: extends bottom left", () => {
  const rect = new Rectangle(0, 1, 2, -1);
  const extended = extend(rect, new Vector2(-2, -3));

  assert.equal(extended.left, -2);
  assert.equal(extended.bottom, -3);
});

test("extend: extends top right", () => {
  const rect = new Rectangle(0, 1, 2, -1);
  const extended = extend(rect, new Vector2(2, 2));

  assert.equal(extended.top, 3);
  assert.equal(extended.right, 3);
});

test("extend: already included: unchanged", () => {
  const rect = new Rectangle(0, 3, 3, 0);
  const extended = extend(rect, new Vector2(1, 1));

  assert.isTrue(extended.equals(rect));
});

test("equals: equal: returns true", () => {
  const a = new PlayerBoard(
    Map([[new Vector2(1, 2), LocationState.instance(2, 0)]])
  );
  const b = new PlayerBoard(
    Map([[new Vector2(1, 2), LocationState.instance(2, 0)]])
  );

  assert.isTrue(a.equals(b));
});

test("equals: not equal: returns false", () => {
  const a = new PlayerBoard(
    Map([[new Vector2(1, 2), LocationState.instance(2, 0)]])
  );
  const b = new PlayerBoard(
    Map([[new Vector2(3, 2), LocationState.instance(2, 0)]])
  );

  assert.isFalse(a.equals(b));
});

test("isCentered: not centered: returns false", () => {
  const a = new PlayerBoard(
    Map([[new Vector2(1, 0), LocationState.instance(2, 0)]])
  );

  assert.isFalse(a.isCentered());
});

test("isCentered: centered: returns true", () => {
  const a = new PlayerBoard(
    Map([
      [new Vector2(1, 0), LocationState.instance(2, 0)],
      [new Vector2(-1, 0), LocationState.instance(2, 0)],
    ])
  );

  assert.isTrue(a.isCentered());
});

test("isFilled: not filled: returns false", () => {
  const a = new PlayerBoard(
    Map([[new Vector2(1, 0), LocationState.instance(2, 0)]])
  );

  assert.isFalse(a.isFilled());
});

test("isFilled filled: returns true", () => {
  let locationStates = Map<Vector2, LocationState>();
  for (const x of Range(-playAreaRadius, 1)) {
    for (const y of Range(-playAreaRadius, 1)) {
      if (x == 0 && y == 0) {
        continue;
      }
      locationStates = locationStates.set(
        new Vector2(x, y),
        LocationState.instance(1, 0)
      );
    }
  }
  const board = new PlayerBoard(locationStates);

  assert.isTrue(board.isFilled());
});

test("rotate: parameter too low: throws", () => {
  const board = new PlayerBoard(Map());

  assert.throws(() => board.transform({ quarterTurns: -1 }));
});

test("rotate: parameter too high: throws", () => {
  const board = new PlayerBoard(Map());

  assert.throws(() => board.transform({ quarterTurns: 4 }));
});

test("rotate: 90 degrees", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(-1, 1), LocationState.instance(13, 0)],
      [new Vector2(-1, 2), LocationState.instance(13, 1)],
    ])
  );

  const rotated = board.transform({ quarterTurns: 1 });

  assert.equal(
    rotated.getLocationState(new Vector2(-1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, 2)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, 1)).terrain,
    Terrain.TERRAIN_HAY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(2, 1)).terrain,
    Terrain.TERRAIN_FOREST
  );
});

test("rotate: 180 degrees", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(-1, 1), LocationState.instance(13, 0)],
      [new Vector2(-1, 2), LocationState.instance(13, 1)],
    ])
  );

  const rotated = board.transform({ quarterTurns: 2 });

  assert.equal(
    rotated.getLocationState(new Vector2(-1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, 2)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, -1)).terrain,
    Terrain.TERRAIN_HAY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, -2)).terrain,
    Terrain.TERRAIN_FOREST
  );
});

test("rotate: 270 degrees", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(-1, 1), LocationState.instance(13, 0)],
      [new Vector2(-1, 2), LocationState.instance(13, 1)],
    ])
  );

  const rotated = board.transform({ quarterTurns: 3 });

  assert.equal(
    rotated.getLocationState(new Vector2(-1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, 2)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, -1)).terrain,
    Terrain.TERRAIN_HAY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-2, -1)).terrain,
    Terrain.TERRAIN_FOREST
  );
});

test("mirror: returns mirrored board", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(-1, 1), LocationState.instance(13, 0)],
      [new Vector2(-1, 2), LocationState.instance(13, 1)],
    ])
  );

  const rotated = board.transform({ mirror: true });

  assert.equal(
    rotated.getLocationState(new Vector2(-1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, 2)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, 1)).terrain,
    Terrain.TERRAIN_HAY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, 2)).terrain,
    Terrain.TERRAIN_FOREST
  );
});

test("mirror and rotate: applies both transforms", () => {
  const board = new PlayerBoard(
    Map([
      [new Vector2(-1, 1), LocationState.instance(13, 0)],
    ])
  );

  const rotated = board.transform({ mirror: true, quarterTurns: 1 });

  assert.equal(
    rotated.getLocationState(new Vector2(-1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, 1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(1, -1)).terrain,
    Terrain.TERRAIN_HAY
  );
  assert.equal(
    rotated.getLocationState(new Vector2(-1, -1)).terrain,
    Terrain.TERRAIN_EMPTY
  );
});
