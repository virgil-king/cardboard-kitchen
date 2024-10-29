import {
  streamingRandom,
} from "./randomplayer.js";

import { test } from "vitest";
import { assert } from "chai";
import { Kingdomino } from "./kingdomino.js";
import { Episode, EpisodeConfiguration, Player, Players } from "game";
import { KingdominoAction } from "./action.js";
import {
  ClaimTile,
  KingdominoConfiguration,
} from "./base.js";
import { requireDefined } from "studio-util";
import { KingdominoState } from "./state.js";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

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
