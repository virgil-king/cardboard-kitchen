import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2 } from "./util.js";
import { Tile } from "./tile.js";

import { expect, test } from "vitest";
import { assert } from "chai";
import { PlaceTile } from "./base.js";
import { PlayerBoard } from "./board.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("apply: includes claim: adds claim", () => {
  const players = new Players(alice, bob);
  const episode = kingdomino.newEpisode(players);

  episode.apply(claim(alice, 1));

  assert.equal(
    episode.currentState.props.nextOffers?.offers?.get(1)?.claim?.playerId,
    "alice"
  );
});

test("apply: includes place on first round: throws", () => {
  const players = new Players(alice, bob);
  const episode = kingdomino.newEpisode(players);

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        alice,
        new PlaceTile(new Vector2(0, 0), Direction.UP)
      )
    )
  ).toThrowError();
});

test("apply: place before claim in non-final round: throws", () => {
  const players = new Players(alice, bob);
  const episode = unroll(kingdomino.newEpisode(players), [
    claim(alice, 1),
    claim(bob, 0),
  ]);

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        bob,
        new PlaceTile(new Vector2(4, 3), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: placement out of bounds: throws", () => {
  const players = new Players(alice, bob, cecile);
  const episode = unroll(kingdomino.newEpisode(players), [
    claim(alice, 1),
    claim(bob, 0),
    claim(cecile, 2),
  ]);

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        bob,
        new PlaceTile(new Vector2(25, 25), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: no matching terrain: throws", () => {
  const players = new Players(alice, bob, cecile);
  const episode = unroll(kingdomino.newEpisode(players), [
    claim(alice, 1),
    claim(bob, 0),
    claim(cecile, 2),
  ]);

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        bob,
        new PlaceTile(new Vector2(0, 0), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: updates player board", () => {
  const players = new Players(alice, bob, cecile);
  const episode = kingdomino.newEpisode(players);
  // Capture the first offer tile here since that's the one we'll place later
  const tileNumber = requireDefined(
    episode.currentState.props.nextOffers?.offers?.get(0)?.tileNumber
  ) as number;
  const tile = Tile.withNumber(tileNumber);
  unroll(episode, [claim(alice, 1), claim(bob, 0), claim(cecile, 2)]);

  const after = episode.apply(
    KingdominoAction.placeTile(
      bob,
      new PlaceTile(
        PlayerBoard.center.plus(Direction.DOWN.offset),
        Direction.DOWN
      )
    )
  );

  // Bob claimed the first tile
  const square0Location = PlayerBoard.center.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square0Location), tile.properties[0]);
  const square1Location = square0Location.plus(Direction.DOWN.offset);
  assert.equal(after.locationState(bob, square1Location), tile.properties[1]);
});

function claim(player: Player, offerIndex: number) {
  return KingdominoAction.claimTile(player, { offerIndex: offerIndex });
}
