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
  driveAsyncGenerator,
  requireDefined,
} from "game";
import { test } from "vitest";
import { assert } from "chai";
import { Map as ImmutableMap, Seq } from "immutable";
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

test("one visit: child with greatest prior is selected", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 1,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  assert.equal(
    result.filter((values) => !values.playerIdToValue.isEmpty()).count(),
    1
  );
  assert.isFalse(result.get(new NumberAction(9))?.playerIdToValue.isEmpty());
});

test("one visit: values come from model", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 1,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  const move9Values = requireDefined(result.get(new NumberAction(9)));
  assert.isFalse(move9Values.playerIdToValue.isEmpty());
  for (const [, value] of move9Values.playerIdToValue.entries()) {
    assert.equal(value, PickANumberImmediateModel.STATE_VALUE);
  }
});

test("one visit per first action: not all children visited", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = await mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  assert.notEqual(
    result.filter((values) => !values.playerIdToValue.isEmpty()).count(),
    9
  );
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
  snapshot: EpisodeSnapshot<C, S>
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
    // console.log(`New simulation`);
    await driveAsyncGenerator(root.visit(), async (snapshot) => {
      const batchResult = await model.infer([snapshot]);
      return batchResult[0];
    });
  }
  const result = ImmutableMap(
    Seq(root.actionToChild.entries()).map(([action, node]) => [
      action,
      new PlayerValues(node.playerExpectedValues.playerIdToValue),
    ])
  );
  return result;
}
