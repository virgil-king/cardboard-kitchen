import { assert, test } from "vitest";
import { shuffle } from "./util.js";

test("shuffle result has same length", () => {
  assert(
    shuffle([1, 5, 9]).length == 3,
    "shuffled length should be unchanged"
  );
});
