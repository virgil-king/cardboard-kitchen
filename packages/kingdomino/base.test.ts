import { test } from "vitest";
import { assert } from "chai";
import { ClaimTile, KingdominoConfiguration, LocationState, PlaceTile } from "./base.js";
import { Direction, Vector2 } from "./util.js";

test("LocationState.equals: equal: returns true", () => {
  const a = new LocationState(5, 1);
  const b = new LocationState(5, 1);

  assert.isTrue(a.equals(b));
});

test("LocationState.equals: not equal: returns false", () => {
  const a = new LocationState(5, 1);
  const b = new LocationState(7, 1);

  assert.isFalse(a.equals(b));
});

test("ClaimTile: codec round trip", () => {
  const claim = new ClaimTile(3);

  const json = claim.toJson();

  assert.equal(claim.offerIndex, ClaimTile.fromJson(json).offerIndex);
});

test("PlaceTile: codec round trip", () => {
    const place = new PlaceTile(new Vector2(2, -4), Direction.UP);

    const json = place.toJson();

    assert.isTrue(place.equals(PlaceTile.fromJson(json)));
});

test("KingdominoConfiguration: codec round trip", () => {
  const before = new KingdominoConfiguration(3, [1, 2, 3]);
  
  const after = KingdominoConfiguration.fromJson(before.toJson());

  assert.equal(before.playerCount, after.playerCount);
  assert.equal(before.scriptedTileNumbers, after.scriptedTileNumbers);
});

test("LocationState: codec round trip", () => {
  const before = new LocationState(5, 1);

  const after = LocationState.fromJson(before.toJson());

  assert.isTrue(before.equals(after));
});