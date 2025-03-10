import { test } from "vitest";
import {
  Episode,
  EpisodeConfiguration,
  Player,
  PlayerValues,
  Players,
  Vector2,
  requireDefined,
} from "game";
import { assert } from "chai";
import { Map, Range } from "immutable";
import { ActionStatistics, StateTrainingData } from "agent";
import * as _ from "lodash";
import * as tf from "@tensorflow/tfjs";
import {
  boardCodec,
  encodePlacementPolicy,
  KingdominoModel,
  KingdominoModelEncoder,
  locationPropertiesCodec,
  placementPolicyLinearization,
  POLICY_TEMPERATURE,
  policyCodec,
} from "./model.js";
import {
  ClaimTile,
  Direction,
  Kingdomino,
  KingdominoAction,
  NO_TRANSFORM,
  PlaceTile,
  playAreaRadius,
  Terrain,
} from "kingdomino";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const episodeConfig = new EpisodeConfiguration(players);
const model = KingdominoModel.fresh();

test("encodeValues: two players: result has length four", () => {
  const vector = KingdominoModelEncoder.INSTANCE.encodeValues(
    players,
    new PlayerValues(
      Map([
        [alice.id, 0],
        [bob.id, 1],
      ])
    )
  );

  assert.equal(vector.length, 4);
});

test("decodeValues: returns expected values", () => {
  const vector = [0.1, 0.2, 0.3, 0.4];

  const playerValues = model.inferenceModel.decodeValues(players, vector);

  assertClose(requireDefined(playerValues.playerIdToValue.get(alice.id)), 0.1);
  assertClose(requireDefined(playerValues.playerIdToValue.get(bob.id)), 0.2);
});

test("encodePlacementPolicy: stores placement values at expected index", () => {
  const placement1 = new PlaceTile(new Vector2(-4, -3), Direction.LEFT);
  const placement2 = new PlaceTile(new Vector2(1, 2), Direction.DOWN);
  const actionToStatistics = Map([
    [
      KingdominoAction.placeTile(placement1),
      new ActionStatistics(
        0.5,
        0.5,
        1,
        new PlayerValues(
          Map([
            [alice.id, 0],
            [bob.id, 1],
          ])
        )
      ),
    ],
    [
      KingdominoAction.placeTile(placement2),
      new ActionStatistics(
        0.5,
        0.5,
        2,
        new PlayerValues(
          Map([
            [alice.id, 0],
            [bob.id, 1],
          ])
        )
      ),
    ],
  ]);

  const placementProbabilitiesVector = encodePlacementPolicy(
    actionToStatistics,
    alice,
    NO_TRANSFORM
  );

  console.log(`array=${placementProbabilitiesVector}`);

  assertClose(
    placementPolicyLinearization.get(
      placementProbabilitiesVector,
      placement1.location.x + playAreaRadius,
      placement1.location.y + playAreaRadius,
      placement1.direction.index
    ),
    requireDefined(
      actionToStatistics.get(KingdominoAction.placeTile(placement1))
    ).expectedValues.requirePlayerValue(alice)
  );
  assertClose(
    placementPolicyLinearization.get(
      placementProbabilitiesVector,
      placement2.location.x + playAreaRadius,
      placement2.location.y + playAreaRadius,
      placement2.direction.index
    ),
    requireDefined(
      actionToStatistics.get(KingdominoAction.placeTile(placement2))
    ).expectedValues.requirePlayerValue(alice)
  );
});

test("JSON round trip: inference behavior is preserved", async () => {
  const artifacts = await model.toJson();
  const model2 = await KingdominoModel.fromJson(artifacts);
  const snapshot = new Kingdomino().newEpisode(episodeConfig);

  const prediction1 = (await model.inferenceModel.infer([snapshot]))[0];
  const prediction2 = (await model2.inferenceModel.infer([snapshot]))[0];

  assert.isTrue(prediction1.policyLogits.equals(prediction2.policyLogits));
  assert.isTrue(
    prediction1.value.playerIdToValue.equals(prediction2.value.playerIdToValue)
  );
});

test("JSON + structured clone round trip: inference behavior is preserved", async () => {
  const artifacts = structuredClone(await model.toJson());
  const model2 = await KingdominoModel.fromJson(artifacts);
  const snapshot = new Kingdomino().newEpisode(episodeConfig);

  const prediction1 = (await model.inferenceModel.infer([snapshot]))[0];
  const prediction2 = (await model2.inferenceModel.infer([snapshot]))[0];

  assert.isTrue(prediction1.policyLogits.equals(prediction2.policyLogits));
  assert.isTrue(
    prediction1.value.playerIdToValue.equals(prediction2.value.playerIdToValue)
  );
});

