import { Episode, EpisodeConfiguration, Player, Players } from "game";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { Direction, Vector2 } from "./util.js";

import { test } from "vitest";
import { assert } from "chai";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
} from "./base.js";
import { KingdominoState } from "./state.js";
import _ from "lodash";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");

// TODO move other state and action tests into this file

test("apply: discard last tile in game: ends game", () => {
  const players = new Players(alice, bob, cecile);
  const episode = episodeWithPlayers(players, _.range(1, 4)).apply(
    claim(alice, 0),
    claim(bob, 1),
    claim(cecile, 2),
    KingdominoAction.placeTile(
      alice,
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.placeTile(
      bob,
      new PlaceTile(new Vector2(1, 0), Direction.RIGHT)
    ),
    KingdominoAction.discardTile(cecile)
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

function claim(player: Player, offerIndex: number) {
  return KingdominoAction.claimTile(player, new ClaimTile(offerIndex));
}
