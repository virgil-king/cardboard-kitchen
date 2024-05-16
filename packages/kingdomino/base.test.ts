
import { test } from "vitest";
import { assert } from "chai";
import { LocationState } from "./base.js";

test("LocationState.equals: equal: returns true", () => {
    const a = new LocationState(5, 1);
    const b = new LocationState(5, 1);

    assert.isTrue(a.equals(b));
});

test("LocationState.equals: not equal: returns false", () => {
    const a = new LocationState(5, 1);
    const b = new LocationState(7, 1);

    assert.isFalse(a.equals(b));
});
