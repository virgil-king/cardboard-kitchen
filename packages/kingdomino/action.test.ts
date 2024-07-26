import { Episode, EpisodeConfiguration, Player, Players } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2 } from "./util.js";
import { Tile } from "./tile.js";

import { expect, test } from "vitest";
import { assert } from "chai";
import { ClaimTile, PlaceTile } from "./base.js";
import { PlayerBoard } from "./board.js";
import { KingdominoState } from "./state.js";
import { requireDefined } from "studio-util";
import { off } from "process";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

test("apply: includes claim: adds claim", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players);

  episode.apply(claim(1));

  assert.equal(
    episode.currentSnapshot.state.props.nextOffers?.offers?.get(1)?.claim
      ?.playerId,
    "alice"
  );
});

test("apply: includes place on first round: throws", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players);

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(new PlaceTile(new Vector2(0, 0), Direction.UP))
    )
  ).toThrowError();
});

test("apply: place before claim in non-final round: throws", () => {
  const players = new Players(alice, bob);
  const episode = episodeWithPlayers(players).apply(claim(1), claim(0));

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        new PlaceTile(new Vector2(4, 3), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: placement out of bounds: throws", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(
    claim(1),
    claim(0),
    claim(2)
  );

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        new PlaceTile(new Vector2(25, 25), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: no matching terrain: throws", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(
    claim(1),
    claim(0),
    claim(2)
  );

  expect(() =>
    episode.apply(
      KingdominoAction.placeTile(
        new PlaceTile(new Vector2(0, 0), Direction.DOWN)
      )
    )
  ).toThrowError();
});

test("apply: updates player board", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players);
  // Capture the first offer tile here since that's the one we'll place later
  const tileNumber = requireDefined(
    episode.currentSnapshot.state.props.nextOffers?.offers?.get(0)?.tileNumber
  ) as number;
  const tile = Tile.withNumber(tileNumber);
  episode.apply(claim(1), claim(0), claim(2));

  episode.apply(
    KingdominoAction.placeTile(
      new PlaceTile(
        PlayerBoard.center.plus(Direction.DOWN.offset),
        Direction.DOWN
      )
    )
  );

  // Bob claimed the first tile
  const square0Location = PlayerBoard.center.plus(Direction.DOWN.offset);
  assert.equal(
    episode.currentSnapshot.state.locationState(bob, square0Location),
    tile.properties[0]
  );
  const square1Location = square0Location.plus(Direction.DOWN.offset);
  assert.equal(
    episode.currentSnapshot.state.locationState(bob, square1Location),
    tile.properties[1]
  );
});

test("equals: different cases: returns false", () => {
  assert.isFalse(claim(1).equals(KingdominoAction.discardTile()));
});

test("equals: not an action: returns false", () => {
  assert.isFalse(claim(1).equals("pizza"));
});

test("equals: equivalent claims: returns true", () => {
  assert.isTrue(claim(1).equals(claim(1)));
});

test("equals: different claims: returns false", () => {
  assert.isFalse(claim(1).equals(claim(2)));
});

test("equals: equivalent places: returns true", () => {
  assert.isTrue(place(1, 1, Direction.UP).equals(place(1, 1, Direction.UP)));
});

test("equals: equivalent claims: returns true", () => {
  assert.isFalse(place(1, 1, Direction.UP).equals(place(1, 1, Direction.DOWN)));
});

test("claim: codec round trip", () => {
  const claim = KingdominoAction.claimTile(new ClaimTile(2));
  
  const json = claim.toJson();
  const jsonString = JSON.stringify(json);
  const secondJsonString = JSON.stringify(KingdominoAction.fromJson(json).toJson());

  assert.isTrue(claim.equals(KingdominoAction.fromJson(json)));
  assert.equal(jsonString, secondJsonString);
});

test("place: codec round trip", () => {
  const place = KingdominoAction.placeTile(new PlaceTile(new Vector2(-1, 1), Direction.LEFT));
  
  const json = place.toJson();
  const jsonString = JSON.stringify(json);
  const secondJsonString = JSON.stringify(KingdominoAction.fromJson(json).toJson());

  assert.isTrue(place.equals(KingdominoAction.fromJson(json)));
  assert.equal(jsonString, secondJsonString);
});

test("discard: codec round trip", () => {
  const discard = KingdominoAction.discardTile();
  
  const json = discard.toJson();
  const jsonString = JSON.stringify(json);
  const secondJsonString = JSON.stringify(KingdominoAction.fromJson(json).toJson());

  assert.isTrue(discard.equals(KingdominoAction.fromJson(json)));
  assert.equal(jsonString, secondJsonString);
});

function episodeWithPlayers(
  players: Players,
  shuffledTileNumbers: Array<number> | undefined = undefined
): Episode<any, KingdominoState, KingdominoAction> {
  const episodeConfig = new EpisodeConfiguration(players);
  return new Episode(
    kingdomino,
    kingdomino.newKingdominoEpisode(episodeConfig, shuffledTileNumbers)
  );
}

function claim(offerIndex: number): KingdominoAction {
  return KingdominoAction.claimTile(new ClaimTile(offerIndex));
}

function place(x: number, y: number, direction: Direction): KingdominoAction {
  return KingdominoAction.placeTile(
    new PlaceTile(new Vector2(x, y), direction)
  );
}
