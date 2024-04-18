import { Player, Players, unroll } from "game";
import { Kingdomino, KingdominoAction } from "./kingdomino.js";
import * as Proto from "kingdomino-proto";
import { tiles } from "./tiles.js";
import { Vector2 } from "./util.js";

import { assert, expect, test } from "vitest";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("newGame: board is correct size with castle in center", () => {
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  for (let i = 0; i < players.players.length; i++) {
    assert(state.locationState(i, new Vector2(0, 0)).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, new Vector2(8, 0)).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, new Vector2(0, 8)).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, new Vector2(8, 8)).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(
      state.locationState(i, new Vector2(4, 4)).terrain == Proto.Terrain.TERRAIN_CENTER
    );
    assert(state.locationState(1, new Vector2(0, 0)).terrain == Proto.Terrain.TERRAIN_EMPTY);
  }
});

test("newGame: current player is first in list", () => {
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  assert(state.currentPlayer() == alice, "first player should be alice");
});

test("newGame: previous offers is undefined", () => {
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  assert(state.proto.previousOffers == undefined);
});

test("newGame: two players: offer has four tiles", () => {
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  assert(state.proto.nextOffers?.offer.length == 4);
});

test("newGame: three players: offer has three tiles", () => {
  const players = new Players([alice, bob, cecile]);

  const state = kingdomino.newGame(players);

  assert(state.proto.nextOffers?.offer.length == 3);
});

test("newGame: four players: offer has four tiles", () => {
  const players = new Players([alice, bob, cecile, derek]);

  const state = kingdomino.newGame(players);

  assert(state.proto.nextOffers?.offer.length == 4);
});

test("newGame: no previous offers", () => {
  const players = new Players([alice, bob, cecile, derek]);

  const state = kingdomino.newGame(players);

  assert(state.proto.previousOffers == undefined);
});

test("apply: includes claim: adds claim", () => {
  const players = new Players([alice, bob]);
  const before = kingdomino.newGame(players);

  const after = claim(1).apply(before);

  assert(
    after.proto.nextOffers?.offer[1].claim?.playerId ==
      before.currentPlayer().id
  );
});

test("currentPlayer: after one action: returns second player", () => {
  const players = new Players([alice, bob]);
  const before = kingdomino.newGame(players);

  const after = claim(1).apply(before);

  assert(after.currentPlayer() == bob);
});

test("currentPlayer: second round: returns player with first claim", () => {
  const players = new Players([alice, bob, cecile]);
  const before = kingdomino.newGame(players);
  const after = unroll(before, [claim(2), claim(1), claim(0)]);

  assert(after.currentPlayer() == cecile);
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

test("apply: matches center: updates player board", () => {
  const players = new Players([alice, bob, cecile]);
  const initialState = kingdomino.newGame(players);
  const tileNumber = initialState.proto.nextOffers?.offer[1].tile
    ?.tileNumber as number;
  const tile = tiles[tileNumber - 1];
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

  assert(after.locationState(0, new Vector2(4, 3)) == tile.properties[0]);
  assert(after.locationState(0, new Vector2(4, 2)) == tile.properties[1]);
});

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}
