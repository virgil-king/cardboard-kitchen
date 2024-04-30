import { assert, test } from "vitest";
import { combineHashes } from "./util.js";

// test("shuffle result has same length", () => {
//   assert(
//     shuffle([1, 5, 9]).length == 3,
//     "shuffled length should be unchanged"
//   );
// });

test("combineHashes: two inputs: result does not equal either input", () => {
  const result = combineHashes([3, 9]);

  assert.notEqual(result, 3);
  assert.notEqual(result, 9);
});
