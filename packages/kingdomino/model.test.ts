import { test } from "vitest";
import { Kingdomino } from "./kingdomino.js";
import {
  Episode,
  EpisodeConfiguration,
  Player,
  PlayerValues,
  Players,
} from "game";
import {
  placementPolicyLinearization,
  KingdominoModel,
  boardCodec,
  locationPropertiesCodec,
  encodePlacementPolicy,
  policyCodec,
} from "./model.js";
import { assert } from "chai";
import { Map, Range } from "immutable";
import { KingdominoAction } from "./action.js";
import { ClaimTile, PlaceTile, playAreaRadius } from "./base.js";
import { Vector2, Direction, NO_TRANSFORM } from "./util.js";
import { ActionStatistics, StateTrainingData } from "training-data";
import * as _ from "lodash";
import { requireDefined } from "studio-util";
import { Terrain } from "./tile.js";
import * as tf from "@tensorflow/tfjs";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const episodeConfig = new EpisodeConfiguration(players);
const model = KingdominoModel.fresh();

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

test("decodeValues: returns expected values", () => {
  const vector = [0.1, 0.2, 0.3, 0.4];

  const playerValues = model.inferenceModel.decodeValues(players, vector);

  assertClose(requireDefined(playerValues.playerIdToValue.get(alice.id)), 0.1);
  assertClose(requireDefined(playerValues.playerIdToValue.get(bob.id)), 0.2);
});

test("encodePlacementPolicy: stores placement values at expected index", () => {
  const placement1 = new PlaceTile(new Vector2(-4, -3), Direction.LEFT);
  const placement2 = new PlaceTile(new Vector2(1, 2), Direction.DOWN);
  const actionToVisitCount = Map([
    [
      KingdominoAction.placeTile(placement1),
      new ActionStatistics(
        0.5,
        0.5,
        1,
        new PlayerValues(
          Map([
            [alice.id, 1],
            [bob.id, 2],
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
            [alice.id, 1],
            [bob.id, 2],
          ])
        )
      ),
    ],
  ]);

  const placementProbabilitiesVector = encodePlacementPolicy(
    actionToVisitCount,
    NO_TRANSFORM
  );

  assertClose(
    placementPolicyLinearization.get(
      placementProbabilitiesVector,
      placement1.location.x + playAreaRadius,
      placement1.location.y + playAreaRadius,
      placement1.direction.index
    ),
    1
  );
  assertClose(
    placementPolicyLinearization.get(
      placementProbabilitiesVector,
      placement2.location.x + playAreaRadius,
      placement2.location.y + playAreaRadius,
      placement2.direction.index
    ),
    2
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
  const model2 = await KingdominoModel.fromJson(artifacts, tf);
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
          /* prior= */ 0.5,
          /* visitCount= */ 1,
          new PlayerValues(Map([]))
        ),
      ],
    ]),
    playerValues,
    playerValues
  );

  const encodedSample = model
    .trainingModel()
    .encodeSample(sample, () => NO_TRANSFORM);

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
  const alicePlaceVisitCounts = policyCodec.decode(
    encodedSample.policyOutput,
    0
  ).placeProbabilities;
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      for (const directionIndex of Range(0, 4)) {
        const policyValue =
          alicePlaceVisitCounts[
            placementPolicyLinearization.getOffset(
              x + playAreaRadius,
              y + playAreaRadius,
              directionIndex
            )
          ];
        if (x == -1 && y == 2 && directionIndex == 0) {
          assert.equal(policyValue, 1);
        } else {
          assert.equal(policyValue, 0);
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
          /* prior= */ 0.5,
          /* visitCount= */ 1,
          new PlayerValues(Map([]))
        ),
      ],
    ]),
    playerValues,
    playerValues
  );

  const encodedSample = model
    .trainingModel()
    .encodeSample(sample, (player: Player) => {
      return { mirror: true, quarterTurns: 1 };
    });

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
  const alicePlaceVisitCounts = policyCodec.decode(
    encodedSample.policyOutput,
    0
  ).placeProbabilities;
  for (const x of Range(-playAreaRadius, playAreaRadius + 1)) {
    for (const y of Range(-playAreaRadius, playAreaRadius + 1)) {
      for (const directionIndex of Range(0, 4)) {
        const policyValue =
          alicePlaceVisitCounts[
            placementPolicyLinearization.getOffset(
              x + playAreaRadius,
              y + playAreaRadius,
              directionIndex
            )
          ];
        if (x == 2 && y == -1 && directionIndex == 3) {
          assert.equal(policyValue, 1);
        } else {
          assert.equal(policyValue, 0);
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
