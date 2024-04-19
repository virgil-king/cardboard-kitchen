import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./state.js";
import * as Proto from "kingdomino-proto";
import { Vector2 } from "./util.js";
import { tileWithNumber } from "./tiles.js";

import { expect, test } from "vitest";
import { assert } from "chai";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("apply: includes claim: adds claim", () => {
  const players = new Players([alice, bob]);
  const before = kingdomino.newGame(players);

  const after = claim(1).apply(before);

  assert(
    after.proto.nextOffers?.offer[1].claim?.playerId ==
      before.currentPlayer().id
  );
});

test("apply: includes place on first round: throws", () => {
  const players = new Players([alice, bob]);
  const before = kingdomino.newGame(players);

  expect(() =>
    new KingdominoAction({
      placeTile: {},
    }).apply(before)
  ).toThrowError();
});

test("apply: no claim in non-final round: throws", () => {
  const players = new Players([alice, bob]);
  const state = unroll(kingdomino.newGame(players), [claim(1), claim(0)]);

  expect(() =>
    new KingdominoAction({
      placeTile: {
        x: 4,
        y: 3,
        orientation: Proto.TileOrientation.DOWN,
      },
    }).apply(state)
  ).toThrowError();
});

test("apply: placement out of bounds: throws", () => {
  const players = new Players([alice, bob, cecile]);
  const state = unroll(kingdomino.newGame(players), [
    claim(1),
    claim(0),
    claim(2),
  ]);

  expect(() =>
    new KingdominoAction({
      claimTile: { offerIndex: 0 },
      placeTile: {
        x: 25,
        y: 25,
        orientation: Proto.TileOrientation.DOWN,
      },
    }).apply(state)
  ).toThrowError();
});

test("apply: no matching terrain: throws", () => {
  const players = new Players([alice, bob, cecile]);
  const state = unroll(kingdomino.newGame(players), [
    claim(1),
    claim(0),
    claim(2),
  ]);

  expect(() =>
    new KingdominoAction({
      claimTile: { offerIndex: 0 },
      placeTile: {
        x: 0,
        y: 0,
        orientation: Proto.TileOrientation.DOWN,
      },
    }).apply(state)
  ).toThrowError();
});

test("apply: updates player board", () => {
  const players = new Players([alice, bob, cecile]);
  const initialState = kingdomino.newGame(players);
  // Capture the first offer tile here since that's the one we'll place later
  const tileNumber = initialState.proto.nextOffers?.offer[0].tile
    ?.tileNumber as number;
  const tile = tileWithNumber(tileNumber);
  const startOfSecondRound = unroll(initialState, [
    claim(1),
    claim(0),
    claim(2),
  ]);

  const after = new KingdominoAction({
    claimTile: { offerIndex: 0 },
    placeTile: {
      x: 4,
      y: 3,
      orientation: Proto.TileOrientation.DOWN,
    },
  }).apply(startOfSecondRound);

  console.log(`Expected tile is ${JSON.stringify(tile)}`);
  // Bob claimed the first tile
  assert.equal(after.locationState(bob, new Vector2(4, 3)), tile.properties[0]);
  assert.equal(after.locationState(bob, new Vector2(4, 2)), tile.properties[1]);
});

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}
