import { test } from "vitest";
import { assert } from "chai";
import { EpisodeBuffer } from "./episodebuffer.js";
import * as _ from "lodash";
import { LazyArray } from "agent";

test("addGame: can purge older game while remaining above target: purges older game", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(5);
  const game1 = new SimpleArrayLike([1, 4, 9, 3]);
  const game2 = new SimpleArrayLike([4, 9, 3, 2]);
  const game3 = new SimpleArrayLike([7, 8, 1, 5]);

  buffer.addEpisode(game1);
  buffer.addEpisode(game2);
  buffer.addEpisode(game3);

  assert.equal(buffer.sampleCount(), 8);
});

test("sampleCount: returns number of states in single game", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(100);

  buffer.addEpisode(new SimpleArrayLike([2, 5]));

  assert.equal(buffer.sampleCount(), 2);
});

test("sample: returns requested number of submitted states", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(100);
  const game = [9, 7, 9, 3, 5, 1];
  buffer.addEpisode(new SimpleArrayLike(game));

  const batch = buffer.sample(3);

  assert.equal(batch.length, 3);
  for (let item of batch) {
    assert.isTrue(game.indexOf(item) != -1);
  }
});

class SimpleArrayLike<T> implements LazyArray<T> {
  constructor(private readonly array: ReadonlyArray<T>) {}
  count(): number {
    return this.array.length;
  }
  get(index: number): T {
    return this.array[index];
  }
}
