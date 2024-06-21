import {
  adjacentEmptyLocations,
  possiblePlacements,
  streamingRandom,
} from "./randomplayer.js";

import { test } from "vitest";
import { assert } from "chai";
import { Kingdomino } from "./kingdomino.js";
import { Episode, EpisodeConfiguration, Player, Players } from "game";
import { KingdominoAction } from "./action.js";
import { Map, Set } from "immutable";
import { Direction, Vector2 } from "./util.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  LocationState,
  PlaceTile,
  centerX,
  centerY,
  playAreaRadius,
} from "./base.js";
import { PlayerBoard } from "./board.js";
import { requireDefined } from "studio-util";
import { KingdominoState } from "./state.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

test("adjacentEmptyLocations: empty board: yields four adjacent locations", () => {
  const result = Set(adjacentEmptyLocations(new PlayerBoard(Map())));

  assert.isTrue(
    result.equals(
      Set([
        new Vector2(centerX - 1, centerY),
        new Vector2(centerX, centerY + 1),
        new Vector2(centerX + 1, centerY),
        new Vector2(centerX, centerY - 1),
      ])
    )
  );
});

test("adjacentEmptyLocations: one tile placed: yields eight adjacent locations", () => {
  const result = Set(
    adjacentEmptyLocations(
      new PlayerBoard(
        Map([
          [new Vector2(centerX + 1, centerY), new LocationState(1, 0)],
          [new Vector2(centerX + 2, centerY), new LocationState(1, 1)],
        ])
      )
    )
  );

  assert.isTrue(
    result.equals(
      Set([
        new Vector2(centerX - 1, centerY),
        new Vector2(centerX, centerY + 1),
        new Vector2(centerX + 1, centerY + 1),
        new Vector2(centerX + 2, centerY + 1),
        new Vector2(centerX + 3, centerY),
        new Vector2(centerX + 2, centerY - 1),
        new Vector2(centerX + 1, centerY - 1),
        new Vector2(centerX, centerY - 1),
      ])
    )
  );
});

test("possiblePlacements: returns all options for first tile", () => {
  const episode = episodeWithPlayers(new Players(alice, bob, cecile));
  episode.apply(claim(0), claim(1), claim(2));

  const placements = Set(possiblePlacements(episode.currentSnapshot.state));

  assert.equal(placements.count(), 24);
  const check = (x: number, y: number, direction: Direction) => {
    assert.isTrue(
      placements.contains(new PlaceTile(new Vector2(x, y), direction))
    );
  };
  // Placements for square zero touching the center
  check(-1, 0, Direction.DOWN);
  check(-1, 0, Direction.LEFT);
  check(-1, 0, Direction.UP);
  check(0, 1, Direction.LEFT);
  check(0, 1, Direction.UP);
  check(0, 1, Direction.RIGHT);
  check(1, 0, Direction.UP);
  check(1, 0, Direction.RIGHT);
  check(1, 0, Direction.DOWN);
  check(0, -1, Direction.RIGHT);
  check(0, -1, Direction.DOWN);
  check(0, -1, Direction.LEFT);

  // Placements for square one touching the center
  check(-1, -1, Direction.UP);
  check(-2, 0, Direction.RIGHT);
  check(-1, 1, Direction.DOWN);
  check(-1, 1, Direction.RIGHT);
  check(0, 2, Direction.DOWN);
  check(1, 1, Direction.LEFT);
  check(1, 1, Direction.DOWN);
  check(2, 0, Direction.LEFT);
  check(1, -1, Direction.UP);
  check(1, -1, Direction.LEFT);
  check(0, -2, Direction.UP);
  check(-1, -1, Direction.RIGHT);
});

test("possiblePlacements: does not return out of bounds placements", () => {
  // Arrange the tiles so that tiles with the same offer index in the first
  // two rounds have matching terrain
  const episode = episodeWithPlayers(
    new Players(alice, bob, cecile),
    [1, 3, 7, 2, 4, 8, 10, 11, 12]
  );
  episode.apply(claim(0), claim(1), claim(2));
  const firstTilePlacement = new PlaceTile(new Vector2(1, 0), Direction.RIGHT);
  episode.apply(
    KingdominoAction.placeTile(firstTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.placeTile(firstTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(1)),
    KingdominoAction.placeTile(firstTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(2))
  );
  const secondTilePlacement = new PlaceTile(new Vector2(3, 0), Direction.RIGHT);
  episode.apply(
    KingdominoAction.placeTile(secondTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.placeTile(secondTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(1)),
    KingdominoAction.placeTile(secondTilePlacement),
    KingdominoAction.claimTile(new ClaimTile(2))
  );

  const placements = Set(possiblePlacements(episode.currentSnapshot.state));

  assert.isTrue(
    placements.every((placement) => {
      return (
        placement.squareLocation(0).x <= playAreaRadius &&
        placement.squareLocation(1).x <= playAreaRadius
      );
    })
  );
});

function episodeWithPlayers(
  players: Players,
  shuffledTileNumbers: Array<number> | undefined = undefined
): Episode<KingdominoConfiguration, KingdominoState, KingdominoAction> {
  const episodeConfig = new EpisodeConfiguration(players);
  const snapshot = kingdomino.newKingdominoEpisode(
    new EpisodeConfiguration(players),
    shuffledTileNumbers
  );
  return new Episode(kingdomino, snapshot);
}

function claim(offerIndex: number) {
  return KingdominoAction.claimTile(new ClaimTile(offerIndex));
}

test("streamingRandom: returns some item", () => {
  const candidates = [0, 1, 2];
  const items = function* () {
    for (const item of candidates) {
      yield item;
    }
  };

  const result = requireDefined(streamingRandom(items()));

  assert(candidates.indexOf(result) != -1);
});
