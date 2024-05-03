import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { Terrain, Tile } from "./tile.js";
import { ClaimTile, PlaceTile, centerX, centerY } from "./base.js";
import { NextAction } from "./state.js";
import _ from "lodash";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("newGame: board has castle in center", () => {
  const players = new Players([alice, bob]);

  const episode = kingdomino.newGame(players);

  for (let player of players.players) {
    assert(
      episode.currentState.locationState(player, new Vector2(centerX, centerY)).terrain ==
        Terrain.TERRAIN_CENTER
    );
  }
});

test("newGame: current player is first in list", () => {
  const players = new Players([alice, bob]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.currentPlayer() == alice, "first player should be alice");
});

test("newGame: previous offers is undefined", () => {
  const players = new Players([alice, bob]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.props.previousOffers == undefined);
});

test("newGame: two players: offer has four tiles", () => {
  const players = new Players([alice, bob]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.props.nextOffers?.offers.size == 4);
});

test("newGame: three players: offer has three tiles", () => {
  const players = new Players([alice, bob, cecile]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.props.nextOffers?.offers.size == 3);
});

test("newGame: four players: offer has four tiles", () => {
  const players = new Players([alice, bob, cecile, derek]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.props.nextOffers?.offers.size == 4);
});

test("newGame: no previous offers", () => {
  const players = new Players([alice, bob, cecile, derek]);

  const episode = kingdomino.newGame(players);

  assert(episode.currentState.props.previousOffers == undefined);
});

test("newGame: next action is claim", () => {
  const players = new Players([alice, bob, cecile, derek]);

  const episode = kingdomino.newGame(players);

  assert.equal(episode.currentState.nextAction, NextAction.CLAIM);
});

test("currentPlayer: after one action: returns second player", () => {
  const players = new Players([alice, bob]);
  const episode = kingdomino.newGame(players);

  episode.apply(claim(alice, 1));

  assert.equal(episode.currentState.currentPlayer(), bob);
});

test("currentPlayer: second round: returns player with first claim", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players);
  unroll(episode, [
    claim(alice, 2),
    claim(bob, 1),
    claim(cecile, 0),
  ]);

  // console.log(`Next action is ${after.nextAction}`);
  assert.equal(episode.currentState.currentPlayer(), cecile);
});

test("claimTile: first round: next action is claim", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players);
  unroll(episode, [claim(alice, 2)]);

  assert.equal(episode.currentState.nextAction, NextAction.CLAIM);
});

test("claimTile: second round: next action is place", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players);
  unroll(episode, [
    claim(alice, 2),
    claim(bob, 1),
    claim(cecile, 0),
    new KingdominoAction({
      player: cecile,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
      claimTile: new ClaimTile(0),
    }),
  ]);

  assert.equal(episode.currentState.nextAction, NextAction.PLACE);
});

test("placeTile: end of game: next action is undefined", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players, _.range(1, 4));
  unroll(episode, [
    claim(alice, 0),
    claim(bob, 1),
    claim(cecile, 2),
    new KingdominoAction({
      player: alice,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
    new KingdominoAction({
      player: bob,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
    new KingdominoAction({
      player: cecile,
      placeTile: new PlaceTile(new Vector2(1, 0), Direction.RIGHT),
    }),
  ]);

  assert.equal(episode.currentState.nextAction, undefined);
});

function claim(player: Player, offerIndex: number) {
  return new KingdominoAction({
    player: player,
    claimTile: { offerIndex: offerIndex },
  });
}
