import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2, requireDefined } from "./util.js";
import { Tile } from "./tile.js";

import { expect, test } from "vitest";
import { assert } from "chai";
import { PlaceTile, PlayerBoard } from "./base.js";

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
    after.props.nextOffers?.offers?.get(1)?.claim?.playerId ==
      before.requireCurrentPlayer().id
  );
});

test("apply: includes place on first round: throws", () => {
  const players = new Players([alice, bob]);
  const before = kingdomino.newGame(players);

  expect(() =>
    new KingdominoAction({
      placeTile: new PlaceTile(new Vector2(0, 0), Direction.UP),
    }).apply(before)
  ).toThrowError();
});

test("apply: no claim in non-final round: throws", () => {
  const players = new Players([alice, bob]);
  const state = unroll(kingdomino.newGame(players), [claim(1), claim(0)]);

  expect(() =>
    new KingdominoAction({
      placeTile: new PlaceTile(new Vector2(4, 3), Direction.DOWN),
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
      placeTile: new PlaceTile(new Vector2(25, 25), Direction.DOWN),
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
      placeTile: new PlaceTile(new Vector2(0, 0), Direction.DOWN),
    }).apply(state)
  ).toThrowError();
});

test("apply: updates player board", () => {
  const players = new Players([alice, bob, cecile]);
  const initialState = kingdomino.newGame(players);
  // Capture the first offer tile here since that's the one we'll place later
  const tileNumber = requireDefined(
    initialState.props.nextOffers?.offers?.get(0)?.tileNumber
  ) as number;
  const tile = Tile.withNumber(tileNumber);
  const startOfSecondRound = unroll(initialState, [
    claim(1),
    claim(0),
    claim(2),
  ]);

  const after = new KingdominoAction({
    claimTile: { offerIndex: 0 },
    placeTile: new PlaceTile(
      PlayerBoard.center.plus(Direction.DOWN.offset),
      Direction.DOWN
    ),
  }).apply(startOfSecondRound);

  console.log(`Expected tile is ${JSON.stringify(tile)}`);
  // Bob claimed the first tile
  const square0Location = PlayerBoard.center.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square0Location), tile.properties[0]);
  const square1Location = square0Location.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square1Location), tile.properties[1]);
});

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}
