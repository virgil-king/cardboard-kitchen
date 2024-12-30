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
  throwFirstRejection,
} from "game";
import { test } from "vitest";
import { assert } from "chai";
import { Map as ImmutableMap, Seq } from "immutable";
import {
  ActionNode,
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts2.js";
import {
  NumberAction,
  PickANumber,
  PickANumberConfiguration,
  PickANumberImmediateModel,
  PickANumberState,
} from "../testgame.js";
import { InferenceModel } from "../model.js";
import { BatchingModel } from "../batchingmodel.js";
import { MctsAgent2, MctsResult } from "./agent2.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const players = new Players(alice, bob);
const episodeConfig = new EpisodeConfiguration(players);

test("ActionNode.visit: before result fulfilled: visit counts are correct", () => {
  const node = new ActionNode(createContext(), new NumberAction(1), 0.1, 0.1);

  node.visit(PickANumber.INSTANCE.newEpisode(episodeConfig), 0);

  assert.equal(node.visitCount, 0);
  assert.equal(node.incompleteVisitCount, 1);
  assert.equal(node.combinedVisitCount, 1);
});

test("ActionNode.visit: after result fulfilled: visit counts are correct", async () => {
  const node = new ActionNode(createContext(), new NumberAction(1), 0.1, 0.1);

  await node.visit(PickANumber.INSTANCE.newEpisode(episodeConfig), 0);

  assert.equal(node.visitCount, 1);
  assert.equal(node.incompleteVisitCount, 0);
  assert.equal(node.combinedVisitCount, 1);
});

test("ActionNode.visit: multiple calls before results fulfilled: visit counts are correct", () => {
  const node = new ActionNode(
    createContext(new BatchingModel(PickANumberImmediateModel.INSTANCE)),
    new NumberAction(1),
    0.1,
    0.1
  );
  const snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);

  node.visit(snapshot, 0);
  node.visit(snapshot, 0);

  assert.equal(node.visitCount, 0);
  assert.equal(node.incompleteVisitCount, 2);
  assert.equal(node.combinedVisitCount, 2);
});

test("ActionNode.visit: results fulfilled after multiple calls: visit counts are correct", async () => {
  const model = new BatchingModel(PickANumberImmediateModel.INSTANCE);
  const node = new ActionNode(createContext(model), new NumberAction(1), 0.1, 0.1);
  const snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);

  const visit1 = node.visit(snapshot, 0);
  const visit2 = node.visit(snapshot, 0);

  model.fulfillRequests();

  await Promise.allSettled([visit1, visit2]);

  assert.equal(node.visitCount, 2);
  assert.equal(node.incompleteVisitCount, 0);
  assert.equal(node.combinedVisitCount, 2);
});

test("ActionNode.visit: after result fulfilled: player values updated", async () => {
  const node = new ActionNode(createContext(), new NumberAction(1), 0.1, 0.1);

  await node.visit(PickANumber.INSTANCE.newEpisode(episodeConfig), 0);

  // After the first visit to a new non-terminal state node that node's
  // predicted values come from the model. The test model predicts that
  // all non-terminal states will end up tied so we expect to see those
  // values here as the action node's values.
  assert.equal(node.playerExpectedValues.playerIdToValue.get("alice"), 0.5);
  assert.equal(node.playerExpectedValues.playerIdToValue.get("bob"), 0.5);
});

test("NonTerminalStateNode.visit: results fulfilled after multiple calls: different actions are visited", async () => {
  const model = new BatchingModel(PickANumberImmediateModel.INSTANCE);
  const snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);
  const node = new NonTerminalStateNode(createContext(model), snapshot);

  const visit1 = node.visit();
  const visit2 = node.visit();

  model.fulfillRequests();

  await throwFirstRejection([visit1, visit2]);

  const visitedActionCount = node.actionToChild.count(
    (child) => child.visitCount > 0
  );
  assert.equal(visitedActionCount, 2);
});

test("Batch MTCS: one step per first action: expected values come from model", async () => {
  const players = new Players(alice, bob);
  const mctsConfig = new MctsConfig({
    simulationCount: 9,
    modelValueWeight: 1,
  });
  const result = await batchMcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberImmediateModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players)),
    10
  );

  assert.equal(result.actionToStatistics.count(), 9);
  console.log(`Results are ${[...result.actionToStatistics.entries()]}`);
  for (const actionResult of result.actionToStatistics.values()) {
    for (const player of players.players) {
      assert.equal(
        actionResult.expectedValues.playerIdToValue.get(player.id),
        PickANumberImmediateModel.STATE_VALUE
      );
    }
  }
});

function createContext(
  model: InferenceModel<
    GameConfiguration,
    PickANumberState,
    NumberAction
  > = PickANumberImmediateModel.INSTANCE
): MctsContext<PickANumberConfiguration, PickANumberState, NumberAction> {
  const mctsConfig = new MctsConfig<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >({
    simulationCount: 2,
    modelValueWeight: 1,
  });
  return {
    config: mctsConfig,
    game: PickANumber.INSTANCE,
    model: model,
    stats: new MctsStats(),
  };
}

async function synchronousMcts<
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
  const root = new NonTerminalStateNode(context, snapshot);
  for (let step = 0; step < config.simulationCount; step++) {
    // TODO update tests not to rely on the legacy 'true' behavior
    await root.visit(0, true);
  }
  const result = ImmutableMap(
    Seq(root.actionToChild.entries()).map(([action, node]) => [
      action,
      new PlayerValues(node.playerExpectedValues.playerIdToValue),
    ])
  );
  return result;
}

async function batchMcts<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  config: MctsConfig<C, S, A>,
  game: Game<C, S, A>,
  model: InferenceModel<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>,
  batchSize: number
): Promise<MctsResult<A>> {
  const agent = new MctsAgent2<C, S, A>(
    game,
    model,
    config,
    batchSize,
    new MctsStats()
  );
  return agent.mcts(snapshot);
}
