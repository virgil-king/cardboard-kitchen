import { test } from "vitest";
import { assert } from "chai";
import { ClaimTile, KingdominoConfiguration, KingdominoVectors, LocationState, PlaceTile } from "./base.js";
import { Direction, Vector2 } from "./util.js";

test("LocationState.equals: equal: returns true", () => {
  const a = LocationState.instance(5, 1);
  const b = LocationState.instance(5, 1);

  assert.isTrue(a.equals(b));
});

test("LocationState.equals: not equal: returns false", () => {
  const a = LocationState.instance(5, 1);
  const b = LocationState.instance(7, 1);

  assert.isFalse(a.equals(b));
});

test("ClaimTile: codec round trip", () => {
  const claim = new ClaimTile(3);

  const json = claim.encode();

  assert.equal(claim.offerIndex, ClaimTile.decode(json).offerIndex);
});

test("PlaceTile: codec round trip", () => {
  const place = new PlaceTile(new Vector2(2, -4), Direction.UP);

  const json = place.encode();

  assert.isTrue(place.equals(PlaceTile.fromJson(json)));
});

test("PlaceTile: transform", () => {
  const place = new PlaceTile(new Vector2(2, -1), Direction.RIGHT);

  const transformed = place.transform({ mirror: true, quarterTurns: 1 });

  assert.equal(transformed.location.x, -1);
  assert.equal(transformed.location.y, 2);
  assert.equal(transformed.direction, Direction.UP);
});

test("KingdominoConfiguration: codec round trip", () => {
  const before = new KingdominoConfiguration(3, [1, 2, 3]);

  const after = KingdominoConfiguration.fromJson(before.encode());

  assert.equal(before.playerCount, after.playerCount);
  assert.equal(before.scriptedTileNumbers, after.scriptedTileNumbers);
});

test("LocationState: codec round trip", () => {
  const before = LocationState.instance(5, 1);

  const after = LocationState.decode(before.encode());

  assert.isTrue(before.equals(after));
});

test("KingdominoVectors: transform", () => {
  const before = KingdominoVectors.instance(-3, -2);

  const after = KingdominoVectors.transform(before, { mirror: true, quarterTurns: 3 });

  assert.equal(after.x, 2);
  assert.equal(after.y, 3);
});
