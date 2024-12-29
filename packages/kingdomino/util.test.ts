import { Direction, Rectangle } from "./util.js";
import { assert, test } from "vitest";

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

test("Direction#transform: mirror", () => {
  assert.equal(Direction.LEFT.transform({ mirror: true }), Direction.RIGHT);
});

test("Direction#transform: rotate", () => {
  assert.equal(Direction.UP.transform({ quarterTurns: 2 }), Direction.DOWN);
});

test("Rectangle#height: returns expected value", () => {
  assert(new Rectangle(1, 5, 3, 2).height == 3);
});

test("Rectangle#width: returns expected value", () => {
  assert(new Rectangle(2, 9, 3, 7).width == 1);
});

test("Rectangle#equals: equal: returns true", () => {
  const a = new Rectangle(1, 2, 3, 0);

  assert(a.equals(new Rectangle(1, 2, 3, 0)));
});

test("Rectangle#equals: not equal: returns false", () => {
  const a = new Rectangle(1, 2, 3, 0);

  assert(!a.equals(new Rectangle(1, 2, 4, 0)));
});

test("Rectangle#center: returns expected value", () => {
  const a = new Rectangle(2, 5, 5, 3);

  const center = a.center();

  assert.equal(center.x, 3.5);
  assert.equal(center.y, 4);
});
