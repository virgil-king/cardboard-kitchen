import { test } from "vitest";
import { assert } from "chai";
import { EpisodeBuffer, ReadonlyArrayLike } from "./episodebuffer.js";
import * as _ from "lodash";
import {
  NumberAction,
  PickANumber,
  PickANumberConfiguration,
  PickANumberState,
} from "./mcts.test.js";
import { EpisodeConfiguration, Player, Players } from "./game.js";
import { EpisodeTrainingData, StateSearchData } from "./train.js";
import { List, Range, Set } from "immutable";
import { StateTrainingData } from "./model.js";
import { rand } from "@tensorflow/tfjs-core";

// const buffer = new EpisodeBuffer<
//   PickANumberConfiguration,
//   PickANumberState,
//   NumberAction
// >(5);

// const alice = new Player("alice", "Alice");
// const bob = new Player("bob", "Bob");
// const episodeConfig = new EpisodeConfiguration(new Players(alice, bob));

// function episode(moves: ReadonlyArray<number>): EpisodeTrainingData<
//   PickANumberConfiguration,
//   PickANumberState,
//   NumberAction
// > {
//     let snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);
//     // const dataPoints = moves.map((move) => new StateSearchData());
//     // const episode = new EpisodeTrainingData(episodeConfig, new PickANumberConfiguration(Set(Range(1, 10))));
// }

class SimpleArrayLike<T> implements ReadonlyArrayLike<T> {
  constructor(private readonly array: ReadonlyArray<T>) { }
  count(): number {
    return this.array.length;
  }
  get(index: number): T {
    return this.array[index];
  }
}

test("addGame: can purge older game while remaining above target: purges older game", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(5);
  const game1 = new SimpleArrayLike([1, 4, 9, 3]);
  const game2 = new SimpleArrayLike([4, 9, 3, 2]);
  const game3 = new SimpleArrayLike([7, 8, 1, 5]);

  buffer.addEpisode(game1);
  buffer.addEpisode(game2);
  buffer.addEpisode(game3);

  assert.equal(buffer.sampleCount(), 8);
  const randomEpisode = buffer.randomGame();
  assert.isTrue(_.isEqual(game2, randomEpisode) || _.isEqual(game3, randomEpisode));
});

test("sampleCount: returns number of states in single game", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(100);

  buffer.addEpisode(new SimpleArrayLike([2, 5]));

  assert.equal(buffer.sampleCount(), 2);
});

test("randomGame: returns single game", () => {
  const buffer = new EpisodeBuffer<number, SimpleArrayLike<number>>(100);
  const game = new SimpleArrayLike([8, 1]);

  buffer.addEpisode(game);

  assert.isTrue(_.isEqual(game, buffer.randomGame()));
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
