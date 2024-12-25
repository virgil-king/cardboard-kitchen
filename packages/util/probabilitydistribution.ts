import { Map as ImmutableMap } from "immutable";
import * as util from "./util.js";

export class ProbabilityDistribution<T> {
  private constructor(readonly itemToProbability: ImmutableMap<T, number>) {}

  /**
   * Returns a probability distribution by exponentiating and normalizing
   * {@link logits}
   */
  static fromLogits<T>(
    logits: ImmutableMap<T, number>
  ): ProbabilityDistribution<T> {
    return this.normalize(logits.map((logit) => Math.exp(logit)));
  }

  /**
   * Returns a probability distribution by normalizing {@link values}
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
}
