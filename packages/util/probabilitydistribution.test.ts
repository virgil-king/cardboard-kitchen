import { assert, test } from "vitest";
import { Map as ImmutableMap } from "immutable";
import _ from "lodash";
import { ProbabilityDistribution } from "./probabilitydistribution.js";
import { requireDefined } from "./util.js";

test("create: size is preserved", () => {
  const pd = ProbabilityDistribution.create(
    ImmutableMap([
      ["a", 2],
      ["b", 1],
    ])
  );

  assert.equal(pd.itemToProbability.count(), 2);
});

test("create: max is preserved", () => {
  const pd = ProbabilityDistribution.create(
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
  const pd = ProbabilityDistribution.create(
    ImmutableMap([
      ["a", 2],
      ["b", 0],
    ])
  );

  assert.isTrue(requireDefined(pd.itemToProbability.get("b")) > 0);
});
