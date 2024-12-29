import { Episode, EpisodeConfiguration, Player, Players, Vector2 } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import { ClaimTile, KingdominoConfiguration, PlaceTile } from "./base.js";
import { KingdominoState, NextAction } from "./state.js";
import _ from "lodash";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

// TODO move other state and action tests into this file

test("apply: last claim in second round: next action is place", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players).apply(
    claim(2),
    claim(1),
    claim(0),
    KingdominoAction.discardTile(),
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.discardTile(),
    KingdominoAction.claimTile(new ClaimTile(1)),
    KingdominoAction.discardTile(),
    KingdominoAction.claimTile(new ClaimTile(2))
  );

  assert.equal(
    episode.currentSnapshot.state.nextAction,
    NextAction.RESOLVE_OFFER
  );
});

test("apply: discard last tile in game: ends game", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players, _.range(1, 4)).apply(
    claim(0),
    claim(1),
    claim(2),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.discardTile()
  );

  assert.isDefined(kingdomino.result(episode.currentSnapshot));
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
