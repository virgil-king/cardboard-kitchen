import {
  Player,
  Players,
  EpisodeConfiguration,
  GameConfiguration,
  Action,
  EpisodeSnapshot,
  Game,
  GameState,
  PlayerValues,
} from "game";
import { test } from "vitest";
import { assert } from "chai";
import { List, Map as ImmutableMap, Seq } from "immutable";
import { driveAsyncGenerator, requireDefined } from "studio-util";
import {
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts.js";
import {
  NumberAction,
  PickANumber,
  PickANumberImmediateModel,
} from "./testgame.js";
import { InferenceModel } from "./model.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");

test("one step per first action: select unvisited children first: expected values come from model", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    true
  );

  assert.equal(result.count(), 9);
  for (const actionResult of result.values()) {
    for (const player of players.players) {
      assert.equal(
        actionResult.playerIdToValue.get(player.id),
        PickANumberImmediateModel.STATE_VALUE
      );
    }
  }
});

test("one step per first action: don't select unvisited children first; not all children visited", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    false
  );

  assert.notEqual(
    result.filter((values) => !values.playerIdToValue.isEmpty()).count(),
    9
  );
});

test("mcts: single-step deterministic game: one step per first action: expected values come from model", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    true
  );

  assert.equal(result.count(), 9);
  for (const actionResult of result.values()) {
    for (const player of players.players) {
      assert.equal(
        actionResult.playerIdToValue.get(player.id),
        PickANumberImmediateModel.STATE_VALUE
      );
    }
  }
});

test("mcts: single-step deterministic game: one more step than first actions: last step selects action with greatest prior", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 10,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    true
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

test("mcts: single-step deterministic game: many simulations: best move has highest expected value", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 100,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    true
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

/**
 * Returns a map from possible actions from {@link snapshot} to their predicted
 * values for all players.
 *
 * @param config MCTS configuration
 * @param game game with which to simulate episodes
 * @param model model to use to guide MCTS
 * @param snapshot game state from which to search
 * @returns map from valid actions to their expected values
 */
async function mcts<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  config: MctsConfig<C, S, A>,
  game: Game<C, S, A>,
  model: InferenceModel<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>,
  selectUnvisitedActionsFirst: boolean = false
): Promise<ImmutableMap<A, PlayerValues>> {
  const context: MctsContext<C, S, A> = {
    config: config,
    game: game,
    model: model,
    stats: new MctsStats(),
  };
  const inferenceResult = (await model.infer([snapshot]))[0];
  const root = new NonTerminalStateNode(context, snapshot, inferenceResult);
  for (let step = 0; step < config.simulationCount; step++) {
    console.log(`New simulation`);
    await driveAsyncGenerator(
      root.visit(selectUnvisitedActionsFirst),
      async (snapshot) => {
        const batchResult = await model.infer([snapshot]);
        return batchResult[0];
      }
    );
  }
  const result = ImmutableMap(
    Seq(root.actionToChild.entries()).map(([action, node]) => [
      action,
      new PlayerValues(node.playerExpectedValues.playerIdToValue),
    ])
  );
  return result;
}
