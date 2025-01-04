import { test } from "vitest";
import { assert } from "chai";
import * as tf from "@tensorflow/tfjs";
import _ from "lodash";
import {
  selectiveKlDivergenceWithLogits,
  selectiveKlDivergenceWithLogits2,
  selectiveSoftmax,
} from "./loss.js";

test("selectiveKlDivergenceWithLogits: excluded values don't affect result", () => {
  const targetArray = [1, 2];
  const targetLogits = tf.tensor([targetArray]);
  const predictedArray = [2, 2];
  const predictedLogits = tf.tensor([predictedArray]);
  const targetWithMaskArray = [1, 2, -1];
  const targetWithMaskLogits = tf.tensor([targetWithMaskArray]);
  const predictedWithMaskArray = [2, 2, 1];
  const predictedWithMaskLogits = tf.tensor([predictedWithMaskArray]);

  const loss = selectiveKlDivergenceWithLogits(targetLogits, predictedLogits);
  const lossWithMask = selectiveKlDivergenceWithLogits(
    targetWithMaskLogits,
    predictedWithMaskLogits
  );

  assert.deepEqual(loss.dataSync(), lossWithMask.dataSync());
});

test("selectiveKlDivergenceWithLogits: loss scales with logit differences", () => {
  const targetLogitsA = tf.tensor([[1, 2]]);
  const predictedLogitsA = tf.tensor([[1, 1]]);
  const targetLogitsB = tf.tensor([[1, 3]]);
  const predictedLogitsB = tf.tensor([[1, 1]]);

  const lossA = selectiveKlDivergenceWithLogits(
    targetLogitsA,
    predictedLogitsA
  ).dataSync();
  const lossB = selectiveKlDivergenceWithLogits(
    targetLogitsB,
    predictedLogitsB
  ).dataSync();

  assert.isTrue(lossB[0] > lossA[0]);
});

test("selectiveKlDivergenceWithLogits: batch shape handled correctly", () => {
  // Mask out the different values in each batch item
  const targetLogits = tf.tensor([
    [1, 2, -1],
    [3, 4, -1],
  ]);
  const predictedLogits = tf.tensor([
    [1, 2, 3],
    [3, 4, 6],
  ]);

  const loss = selectiveKlDivergenceWithLogits(
    targetLogits,
    predictedLogits
  ).dataSync();

  assert.equal(loss[0], 0);
});

test("selectiveKlDivergenceWithLogits2: excluded values don't affect result", () => {
  const targetArray = [1, 2];
  const targetLogits = tf.tensor([targetArray]);
  const predictedArray = [2, 2];
  const predictedLogits = tf.tensor([predictedArray]);
  const targetWithMaskArray = [1, 2, -1];
  const targetWithMaskLogits = tf.tensor([targetWithMaskArray]);
  const predictedWithMaskArray = [2, 2, 1];
  const predictedWithMaskLogits = tf.tensor([predictedWithMaskArray]);

  const loss = selectiveKlDivergenceWithLogits2(targetLogits, predictedLogits);
  const lossWithMask = selectiveKlDivergenceWithLogits2(
    targetWithMaskLogits,
    predictedWithMaskLogits
  );

  assert.deepEqual(loss.dataSync(), lossWithMask.dataSync());
});

test("selectiveKlDivergenceWithLogits2: loss scales with logit differences", () => {
  const targetLogitsA = tf.tensor([[1, 2]]);
  const predictedLogitsA = tf.tensor([[1, 1]]);
  const targetLogitsB = tf.tensor([[1, 3]]);
  const predictedLogitsB = tf.tensor([[1, 1]]);

  const lossA = selectiveKlDivergenceWithLogits2(
    targetLogitsA,
    predictedLogitsA
  ).dataSync();
  const lossB = selectiveKlDivergenceWithLogits2(
    targetLogitsB,
    predictedLogitsB
  ).dataSync();

  assert.isTrue(lossB[0] > lossA[0]);
});

test("selectiveKlDivergenceWithLogits2: batch shape handled correctly", () => {
  // Mask out the different values in each batch item
  const targetLogits = tf.tensor([
    [1, 2, -1],
    [3, 4, -1],
  ]);
  const predictedLogits = tf.tensor([
    [1, 2, 3],
    [3, 4, 6],
  ]);

  const loss = selectiveKlDivergenceWithLogits2(
    targetLogits,
    predictedLogits
  ).dataSync();

  assert.equal(loss[0], 0);
});

test("selectiveSoftmax: uses zero for masked elements", () => {
  const logits = tf.tensor([[1, 1, 2]]);
  const condition = tf.tensor([[true, true, false]]);
  const zeros = tf.tensor([[0, 0, 0]]);

  const result = selectiveSoftmax(condition, logits, zeros);

  assert.deepEqual(result.dataSync(), new Float32Array([0.5, 0.5, 0]));
});
