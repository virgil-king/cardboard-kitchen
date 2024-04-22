import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import * as Proto from "kingdomino-proto";
import { Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("newGame: board is correct size with castle in center", () => {
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  for (let player of players.players) {
    assert(
      state.locationState(player, new Vector2(0, 0)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
    );
    assert(
      state.locationState(player, new Vector2(8, 0)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
    );
    assert(
      state.locationState(player, new Vector2(0, 8)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
    );
    assert(
      state.locationState(player, new Vector2(8, 8)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
    );
    assert(
      state.locationState(player, new Vector2(4, 4)).terrain ==
        Proto.Terrain.TERRAIN_CENTER
    );
    assert(
      state.locationState(player, new Vector2(0, 0)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
    );
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

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}
