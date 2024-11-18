import { Map as ImmutableMap } from "immutable";
import * as util from "./util.js";
import { requireDefined } from "./util.js";

export class ProbabilityDistribution<T> {
  private constructor(readonly itemToProbability: ImmutableMap<T, number>) {}

  static create<T>(
    rawValues: ImmutableMap<T, number>
  ): ProbabilityDistribution<T> {
    if (rawValues.isEmpty()) {
      throw new Error(`Probability distribution created with no values`);
    }
    if (rawValues.find((it) => it < 0) != undefined) {
      throw new Error(`Probability distribution created with negative value`);
    }
    const sum = util.sum(rawValues.valueSeq());
    const itemToProbability = rawValues.map((value) => value / sum);
    return new ProbabilityDistribution(itemToProbability);
  }

  get(key: T): number | undefined {
    return this.itemToProbability.get(key);
  }

  /**
   * Returns a probability distribution whose minimum value is at least
   * `min / count` by flattening the original distribution if needed.
   *
   * In other words {@link min} fraction of the resulting distribution
   * will be uniform and `1 - min` of the distribution will have the same
   * relative probabilities as the original distribution.
   *
   * @param min a number between 0 and 1
   */
  withMinimumValue(min: number): ProbabilityDistribution<T> {
    const appliedMin = min / this.itemToProbability.count();
    const actualMin = requireDefined(this.itemToProbability.min());
    if (actualMin > appliedMin) {
      return this;
    }
    const minComplement = 1 - min;
    const newItemToProbability = this.itemToProbability.map(
      (value) => appliedMin + value * minComplement
    );
    return new ProbabilityDistribution(newItemToProbability);
  }
}
