import { test } from "vitest";
import { assert } from "chai";
import tf from "@tensorflow/tfjs-node-gpu";
import { BroadcastLayer } from "./broadcastlayer.js";
import _ from "lodash";

test("apply: returns broadcast result", () => {
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
