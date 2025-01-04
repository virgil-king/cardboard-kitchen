import { assert, test } from "vitest";
import { Map as ImmutableMap } from "immutable";
import _ from "lodash";
import { ProbabilityDistribution } from "./probabilitydistribution.js";
import { requireDefined, sum } from "./util.js";

test("create: size is preserved", () => {
  const pd = ProbabilityDistribution.fromLogits(
    ImmutableMap([
      ["a", 2],
      ["b", 1],
    ])
  );

  assert.equal(pd.itemToProbability.count(), 2);
});

test("create: max is preserved", () => {
  const pd = ProbabilityDistribution.fromLogits(
    ImmutableMap([
      ["a", 2],
      ["b", 1],
    ])
  );

  assert.equal(
    pd.itemToProbability.entrySeq().max((a, b) => a[1] - b[1])?.[0],
    "a"
  );
});

test("create: zero logit gets non-zero probability", () => {
  const pd = ProbabilityDistribution.fromLogits(
    ImmutableMap([
      ["a", 2],
      ["b", 0],
    ])
  );

  assert.isTrue(requireDefined(pd.itemToProbability.get("b")) > 0);
});

test("recoverLogits", () => {
  const logits = ImmutableMap([
    [1, 0.25],
    [2, 0.5],
    [3, 0.75],
  ]);
  const temp = 0.5;
  const pd = ProbabilityDistribution.fromLogits(logits, temp);
  const pdEv = sum(
    pd.itemToProbability
      .toSeq()
      .map((p, key) => p * requireDefined(logits.get(key)))
  );
  console.log(`pdEv=${pdEv}`);
  console.log(`pd=${JSON.stringify(pd.itemToProbability.toJS())}`);
  const recoveredLogits = pd.recoverLogits(pdEv, temp);
  console.log(`recoveredLogits=${JSON.stringify(recoveredLogits.toJS())}`);
});
