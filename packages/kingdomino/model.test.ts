import { test } from "vitest";
import { Kingdomino } from "./kingdomino.js";
import { EpisodeConfiguration, Player, PlayerValues, Players } from "game";
import {
  BoardResidualBlock,
  EncodedState,
  KingdominoConvolutionalModel,
  placementToCodecIndex,
  policyCodec,
} from "./model-cnn.js";
import { assert } from "chai";
import { Map, Seq } from "immutable";
import { KingdominoAction } from "./action.js";
import {
  boardIndices,
  PlaceTile,
  playAreaRadius,
  playAreaSize,
} from "./base.js";
import { Vector2, Direction } from "./util.js";
import { ActionStatistics } from "training-data";
import tf from "@tensorflow/tfjs-node-gpu";
import * as _ from "lodash";
import { PlayerBoard } from "./board.js";
import { Tile } from "./tile.js";
import { requireDefined } from "studio-util";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const episodeConfig = new EpisodeConfiguration(players);
const model = KingdominoConvolutionalModel.fresh();

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

test("decodeValues: returns expected values", () => {
  const vector = [0.1, 0.2, 0.3, 0.4];

  const playerValues = model.inferenceModel.decodeValues(
    players,
    new Float32Array(vector)
  );

  assertClose(requireDefined(playerValues.playerIdToValue.get(alice.id)), 0.1);
  assertClose(requireDefined(playerValues.playerIdToValue.get(bob.id)), 0.2);
});

test("encodePolicy: stores placement values at expected index", () => {
  const placement1 = new PlaceTile(new Vector2(-4, -3), Direction.LEFT);
  const placement2 = new PlaceTile(new Vector2(1, 2), Direction.DOWN);
  const actionToVisitCount = Map([
    [
      KingdominoAction.placeTile(placement1),
      new ActionStatistics(
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
  /*  */
  const policyVector = model.trainingModel().encodePolicy(actionToVisitCount);
  const placeProbabilitiesVector = policyCodec.decode(
    policyVector,
    0
  ).placeProbabilities;

  assertClose(
    placeProbabilitiesVector[placementToCodecIndex(placement1)],
    1 / 3
  );
  assertClose(
    placeProbabilitiesVector[placementToCodecIndex(placement2)],
    2 / 3
  );
});

test("JSON round trip: inference behavior is preserved", async () => {
  const artifacts = await model.toJson();
  const model2 = await KingdominoConvolutionalModel.fromJson(artifacts);
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
  const model2 = await KingdominoConvolutionalModel.fromJson(artifacts);
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

function assertClose(actual: number, expected: number) {
  assert.isTrue(
    Math.abs(actual - expected) < 0.01,
    `${actual} was not close to ${expected}`
  );
}

// test("tensor encoding", async () => {
//   // const array = [1, 2, 3, 4, 5, 6];
//   // const tensor = tf.tensor(array, [3, 2, 1]);
//   // console.log(tensor.toString());

//   // const array = _.range(0, 9 * 9 * 9);
//   // const matrix = new Array<Array<Array<number>>>();
//   // for (const x of boardIndices) {
//   //   const xIndex = x + playAreaRadius;
//   //   const row = new Array<Array<number>>();
//   //   matrix[xIndex] = row;
//   //   const xOffset = xIndex * 9 * 9;
//   //   for (const y of boardIndices) {
//   //     const yIndex = y + playAreaRadius;
//   //     const yOffset = yIndex * 9;
//   //     const start = xOffset + yOffset;
//   //     row[yIndex] = array.slice(start, start + 9);
//   //   }
//   // }
//   // console.log(`matrix: ${matrix}`);

//   let board = new PlayerBoard(Map()).withTile(
//     new PlaceTile(new Vector2(1, -1), Direction.DOWN),
//     1
//   );
//   const tile = Tile.withNumber(1);

//   const floatArray = KingdominoConvolutionalModel.encodeBoard(board);
//   // console.log(`float array: ${floatArray}`);
//   const tensor = tf.tensor(floatArray, [9, 9, 9]);
//   // console.log(`tensor: ${tensor}`);
//   const roundTripMatrix = await tensor.arraySync();
//   // console.log(`roundTripMatrix: ${roundTripMatrix}`);
//   // assert.isTrue(_.isEqual(matrix, roundTripMatrix));

//   const yWidth = BoardResidualBlock.filterCount;
//   const xWidth = playAreaSize * yWidth;
//   assert.equal(
//     roundTripMatrix[
//       (1 + playAreaRadius) * xWidth + (-1 + playAreaRadius) * yWidth
//     ]
//   );
// });
