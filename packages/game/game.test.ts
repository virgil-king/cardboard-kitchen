import {
  Player,
  Players,
  tiersToPlayerValues,
  scoresToPlayerValues,
} from "./game.js";

import { test } from "vitest";
import { assert } from "chai";
import { Map } from "immutable";

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

test("tiersToPlayerValues: half point for all tied players", () => {
  const result = tiersToPlayerValues([["alice", "bob", "cecile"]]);

  assert.equal(result.playerIdToValue.get("alice"), 0.5);
  assert.equal(result.playerIdToValue.get("bob"), 0.5);
  assert.equal(result.playerIdToValue.get("cecile"), 0.5);
});

test("tiersToPlayerValues: one point for each player in lower tiers", () => {
  const result = tiersToPlayerValues([["alice"], ["bob"], ["cecile", "derek"]]);

  assert.equal(result.playerIdToValue.get("alice"), 1);
  assert.equal(result.playerIdToValue.get("bob"), 2/3);
  assert.equal(result.playerIdToValue.get("cecile"), 1/6);
  assert.equal(result.playerIdToValue.get("derek"), 1/6);
});

test("scoresToPlayerValues: tied players in same tier", () => {
  const result = scoresToPlayerValues(
    Map([
      ["alice", 5],
      ["bob", 5],
    ])
  );

  assert.equal(result.playerIdToValue.get("alice"), 0.5);
  assert.equal(result.playerIdToValue.get("bob"), 0.5);
});

test("scoresToPlayerValues: non-tied players in different tiers", () => {
  const result = scoresToPlayerValues(
    Map([
      ["alice", 5],
      ["bob", 11],
    ])
  );

  assert.equal(result.playerIdToValue.get("alice"), 0);
  assert.equal(result.playerIdToValue.get("bob"), 1);
});
