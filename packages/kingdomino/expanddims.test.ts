import { test } from "vitest";
import { assert } from "chai";
import tf from "@tensorflow/tfjs-node-gpu";
import { ExpandDimsLayer } from "./expanddims.js";
import _ from "lodash";

test("apply: returns tiled result", () => {

  const test = tf.layers.conv2d({
    kernelSize: 3,
    filters: 4,
    strides: 1,
  });

  console.log(test.computeOutputShape([5,3,3,3]));

  // Dims: 2,3
  const tensor = tf.tensor([
    [1, 2, 3],
    [4, 5, 6],
  ]);
  // Desired result: 2,1,1,3
  const layer = new ExpandDimsLayer({ shape: [1, 1] });

  const expanded = layer.apply(tensor) as tf.Tensor;

  assert.isTrue(_.isEqual(expanded.arraySync(), [[[[1, 2, 3]]], [[[4, 5, 6]]]]));
});