test("encodeSample: returns expected board and policy vectors", () => {
  let episode = new Episode(
    Kingdomino.INSTANCE,
    // First and third tiles are double forest
    new Kingdomino().newKingdominoEpisode(
      episodeConfig,
      [3, 1, 4, 7, 2, 8, 9, 10]
    )
  ).apply(
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.claimTile(new ClaimTile(1)),
    KingdominoAction.claimTile(new ClaimTile(2)),
    KingdominoAction.claimTile(new ClaimTile(3)),
    KingdominoAction.placeTile(new PlaceTile(new Vector2(-1, 0), Direction.UP)),
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.placeTile(new PlaceTile(new Vector2(-1, 0), Direction.UP)),
    KingdominoAction.claimTile(new ClaimTile(1))
  );
  const playerValues = new PlayerValues(
    Map([
      [alice.id, 1],
      [bob.id, 0],
    ])
  );
  const sample = new StateTrainingData(
    episode.currentSnapshot,
    Map<KingdominoAction, ActionStatistics>([
      [
        KingdominoAction.placeTile(
          new PlaceTile(new Vector2(-1, 2), Direction.LEFT)
        ),
        new ActionStatistics(
          /* priorProbability= */ 0.5,
          /* priorLogit= */ 0.5,
          /* visitCount= */ 1,
          playerValues
        ),
      ],
    ]),
    playerValues,
    playerValues,
    1
  );

  const encodedSample = KingdominoModelEncoder.INSTANCE.encodeSample(
    sample,
    () => NO_TRANSFORM
  );

  const aliceBoard = encodedSample.state.boards[0];
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      const offset = boardCodec.mapCodec.linearization.getOffset(
        x + playAreaRadius,
        y + playAreaRadius
      );
      const locationProperties = locationPropertiesCodec.decode(
        aliceBoard,
        offset
      );
      const expectedTerrain = (() => {
        if (x == 0 && y == 0) {
          return Terrain.TERRAIN_CENTER;
        } else if (x == -1 && y == 0) {
          return Terrain.TERRAIN_FOREST;
        } else if (x == -1 && y == 1) {
          return Terrain.TERRAIN_FOREST;
        } else {
          return Terrain.TERRAIN_EMPTY;
        }
      })();
      assert.equal(
        locationProperties.terrain,
        expectedTerrain,
        `x=${x}, y=${y}`
      );
    }
  }

  // console.log(JSON.stringify(encodedSample.policyOutput, undefined, 1));

  const alicePlaceLogits = policyCodec.decode(
    encodedSample.policyOutput,
    0
  ).placeProbabilities;
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      for (const directionIndex of Range(0, 4)) {
        const logit =
          alicePlaceLogits[
            placementPolicyLinearization.getOffset(
              x + playAreaRadius,
              y + playAreaRadius,
              directionIndex
            )
          ];
        if (x == -1 && y == 2 && directionIndex == 0) {
          assert.equal(
            logit,
            playerValues.requirePlayerValue(alice) * POLICY_TEMPERATURE
          );
        } else {
          assert.equal(logit, -1 * POLICY_TEMPERATURE);
        }
      }
    }
  }
});

test("encodeSample: with transformation: returns expected board and policy vectors", () => {
  let episode = new Episode(
    Kingdomino.INSTANCE,
    // First and third tiles are double forest
    new Kingdomino().newKingdominoEpisode(
      episodeConfig,
      [3, 1, 4, 7, 2, 8, 9, 10]
    )
  ).apply(
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.claimTile(new ClaimTile(1)),
    KingdominoAction.claimTile(new ClaimTile(2)),
    KingdominoAction.claimTile(new ClaimTile(3)),
    KingdominoAction.placeTile(new PlaceTile(new Vector2(-1, 0), Direction.UP)),
    KingdominoAction.claimTile(new ClaimTile(0)),
    KingdominoAction.placeTile(new PlaceTile(new Vector2(-1, 0), Direction.UP)),
    KingdominoAction.claimTile(new ClaimTile(1))
  );
  const playerValues = new PlayerValues(
    Map([
      [alice.id, 1],
      [bob.id, 0],
    ])
  );
  const sample = new StateTrainingData(
    episode.currentSnapshot,
    Map<KingdominoAction, ActionStatistics>([
      [
        KingdominoAction.placeTile(
          new PlaceTile(new Vector2(-1, 2), Direction.LEFT)
        ),
        new ActionStatistics(
          /* priorProbability= */ 0.5,
          /* priorLogit= */ 0.5,
          /* visitCount= */ 1,
          playerValues
        ),
      ],
    ]),
    playerValues,
    playerValues,
    1
  );

  const encodedSample = KingdominoModelEncoder.INSTANCE.encodeSample(
    sample,
    (player: Player) => {
      return { mirror: true, quarterTurns: 1 };
    }
  );

  const aliceBoard = encodedSample.state.boards[0];
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      const offset = boardCodec.mapCodec.linearization.getOffset(
        x + playAreaRadius,
        y + playAreaRadius
      );
      const locationProperties = locationPropertiesCodec.decode(
        aliceBoard,
        offset
      );
      const expectedTerrain = (() => {
        if (x == 0 && y == 0) {
          return Terrain.TERRAIN_CENTER;
        } else if (x == 0 && y == -1) {
          return Terrain.TERRAIN_FOREST;
        } else if (x == 1 && y == -1) {
          return Terrain.TERRAIN_FOREST;
        } else {
          return Terrain.TERRAIN_EMPTY;
        }
      })();
      assert.equal(
        locationProperties.terrain,
        expectedTerrain,
        `x=${x}, y=${y}`
      );
    }
  }
  const alicePlaceLogits = policyCodec.decode(
    encodedSample.policyOutput,
    0
  ).placeProbabilities;
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      for (const directionIndex of Range(0, 4)) {
        const logit =
          alicePlaceLogits[
            placementPolicyLinearization.getOffset(
              x + playAreaRadius,
              y + playAreaRadius,
              directionIndex
            )
          ];
        if (x == 2 && y == -1 && directionIndex == 3) {
          assert.equal(
            logit,
            playerValues.requirePlayerValue(alice) * POLICY_TEMPERATURE
          );
        } else {
          assert.equal(logit, -1 * POLICY_TEMPERATURE);
        }
      }
    }
  }
});

test("tensor testing", () => {
  const array = [
    [1, 2],
    [3, 4],
  ];
  const tensor = tf.tensor(array);
  const data = tensor.dataSync<"float32">();
  assertClose(data[0], 1);
  assertClose(data[1], 2);
  assertClose(data[2], 3);
  assertClose(data[3], 4);
});

function assertClose(actual: number, expected: number) {
  assert.isTrue(
    Math.abs(actual - expected) < 0.01,
    `${actual} was not close to ${expected}`
  );
}
