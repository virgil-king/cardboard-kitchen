import { test } from "vitest";
import { assert } from "chai";
import * as tf from "@tensorflow/tfjs";
import { ExpandDimsLayer } from "./expanddims.js";
import _ from "lodash";

test("apply: returns tiled result", () => {
  // Dims: 2,3
  const tensor = tf.tensor([
    [1, 2, 3],
    [4, 5, 6],
  ]);
  // Desired result: 2,1,1,3
  const layer = new ExpandDimsLayer({ shape: [1, 1] });

  const expanded = layer.apply(tensor) as tf.Tensor;

  assert.isTrue(
    _.isEqual(expanded.arraySync(), [[[[1, 2, 3]]], [[[4, 5, 6]]]])
  );
});
