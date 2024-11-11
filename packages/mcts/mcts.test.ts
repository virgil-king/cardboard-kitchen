import {
  Player,
  Players,
  EpisodeConfiguration,
} from "game";
import { test } from "vitest";
import { assert } from "chai";
import { List } from "immutable";
import { requireDefined } from "studio-util";
import { MctsConfig, mcts } from "./mcts.js";
import { NumberAction, PickANumber, PickANumberModel } from "./testgame.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
// const cecile = new Player("cecile", "Cecile");
// const derek = new Player("derek", "Derek");

test("mcts: single-step deterministic game: one step per first action: expected values come from model", () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  assert.equal(result.count(), 9);
  console.log([...result.entries()]);
  for (const actionResult of result.values()) {
    console.log([...actionResult.playerIdToValue.entries()]);
    for (const player of players.players) {
      assert.equal(
        actionResult.playerIdToValue.get(player.id),
        PickANumberModel.STATE_VALUE
      );
    }
  }
});

test("mcts: single-step deterministic game: one more step than first actions: last step selects action with greatest prior", () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 10,
    modelValueWeight: 1,
  });
  const result = mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  const actionWithGreatestExpectedValue = requireDefined(
    List(result.entries()).max(
      ([, values1], [, values2]) =>
        requireDefined(values1.playerIdToValue.get(alice.id)) -
        requireDefined(values2.playerIdToValue.get(alice.id))
    )
  )[0];
  assert.isTrue(actionWithGreatestExpectedValue.equals(new NumberAction(9)));
});

test("mcts: single-step deterministic game: many simulations: best move has highest expected value", () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 100,
    modelValueWeight: 1,
  });
  const result = mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  const actionWithGreatestExpectedValue = requireDefined(
    List(result.entries()).max(
      ([, values1], [, values2]) =>
        requireDefined(values1.playerIdToValue.get(alice.id)) -
        requireDefined(values2.playerIdToValue.get(alice.id))
    )
  )[0];
  assert.isTrue(actionWithGreatestExpectedValue.equals(new NumberAction(9)));
});
