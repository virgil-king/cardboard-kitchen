import { Direction, Rectangle, Vector2 } from "./util.js";

import { assert, test } from "vitest";

test("Vector#multiply: returns vector with multiplied components", () => {
  assert.isTrue(new Vector2(1, 2).multiply(3).equals(new Vector2(3, 6)));
});

test("Vector2: codec round trip", () => {
  const vec = new Vector2(-3, 111);

  const encoded = vec.toJson();

  assert.isTrue(vec.equals(Vector2.fromJson(encoded)));
});

test("Direction#values: returns all directions", () => {
  const valuesList = [...Direction.values()];
  assert.equal(valuesList.length, 4);
  assert(
    valuesList.find((val) => {
      return val == Direction.LEFT;
    }) != undefined
  );
  assert(
    valuesList.find((val) => {
      return val == Direction.UP;
    }) != undefined
  );
  assert(
    valuesList.find((val) => {
      return val == Direction.RIGHT;
    }) != undefined
  );
  assert(
    valuesList.find((val) => {
      return val == Direction.DOWN;
    }) != undefined
  );
});

test("Direction#opposite: returns opposite direction", () => {
  assert.equal(Direction.LEFT.opposite(), Direction.RIGHT);
});

test("Rectangle#height: returns expected value", () => {
  assert(new Rectangle(1, 5, 3, 2).height == 3);
});

test("Rectangle#width: returns expected value", () => {
  assert(new Rectangle(2, 9, 3, 7).width == 1);
});

// test("Rectangle#extend: updates left and top", () => {
//   const extended = new Rectangle(2, 3, 3, 2).extend(new Vector2(1, 5));

//   assert(extended.left == 1);
//   assert(extended.top == 5);
// });

// test("Rectangle#extend: updates right and bottom", () => {
//   const extended = new Rectangle(2, 3, 3, 2).extend(new Vector2(4, 1));

//   assert(extended.right == 4);
//   assert(extended.bottom == 1);
// });

test("Rectangle#equals: equal: returns true", () => {
  const a = new Rectangle(1, 2, 3, 0);

  assert(a.equals(new Rectangle(1, 2, 3, 0)));
});

test("Rectangle#equals: not equal: returns false", () => {
  const a = new Rectangle(1, 2, 3, 0);

  assert(!a.equals(new Rectangle(1, 2, 4, 0)));
});
