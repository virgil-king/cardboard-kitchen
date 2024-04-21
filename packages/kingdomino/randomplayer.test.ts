import { streamingRandom } from "./randomplayer.js";

import { expect, test } from "vitest";
import { assert } from "chai";

test("streamingRandom: returns some item", () => {
  const candidates = [0, 1, 2];
  const items = function* () {
    for (const item of candidates) {
      yield item;
    }
  };

  const result = streamingRandom(items());

  assert(candidates.indexOf(result) != -1);
});
