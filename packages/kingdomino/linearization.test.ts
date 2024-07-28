import { test } from "vitest";
import { assert } from "chai";
import { Linearization } from "./linearization.js";

test("constructor: too few dimensions: throws", () => {
  assert.throws(() => {
    new Linearization([3]);
  });
});

test("constructor: dimension value too small: throws", () => {
  assert.throws(() => {
    new Linearization([3, 1]);
  });
});

test("set: too many dimensions: throws", () => {
  const linearization = new Linearization([3, 4]);

  assert.throws(() => {
    linearization.set(new Float32Array(12), 1, 2, 2, 2);
  });
});

test("set: too few dimensions: throws", () => {
  const linearization = new Linearization([3, 4, 7]);

  assert.throws(() => {
    linearization.set(new Float32Array(12), 1, 2, 2);
  });
});

test("set: two dimensions: expected index is populated", () => {
  const linearization = new Linearization([3, 4]);
  const array = new Float32Array(12);

  const value = 0.5;
  linearization.set(array, value, 2, 2);

  assertClose(value, array[10]);
});

test("set: three dimensions: expected index is populated", () => {
  const linearization = new Linearization([3, 4, 5]);
  const array = new Float32Array(60);

  const value = 0.9;
  linearization.set(array, value, 2, 2, 3);

  assertClose(array[53], value);
});

test("set: four dimensions: expected index is populated", () => {
  const linearization = new Linearization([3, 4, 5, 2]);
  const array = new Float32Array(120);

  const value = 0.9;
  linearization.set(array, value, 2, 2, 3, 1);

  assertClose(array[107], value);
});

test("set: five dimensions: expected index is populated", () => {
  const linearization = new Linearization([2, 2, 2, 2, 2]);
  const array = new Float32Array(32);

  const value = 0.9;
  linearization.set(array, value, 1, 1, 1, 1, 0);

  assertClose(array[30], value);
});

test("get: two dimensions: round trip", () => {
  const linearization = new Linearization([7, 2]);
  const array = new Float32Array(14);

  linearization.set(array, 0.3, 5, 0);

  assertClose(linearization.get(array, 5, 0), 0.3);
});

test("get: three dimensions: round trip", () => {
  const linearization = new Linearization([2, 5, 3]);
  const array = new Float32Array(30);

  const value = 0.9;
  linearization.set(array, value, 1, 2, 1);

  assertClose(linearization.get(array, 1, 2, 1), value);
});

test("get: four dimensions: round trip", () => {
  const linearization = new Linearization([3, 6, 5, 2]);
  const array = new Float32Array(180);

  const value = 0.9;
  linearization.set(array, value, 2, 1, 3, 1);

  assertClose(linearization.get(array, 2, 1, 3, 1), value);
});

test("get: five dimensions: round trip", () => {
  const linearization = new Linearization([2, 2, 2, 2, 2]);
  const array = new Float32Array(64);

  const value = 0.9;
  linearization.set(array, value, 1, 0, 1, 1, 0);

  assertClose(linearization.get(array, 1, 0, 1, 1, 0), value);
});

function assertClose(actual: number, expected: number) {
  assert.isTrue(Math.abs(actual - expected) < 0.01);
}
