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
  const episode = kingdomino.newGame(players);

  episode.apply(claim(alice, 1));

  assert.equal(
    episode.currentState.props.nextOffers?.offers?.get(1)?.claim?.playerId,
    "alice"
  );
});

test("apply: includes place on first round: throws", () => {
  const players = new Players([alice, bob]);
  const episode = kingdomino.newGame(players);

  expect(() =>
    episode.apply(
      new KingdominoAction({
        player: alice,
        placeTile: new PlaceTile(new Vector2(0, 0), Direction.UP),
      })
    )
  ).toThrowError();
});

test("apply: no claim in non-final round: throws", () => {
  const players = new Players([alice, bob]);
  const episode = unroll(kingdomino.newGame(players), [
    claim(alice, 1),
    claim(bob, 0),
  ]);

  expect(() =>
    episode.apply(
      new KingdominoAction({
        player: bob,
        placeTile: new PlaceTile(new Vector2(4, 3), Direction.DOWN),
      })
    )
  ).toThrowError();
});

test("apply: placement out of bounds: throws", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = unroll(kingdomino.newGame(players), [
    claim(alice, 1),
    claim(bob, 0),
    claim(cecile, 2),
  ]);

  expect(() =>
    episode.apply(
      new KingdominoAction({
        player: bob,
        claimTile: { offerIndex: 0 },
        placeTile: new PlaceTile(new Vector2(25, 25), Direction.DOWN),
      })
    )
  ).toThrowError();
});

test("apply: no matching terrain: throws", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = unroll(kingdomino.newGame(players), [
    claim(alice, 1),
    claim(bob, 0),
    claim(cecile, 2),
  ]);

  expect(() =>
    episode.apply(
      new KingdominoAction({
        player: bob,
        claimTile: { offerIndex: 0 },
        placeTile: new PlaceTile(new Vector2(0, 0), Direction.DOWN),
      })
    )
  ).toThrowError();
});

test("apply: updates player board", () => {
  const players = new Players([alice, bob, cecile]);
  const episode = kingdomino.newGame(players);
  // Capture the first offer tile here since that's the one we'll place later
  const tileNumber = requireDefined(
    episode.currentState.props.nextOffers?.offers?.get(0)?.tileNumber
  ) as number;
  const tile = Tile.withNumber(tileNumber);
  unroll(episode, [claim(alice, 1), claim(bob, 0), claim(cecile, 2)]);

  const after = episode.apply(
    new KingdominoAction({
      player: bob,
      claimTile: { offerIndex: 0 },
      placeTile: new PlaceTile(
        PlayerBoard.center.plus(Direction.DOWN.offset),
        Direction.DOWN
      ),
    })
  );

  // console.log(`Expected tile is ${JSON.stringify(tile)}`);
  // Bob claimed the first tile
  const square0Location = PlayerBoard.center.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square0Location), tile.properties[0]);
  const square1Location = square0Location.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square1Location), tile.properties[1]);
});

function claim(player: Player, offerIndex: number) {
  return new KingdominoAction({
    player: player,
    claimTile: { offerIndex: offerIndex },
  });
}
