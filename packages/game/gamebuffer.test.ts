import { test } from "vitest";
import { assert } from "chai";
import { GameBuffer } from "./gamebuffer.js";
import * as _ from "lodash";

test("addGame: exceeds max moves: purges older games", () => {
    const buffer = new GameBuffer<number>(5);
    const game1 = [1, 5, 9, 4];
    const game2 = [4, 9, 3, 2];

    buffer.addGame(game1);
    buffer.addGame(game2);

    assert.equal(buffer.sampleCount(), 4);
    assert.isTrue(_.isEqual(game2, buffer.randomGame()));
});

test("sampleCount: returns number of states in single game", () => {
  const buffer = new GameBuffer<number>(100);

  buffer.addGame([2, 5]);

  assert.equal(buffer.sampleCount(), 2);
});

test("randomGame: returns single game", () => {
  const buffer = new GameBuffer<number>(100);
  const game = [8, 1];

  buffer.addGame(game);

  assert.isTrue(_.isEqual(game, buffer.randomGame()));
});

test("sample: returns requested number of submitted states", () => {
    const buffer = new GameBuffer<number>(100);
    const game = [9, 7, 9, 3, 5, 1];
    buffer.addGame(game);

    const batch = buffer.sample(3);

    assert.equal(batch.length, 3);
    for (let item of batch) {
        assert.isTrue(game.indexOf(item) != -1);
    }
});
