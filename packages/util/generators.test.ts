import { assert, test } from "vitest";
import { driveGenerators } from "./generators.js";
import _ from "lodash";

test("driveGenerators: answers questions and returns final results", async () => {
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

  const result = await driveGenerators(
    generators,
    (questions: readonly number[]) =>
      Promise.resolve(questions.map((n) => n + 1))
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
