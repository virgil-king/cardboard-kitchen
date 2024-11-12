import { test } from "vitest";
import { assert } from "chai";
import * as tf from "@tensorflow/tfjs";
import { getBroadcastLayerFactory } from "./broadcastlayer.js";
import _ from "lodash";

const factory = getBroadcastLayerFactory(tf);

test("apply: tiles as needed", () => {
  // Dims: 2,1,1,3
  const tensor = tf.tensor([[[[1, 2, 3]]], [[[4, 5, 6]]]]);
  const layer = factory.create({ shape: [2, 4, 4, 3] });

  const tiled = layer.apply(tensor) as tf.Tensor;

  assert.isTrue(
    _.isEqual(tiled.arraySync(), [
      [
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
      ],
      [
        [
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
        ],
        [
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
        ],
        [
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
        ],
        [
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
        ],
      ],
    ])
  );
});

test("apply: null dimension: retains input dimension size", () => {
  // Dims: 2,1,1,3
  const tensor = tf.tensor([[[[1, 2, 3]]], [[[4, 5, 6]]]]);
  const layer = factory.create({ shape: [null, 1, 4, 3] });

  const tiled = layer.apply(tensor) as tf.Tensor;

  assert.isTrue(
    _.isEqual(tiled.arraySync(), [
      [
        [
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
          [1, 2, 3],
        ],
      ],
      [
        [
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
          [4, 5, 6],
        ],
      ],
    ])
  );
});
