
import { Player, PlayerState, Players, unroll } from "./game.js";

import { test } from "vitest";
import { assert } from "chai";
import { List } from "immutable";

test("Player.equals: equal: returns true", () => {
    const p1 = new Player("p1", "P1");
    const p2 = new Player("p1", "P1");

    assert.isTrue(p1.equals(p2));
});

test("Player.equals: not equal: returns false", () => {
    const p1 = new Player("p1", "P1");
    const p2 = new Player("p2", "P2");

    assert.isFalse(p1.equals(p2));
});

test("Players.equals: equal: returns true", () => {
    const p1 = new Player("p1", "P1");
    const p2 = new Player("p1", "P1");
    const players1 = new Players(p1);
    const players2 = new Players(p2);

    assert.isTrue(players1.equals(players2));
});

test("Players.equals: not equal: returns false", () => {
    const p1 = new Player("p1", "P1");
    const p2 = new Player("p2", "P2");
    const players1 = new Players(p1);
    const players2 = new Players(p2);

    assert.isFalse(players1.equals(players2));
});

test("PlayerState.equals: equal: returns true", () => {
    const a = new PlayerState(2);
    const b = new PlayerState(2);

    assert.isTrue(a.equals(b));
});

test("PlayerState.equals: not equal: returns false", () => {
    const a = new PlayerState(5);
    const b = new PlayerState(12);

    assert.isFalse(a.equals(b));
});
