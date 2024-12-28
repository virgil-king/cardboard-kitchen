import {
  Player,
  Players,
  EpisodeConfiguration,
  EpisodeSnapshot,
  driveAsyncGenerator,
  requireDefined,
} from "game";
import { test } from "vitest";
import { assert } from "chai";
import {
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts.js";
import {
  NumberAction,
  PickANumber,
  PickANumberConfiguration,
  PickANumberEpisodeSnapshot,
  PickANumberImmediateModel,
  PickANumberState,
} from "./testgame.js";
import {
  estimateStateValue,
  gumbelSequentialHalving,
  selectTopKChildren,
  selectChildAtIntermediateNode,
  selectInitialChildren,
  topK,
  improvedPolicyLogits,
} from "./gumbel.js";
import gumbel from "@stdlib/random-base-gumbel";
import _ from "lodash";
import { Map as ImmutableMap, Set } from "immutable";

const gumbelFactory = gumbel.factory(0, 1);

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const episodeConfig = new EpisodeConfiguration(new Players(alice, bob));
const config = new MctsConfig<
  PickANumberConfiguration,
  PickANumberState,
  NumberAction
>({ modelValueWeight: 1 });
const context = {
  config: config,
  game: PickANumber.INSTANCE,
  model: PickANumberImmediateModel.INSTANCE,
  stats: new MctsStats(),
} satisfies MctsContext<
  PickANumberConfiguration,
  PickANumberState,
  NumberAction
>;
const snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);
const inferenceResult = (
  await PickANumberImmediateModel.INSTANCE.infer([snapshot])
)[0];

test("gumbelSequentialHalving: visits expected pattern of nodes", async () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);

  await driveAsyncGenerator(
    gumbelSequentialHalving(root, 32, 4),
    async (snapshot: PickANumberEpisodeSnapshot) =>
      (
        await PickANumberImmediateModel.INSTANCE.infer([snapshot])
      )[0]
  );

  const visitCountToNodeCount = new Map<number, number>();
  for (const [, child] of root.actionToChild) {
    const existingCount = visitCountToNodeCount.get(child.visitCount) ?? 0;
    visitCountToNodeCount.set(child.visitCount, existingCount + 1);
  }
  console.log(JSON.stringify([...visitCountToNodeCount.entries()]));
  assert.equal(visitCountToNodeCount.get(4), 2);
  assert.equal(visitCountToNodeCount.get(12), 2);
});

test("gumbelSequentialHalving: 3 children total: visits expected pattern of nodes", async () => {
  const availableNumbers = Set([1, 2, 3]);
  const snapshot = new EpisodeSnapshot(
    episodeConfig,
    new PickANumberConfiguration(availableNumbers),
    new PickANumberState(ImmutableMap(), availableNumbers)
  );
  const inferenceResult = (
    await PickANumberImmediateModel.INSTANCE.infer([snapshot])
  )[0];
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);

  await driveAsyncGenerator(
    gumbelSequentialHalving(root, 32, 4),
    async (snapshot: PickANumberEpisodeSnapshot) =>
      (
        await PickANumberImmediateModel.INSTANCE.infer([snapshot])
      )[0]
  );

  const visitCountToNodeCount = new Map<number, number>();
  for (const [, child] of root.actionToChild) {
    const existingCount = visitCountToNodeCount.get(child.visitCount) ?? 0;
    visitCountToNodeCount.set(child.visitCount, existingCount + 1);
  }
  assert.equal(visitCountToNodeCount.get(10), 3);
});

test("gumbelSequentialHalving: 5 children total: visits expected pattern of nodes", async () => {
  const availableNumbers = Set([1, 2, 3, 4, 5]);
  const snapshot = new EpisodeSnapshot(
    episodeConfig,
    new PickANumberConfiguration(availableNumbers),
    new PickANumberState(ImmutableMap(), availableNumbers)
  );
  const inferenceResult = (
    await PickANumberImmediateModel.INSTANCE.infer([snapshot])
  )[0];
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);

  await driveAsyncGenerator(
    gumbelSequentialHalving(root, 32, 8),
    async (snapshot: PickANumberEpisodeSnapshot) =>
      (
        await PickANumberImmediateModel.INSTANCE.infer([snapshot])
      )[0]
  );

  const visitCountToNodeCount = new Map<number, number>();
  for (const [, child] of root.actionToChild) {
    const existingCount = visitCountToNodeCount.get(child.visitCount) ?? 0;
    visitCountToNodeCount.set(child.visitCount, existingCount + 1);
  }
  assert.equal(visitCountToNodeCount.get(2), 3);
  assert.equal(visitCountToNodeCount.get(13), 2);
});

test("selectInitialChildren: returns requested number of children", async () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const actionToGumbel = root.actionToChild.map(() => gumbelFactory());
  const initialChildren = selectInitialChildren(root, 2, actionToGumbel);

  assert.equal(initialChildren.length, 2);
});

test("selectInitialChildren: more children requested than exist: returns all children", async () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const actionToGumbel = root.actionToChild.map(() => gumbelFactory());
  const initialChildren = selectInitialChildren(root, 20, actionToGumbel);

  assert.equal(initialChildren.length, 9);
});

test("selectTopKChildren: returns requested number of children", async () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const actionToGumbel = root.actionToChild.map(() => gumbelFactory());
  const children = root.actionToChild.valueSeq().toArray().slice(0, 8);
  const bestChildren = selectTopKChildren(root, children, 4, actionToGumbel);

  assert.equal(bestChildren.length, 4);
});

test("topK: returns expected results", () => {
  const result = topK([1, 9, 3, 5], 2, (it: number) => it);

  assert.isTrue(_.isEqual(result, [9, 5]));
});

test("topK: less than k items: returns all items", () => {
  const result = topK([1, 9, 3, 5], 7, (it: number) => it);

  assert.isTrue(_.isEqual(result, [9, 5, 3, 1]));
});

test("selectChildAtIntermediateNode: first visit: selects child with greatest prior", () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const result = selectChildAtIntermediateNode(root);

  assert.isTrue(result.action.equals(new NumberAction(9)));
});

test("improvedPolicyLogits: returns a logit for each action", () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const result = improvedPolicyLogits(
    root,
    requireDefined(PickANumber.INSTANCE.currentPlayer(snapshot))
  );

  assert.equal(result.count(), 9);
  for (const child of root.actionToChild.valueSeq()) {
    const logit = result.get(child.action);
    assert.isDefined(logit);
    assert.isNotNaN(logit);
  }
});

test("estimateStateValue: no child visits: returns model value", () => {
  const root = new NonTerminalStateNode<
    PickANumberConfiguration,
    PickANumberState,
    NumberAction
  >(context, snapshot, inferenceResult);
  const currentPlayer = requireDefined(
    PickANumber.INSTANCE.currentPlayer(snapshot)
  );
  const result = estimateStateValue(root, currentPlayer);

  assert.equal(
    result,
    inferenceResult.value.playerIdToValue.get(currentPlayer.id)
  );
});
