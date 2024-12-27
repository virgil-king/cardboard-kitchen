import { assert, test } from "vitest";
import { combineHashes, requireDefined, weightedMerge } from "./util.js";
import { Map } from "immutable";
import _ from "lodash";

test("combineHashes: two inputs: result does not equal either input", () => {
  const result = combineHashes(3, 9);

  assert.notEqual(result, 3);
  assert.notEqual(result, 9);
});

test("weightedMerge: values in both inputs are merged", () => {
  const a = Map([["a", 3]]);
  const b = Map([["a", 6]]);

  const result = weightedMerge(a, 1, b, 2);

  assert.equal(requireDefined(result.get("a")), 5);
});

test("weightedMerge: key only in a: uses a value", () => {
  const a = Map([["a", 3]]);
  const b = Map([["b", 783]]);

  const result = weightedMerge(a, 1, b, 2);

  assert.equal(requireDefined(result.get("a")), 3);
});

test("weightedMerge: key only in b: uses b value", () => {
  const a = Map([["a", 3]]);
  const b = Map([["b", 783]]);

  const result = weightedMerge(a, 1, b, 2);

  assert.equal(requireDefined(result.get("b")), 783);
});
