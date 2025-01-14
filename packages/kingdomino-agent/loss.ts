import * as tf from "@tensorflow/tfjs";

const eps = tf.backend().epsilon();
const zero = tf.scalar(0);

/**
 * Returns the KL divergence only for the positions of {@link targetLogits} and
 * {@link predictedLogits} where {@link targetLogits} is non-negative. Negative values
 * in {@link targetLogits} are used as a signal not to generate any gradient for
 * those positions.
 */
export function selectiveKlDivergenceWithLogits(
  targetLogits: tf.Tensor,
  predictedLogits: tf.Tensor
): tf.Tensor {
  return tf.tidy(() => {
    const mask = tf.greaterEqual(targetLogits, zero);
    const targetProbs = selectiveSoftmax(mask, targetLogits).clipByValue(
      eps,
      1 - eps
    );
    const predictedProbs = selectiveSoftmax(mask, predictedLogits).clipByValue(
      eps,
      1 - eps
    );
    const divisions = tf.div(targetProbs, predictedProbs);
    const logs = tf.log(divisions);
    const products = tf.mul(targetProbs, logs);
    const itemLosses = tf.sum(products, /* axis= */ 1);
    const totalLoss = itemLosses.mean();
    return totalLoss;
  });
}

/**
 * Computes softmax in the second dimension of {@link logits} considering only
 * those elements where {@link condition} is true.
 *
 * Returns a tensor whose values are those softmax values where {@link condition}
 * is true and otherwise zero.
 */
// Exported for testing
export function selectiveSoftmax(
  condition: tf.Tensor,
  logits: tf.Tensor
): tf.Tensor {
  const powers = tf.exp(logits);
  const selectedPowers = tf.where(condition, powers, zero);
  const sum = tf.sum(selectedPowers, /* axis= */ 1, /* keepDims= */ true);
  return tf.div(selectedPowers, sum);
}

/**
 * Returns the KL divergence only for the positions of {@link targetLogits} and
 * {@link predictedLogits} where {@link targetLogits} is non-negative. Negative values
 * in {@link targetLogits} are used as a signal not to generate any gradient for
 * those positions.
 */
export function selectiveKlDivergenceWithLogits2(
  targetLogits: tf.Tensor,
  predictedLogits: tf.Tensor
): tf.Tensor {
  return tf.tidy(() => {
    const mask = tf.greaterEqual(targetLogits, zero);
    const negInf = tf.fill(targetLogits.shape, Number.NEGATIVE_INFINITY);
    const targetProbs = tf
      .softmax(tf.where(mask, targetLogits, negInf))
      .clipByValue(eps, 1 - eps);
    const predictedProbs = tf
      .softmax(tf.where(mask, predictedLogits, negInf))
      .clipByValue(eps, 1 - eps);
    const divisions = tf.div(targetProbs, predictedProbs);
    const logs = tf.log(divisions);
    const products = tf.mul(targetProbs, logs);
    const itemLosses = tf.sum(products, /* axis= */ 1);
    const totalLoss = itemLosses.mean();
    return totalLoss;
  });
}
