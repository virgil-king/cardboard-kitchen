import { assert, test } from "vitest";
import { Map as ImmutableMap } from "immutable";
import _ from "lodash";
import { ProbabilityDistribution } from "./probabilitydistribution.js";
import { requireDefined } from "./util.js";

test("withMinimumValue: flattens distribution", () => {
  const before = ProbabilityDistribution.create(
    ImmutableMap([
      ["a", 0],
      ["b", 0.5],
      ["c", 0.5],
    ])
  );

  const after = before.withMinimumValue(0.3);
  assertClose(requireDefined(after.get("a")), 0.1);
  assertClose(requireDefined(after.get("b")), 0.45);
  assertClose(requireDefined(after.get("c")), 0.45);
});

function assertClose(actual: number, expected: number) {
  assert.isTrue(
    Math.abs(actual - expected) < 0.01,
    `${actual} was not close to ${expected}`
  );
}
