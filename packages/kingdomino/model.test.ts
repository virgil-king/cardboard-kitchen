import { test } from "vitest";
import { Kingdomino } from "./kingdomino.js";
import { EpisodeConfiguration, Player, PlayerValues, Players } from "game";
import {
  KingdominoModel,
  placementToCodecIndex,
  policyCodec,
} from "./model.js";
import { assert } from "chai";
import { Map, Seq } from "immutable";
import { KingdominoAction } from "./action.js";
import { PlaceTile } from "./base.js";
import { Vector2, Direction } from "./util.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const episodeConfig = new EpisodeConfiguration(players);
const model = KingdominoModel.fresh();

test("stateCodec.encode", () => {
  const snapshot = Kingdomino.INSTANCE.newEpisode(episodeConfig);

  const vector = model.encodeState(snapshot);
});

test("encodeValues: two players: result has length four", () => {
  const vector = model.trainingModel().encodeValues(
    players,
    new PlayerValues(
      Map([
        [alice.id, 2],
        [bob.id, 8],
      ])
    )
  );

  assert.equal(vector.length, 4);
});

test("decodeValues", () => {
  const vector = [0.1, 0.2, 0.3, 0.4];

  const playerValues = model.inferenceModel.decodeValues(players, vector);

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

  const policyVector = model.trainingModel().encodePolicy(actionToVisitCount);
  const placeProbabilitiesVector =
    policyCodec.decode(policyVector).placeProbabilities;

  assert.equal(
    placeProbabilitiesVector[placementToCodecIndex(placement1)],
    1 / 3
  );
  assert.equal(
    placeProbabilitiesVector[placementToCodecIndex(placement2)],
    2 / 3
  );
});

test("JSON round trip: inference behavior is preserved", async () => {
  const artifacts = await model.toJson();
  const model2 = await KingdominoModel.fromJson(artifacts);
  const snapshot = new Kingdomino().newEpisode(episodeConfig);

  const prediction1 = model.inferenceModel.infer(snapshot);
  const prediction2 = model2.inferenceModel.infer(snapshot);

  // console.log(prediction1.policy.toArray());
  // console.log(prediction2.policy.toArray());
  // console.log(prediction1.value.playerIdToValue.toArray());
  // console.log(prediction2.value.playerIdToValue.toArray());

  assert.isTrue(prediction1.policy.equals(prediction2.policy));
  assert.isTrue(
    prediction1.value.playerIdToValue.equals(prediction2.value.playerIdToValue)
  );
});

test("JSON + structured clone round trip: inference behavior is preserved", async () => {
  const artifacts = structuredClone(await model.toJson());
  const model2 = await KingdominoModel.fromJson(artifacts);
  const snapshot = new Kingdomino().newEpisode(episodeConfig);

  const prediction1 = model.inferenceModel.infer(snapshot);
  const prediction2 = model2.inferenceModel.infer(snapshot);

  // console.log(prediction1.policy.toArray());
  // console.log(prediction2.policy.toArray());
  // console.log(prediction1.value.playerIdToValue.toArray());
  // console.log(prediction2.value.playerIdToValue.toArray());

  assert.isTrue(prediction1.policy.equals(prediction2.policy));
  assert.isTrue(
    prediction1.value.playerIdToValue.equals(prediction2.value.playerIdToValue)
  );
});
