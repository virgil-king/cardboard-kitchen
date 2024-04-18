
import { Rectangle } from "./util.js";

import { assert, expect, test } from "vitest";

test("Rectangle.height: returns expected value", () => {
  assert(new Rectangle(1, 5,3, 2).height == 3);
});
