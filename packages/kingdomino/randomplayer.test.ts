import { possiblePlacements, streamingRandom } from "./randomplayer.js";

import { test } from "vitest";
import { assert } from "chai";
import { Kingdomino } from "./kingdomino.js";
import { Player, Players, unroll } from "game";
import { KingdominoAction } from "./action.js";
import { Set } from "immutable";
import * as Proto from "kingdomino-proto";

const kingdomino = new Kingdomino();
const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");

test("streamingRandom: returns some item", () => {
  const candidates = [0, 1, 2];
  const items = function* () {
    for (const item of candidates) {
      yield item;
    }
  };

  const result = streamingRandom(items());

  assert(candidates.indexOf(result) != -1);
});

test("possiblePlacements: returns all options for first tile", () => {
  const state = kingdomino.newGame(new Players([alice, bob, cecile]));
  const startOfSecondRound = unroll(state, [claim(0), claim(1), claim(2)]);

  const placements = Set(Array.from(possiblePlacements(startOfSecondRound)));

  console.log(JSON.stringify(startOfSecondRound));
  console.log(placements.toJSON());
  assert.equal(placements.count(), 12);
  assert.isTrue(
    placements.find(
      (it) =>
        it.x == 3 && it.y == 4 && it.orientation == Proto.TileOrientation.DOWN
    ) != undefined
  );
  // kingdomino:test:   { x: 3, y: 4, orientation: 3 },
  // kingdomino:test:   { x: 3, y: 4, orientation: 4 },
  // kingdomino:test:   { x: 3, y: 4, orientation: 2 },
  // kingdomino:test:   { x: 4, y: 5, orientation: 3 },
  // kingdomino:test:   { x: 4, y: 5, orientation: 4 },
  // kingdomino:test:   { x: 4, y: 5, orientation: 1 },
  // kingdomino:test:   { x: 5, y: 4, orientation: 4 },
  // kingdomino:test:   { x: 5, y: 4, orientation: 1 },
  // kingdomino:test:   { x: 5, y: 4, orientation: 2 },
  // kingdomino:test:   { x: 4, y: 3, orientation: 3 },
  // kingdomino:test:   { x: 4, y: 3, orientation: 1 },
  // kingdomino:test:   { x: 4, y: 3, orientation: 2 }
});

function claim(offerIndex: number) {
  return new KingdominoAction({ claimTile: { offerIndex: offerIndex } });
}
