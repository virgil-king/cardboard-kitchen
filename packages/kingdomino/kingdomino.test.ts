import { Player, Players } from "game";
import { Kingdomino } from "./kingdomino.js";
import * as Proto from "kingdomino-proto";
import { assert, test } from "vitest";
import { shuffle } from "studio-util";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

test("newGame: board is correct size with castle in center", () => {
  shuffle([0, 1]);
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  for (let i = 0; i < players.players.length; i++) {
    assert(state.locationState(i, 0, 0).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, 8, 0).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, 0, 8).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(state.locationState(i, 8, 8).terrain == Proto.Terrain.TERRAIN_EMPTY);
    assert(
      state.locationState(i, 4, 4).terrain == Proto.Terrain.TERRAIN_CENTER
    );
    assert(state.locationState(1, 0, 0).terrain == Proto.Terrain.TERRAIN_EMPTY);
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
  const players = new Players([alice, bob]);

  const state = kingdomino.newGame(players);

  assert(state.proto.nextOffers?.offer.length == 4);
});
