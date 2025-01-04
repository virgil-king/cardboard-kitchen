import { Map as ImmutableMap } from "immutable";
import * as util from "./util.js";

export class ProbabilityDistribution<T> {
  private constructor(readonly itemToProbability: ImmutableMap<T, number>) {}

  /**
   * Returns a probability distribution by exponentiating and normalizing
   * {@link logits}
   */
  static fromLogits<T>(
    logits: ImmutableMap<T, number>,
    temperature: number = 1
  ): ProbabilityDistribution<T> {
    return this.normalize(logits.map((logit) => Math.exp(logit / temperature)));
  }

  /**
   * Returns a probability distribution by normalizing {@link values} so they sum to 1
   */
  static normalize<T>(
    values: ImmutableMap<T, number>
  ): ProbabilityDistribution<T> {
    if (values.isEmpty()) {
      throw new Error(`Probability distribution created with no values`);
    }
    if (values.find((it) => it < 0) != undefined) {
      throw new Error(`Probability distribution created with negative value`);
    }
    const sum = util.sum(values.valueSeq());
    if (sum <= 0) {
      throw new Error(
        `Non-normalized probability sum was non-positive: ${JSON.stringify([
          ...values.values(),
        ])}`
      );
    }
    return new ProbabilityDistribution(values.map((value) => value / sum));
  }

  get(key: T): number | undefined {
    return this.itemToProbability.get(key);
  }

  /**
   * Returns a map from key to logit based on the probabilities of this distribution,
   * assuming that the combined expected value of this distribution is
   * {@link combinedExpectedValue} and that this distribution was created with
   * temperature {@link temperature}.
   * 
   * In practice this function doesn't seem to provide good action value estimates
   * based on predicted state values and action probabilities. 
   */
  recoverLogits(
    combinedExpectedValue: number,
    temperature: number = 1
  ): ImmutableMap<T, number> {
    // Recover (shifted) logits by reversing softmax
    const logits = this.itemToProbability.map(
      (it) => Math.log(it) * temperature
    );
    // Compute the difference between the target combined expected value
    // and the combined expected value when using the raw logits
    const offset =
      combinedExpectedValue -
      util.sum(
        this.itemToProbability
          .toSeq()
          .map((p, key) => p * util.requireDefined(logits.get(key)))
      );
    // Add `offset` to every logit which will result in a total of `offset`
    // being added to the combined expected value since the sum of 
    return logits.map((logit) => logit + offset);
  }
}
