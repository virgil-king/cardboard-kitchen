import { assert, test } from "vitest";
import {
  combineHashes,
  driveGenerators,
  requireDefined,
  weightedMerge,
} from "./util.js";
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

test("driveGenerators: answers questions and returns final results", () => {
  function* generate(numbers: number[]) {
    const result = new Array<number>();
    for (const n of numbers) {
      result.push(yield n);
    }
    return result;
  }
  const generators = [
    generate([3, 9, 2]),
    generate([1, 0]),
    generate([5, 23, 89, 2]),
  ];

  const result = driveGenerators(generators, (questions: readonly number[]) =>
    questions.map((n) => n + 1)
  );

  // Results are returned in the same order as the corresponding generators
  // even if the generators completed in a different order
  const expected = [
    [4, 10, 3],
    [2, 1],
    [6, 24, 90, 3],
  ];
  assert.isTrue(
    _.isEqual(result, expected),
    `${JSON.stringify(result)} did not equal ${JSON.stringify(expected)}`
  );
});
