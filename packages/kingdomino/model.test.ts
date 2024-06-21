import { test } from "vitest";
import { Kingdomino } from "./kingdomino.js";
import { EpisodeConfiguration, Player, Players } from "game";
import { KingdominoModel, placementToCodecIndex, policyCodec } from "./model.js";
import { assert } from "chai";
import { Map, Seq } from "immutable";
import { KingdominoAction } from "./action.js";
import { PlaceTile } from "./base.js";
import { Vector2, Direction } from "./util.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const model = new KingdominoModel();

test("stateCodec.encode", () => {
  const snapshot = Kingdomino.INSTANCE.newEpisode(
    new EpisodeConfiguration(players)
  );

  const vector = new KingdominoModel().encodeState(snapshot);
});

test("encodeValues: two players: result has length four", () => {
  const vector = model.encodeValues(players, {
    playerIdToValue: Map([
      [alice.id, 2],
      [bob.id, 8],
    ]),
  });

  assert.equal(vector.length, 4);
});

test("decodeValues", () => {
  const vector = [0.1, 0.2, 0.3, 0.4];

  const playerValues = model.decodeValues(players, vector);

  assert.equal(playerValues.playerIdToValue.get(alice.id), 0.1);
  assert.equal(playerValues.playerIdToValue.get(bob.id), 0.2);
});

test("encodePolicy: stores placement values at expected index", () => {
  const placement1 = new PlaceTile(new Vector2(-4, -3), Direction.LEFT);
  const placement2 = new PlaceTile(new Vector2(1, 2), Direction.DOWN);
  const actionToVisitCount = Map([
    [KingdominoAction.placeTile(placement1), 1],
    [KingdominoAction.placeTile(placement2), 2],
  ]);

  const policyVector = model.encodePolicy(actionToVisitCount);
  const placeProbabilitiesVector = policyCodec.decode(policyVector).placeProbabilities;

  console.log(
    `vector is ${JSON.stringify(
      Seq(placeProbabilitiesVector.entries())
        .filter(([, value]) => value != 0)
        .toArray()
    )}`
  );

  console.log(`expected index is ${placementToCodecIndex(placement1)}`);
  assert.equal(placeProbabilitiesVector[placementToCodecIndex(placement1)], 1);
  console.log(`expected index is ${placementToCodecIndex(placement2)}`);
  assert.equal(placeProbabilitiesVector[placementToCodecIndex(placement2)], 2);
});
