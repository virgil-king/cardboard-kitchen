import { Vector2 } from "./vector2.js";
import { assert, test } from "vitest";

test("Vector#multiply: returns vector with multiplied components", () => {
  assert.isTrue(new Vector2(1, 2).multiply(3).equals(new Vector2(3, 6)));
});

test("Vector2: codec round trip", () => {
  const vec = new Vector2(-3, 111);

  const message = vec.encode();

  assert.isTrue(vec.equals(Vector2.decode(message)));
});
