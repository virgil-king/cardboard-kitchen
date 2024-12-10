import { Map as ImmutableMap } from "immutable";
import * as util from "./util.js";

export class ProbabilityDistribution<T> {
  private constructor(readonly itemToProbability: ImmutableMap<T, number>) {}

  static create<T>(
    logits: ImmutableMap<T, number>
  ): ProbabilityDistribution<T> {
    if (logits.isEmpty()) {
      throw new Error(`Probability distribution created with no values`);
    }
    if (logits.find((it) => it < 0) != undefined) {
      throw new Error(`Probability distribution created with negative value`);
    }
    const exponentiated = logits.map((logit) => Math.exp(logit));
    const sum = util.sum(exponentiated.valueSeq());
    const itemToProbability = exponentiated.map((value) => value / sum);
    return new ProbabilityDistribution(itemToProbability);
  }

  get(key: T): number | undefined {
    return this.itemToProbability.get(key);
  }
}
