import { test } from "vitest";
import { assert } from "chai";
import {
  ObjectCodec,
  OneHotCodec,
  ScalarCodec,
} from "./codec.js";

test("ScalarCodec: round trip", () => {
  const codec = new ScalarCodec();
  const array = new Float32Array(2);

  codec.encode(3, array, 1);
  const result = codec.decode(array, 1);

  assertClose(result, 3);
});

test("OneHotCodec: round trip", () => {
  const codec = new OneHotCodec(3);
  const array = new Float32Array(codec.columnCount + 4);

  codec.encode(2, array, 4);
  const result = codec.decode(array, 4);

  assertClose(result, 2);
});

const testObjectCodec = new ObjectCodec({
  a: new ScalarCodec(),
  b: new ScalarCodec(),
});

test("ObjectCodec: round trip", () => {
  const offset = 13;
  const array = new Float32Array(testObjectCodec.columnCount + offset);
  const object = { a: 5, b: 79 };

  testObjectCodec.encode(object, array, offset);
  const result = testObjectCodec.decode(array, offset);

  assertClose(result.a, object.a);
  assertClose(result.b, object.b);
});

function assertClose(actual: number, expected: number) {
  assert.isTrue(
    Math.abs(actual - expected) < 0.01,
    `${actual} was not close to ${expected}`
  );
}
