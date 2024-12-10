import { assert, test } from "vitest";
import { Map as ImmutableMap } from "immutable";
import _ from "lodash";
import { ProbabilityDistribution } from "./probabilitydistribution.js";

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
