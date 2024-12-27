import { test } from "vitest";
import { assert } from "chai";
import * as tf from "@tensorflow/tfjs";
import _ from "lodash";
import { BroadcastLayer } from "./broadcastlayer.js";

test("apply: tiles as needed", () => {
  // Dims: 2,1,1,3
  const tensor = tf.tensor([[[[1, 2, 3]]], [[[4, 5, 6]]]]);
  const layer = new BroadcastLayer({ shape: [2, 4, 4, 3] });

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
  const layer = new BroadcastLayer({ shape: [null, 1, 4, 3] });

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
