
import { Rectangle, Vector2 } from "./util.js";

import { assert, expect, test } from "vitest";

test("Rectangle#height: returns expected value", () => {
  assert(new Rectangle(1, 5, 3, 2).height == 3);
});


test("Rectangle#width: returns expected value", () => {
  assert(new Rectangle(2, 9, 3, 7).width == 1);
});

test("Rectangle#extend: updates left and top", () => {
  const extended = new Rectangle(2, 3, 3, 2).extend(new Vector2(1, 5));
  assert(extended.left == 1);
  assert(extended.top == 5);
});

test("Rectangle#extend: updates right and bottom", () => {
  const extended = new Rectangle(2, 3, 3, 2).extend(new Vector2(4, 1));
  assert(extended.right == 4);
  assert(extended.bottom == 1);
});
