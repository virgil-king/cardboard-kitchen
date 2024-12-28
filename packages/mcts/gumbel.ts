import gumbel from "@stdlib/random-base-gumbel";
import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  Player,
  ProbabilityDistribution,
  requireDefined,
} from "game";
import { ActionNode, NonTerminalStateNode } from "./mcts.js";
import { Map, Range, Seq } from "immutable";
import { StateNodeInfo, StateSearchData } from "training-data";
import { InferenceResult } from "./model.js";

const gumbelFactory = gumbel.factory(0, 1);

const C_VISIT = 50;
const C_SCALE = 1;

// Choosing n & m:
// n=32, m=4:
// step 1: N=32/(log_2(4)*4)=4 steps=16 steps total
// step 2: N=32/(log_2(4)*4/2)=8 steps=16 steps total
// n=16, m=4:
// step 1: N=16/(log_2(4)*4)=2 steps=8 steps total
// step 2: N=16/(log_2(4)*4/2)=4 steps=8 steps total
// n=32, m=8:
// step 1: N=32/(log_2(8)*8)=1 steps=8 steps total
// step 2: N=32/(log_2(8)*8/2)=2 steps=8 steps total
// step 2: N=32/(log_2(8)*8/4)=5 steps=10 steps total
// n=64, m=4:
// step 1: N=64/(log_2(4)*4)=8 steps=32 steps total
// step 2: N=64/(log_2(4)*4/2)=16 steps=32 steps total

/**
 * Returns {@link StateSearchData} describing the results of
 * performing Gumbel sequential halving for {@link simulationCount}
 * simulations and {@link actionCount} initial actions.
 */
export async function* gumbelSequentialHalving<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  node: NonTerminalStateNode<C, S, A>,
  simulationCount: number,
  actionCount: number
): AsyncGenerator<
  EpisodeSnapshot<C, S>,
  ActionNode<C, S, A>,
  InferenceResult<A>
> {
  let result: ActionNode<C, S, A>;
  if (node.actionToChild.count() == 1) {
    result = requireDefined(node.actionToChild.first());
    // TODO is even one visit necessary here?
    yield* node.visitChild(result);
  } else {
    const actionToGumbel = node.actionToChild.map(() => gumbelFactory());
    let remainingChildren = selectInitialChildren(
      node,
      actionCount,
      actionToGumbel
    );
    const initialSelectedChildrenCount = remainingChildren.length;
    const simulationCountPerRound = Math.floor(
      simulationCount / Math.log2(initialSelectedChildrenCount)
    );
    let remainingSimulationCount = simulationCount;
    while (remainingChildren.length > 1) {
      const remainingChildCount = remainingChildren.length;
      const isLastRound = remainingChildCount < 4;
      const thisRoundMaxSimulationCount = isLastRound
        ? remainingSimulationCount
        : simulationCountPerRound;
      const simulationCountPerChild = Math.floor(
        thisRoundMaxSimulationCount / remainingChildCount
      );
      for (const child of remainingChildren) {
        for (const _simulationIndex of Range(0, simulationCountPerChild)) {
          yield* child.visit(node.snapshot);
        }
      }
      remainingChildren = selectTopKChildren(
        node,
        remainingChildren,
        Math.floor(remainingChildCount / 2),
        actionToGumbel
      );
      remainingSimulationCount -= simulationCountPerChild * remainingChildCount;
    }
    result = selectTopKChildren(node, remainingChildren, 1, actionToGumbel)[0];
  }
  return result;
}

/**
 * Returns {@link childCount} children of {@link parent}, or all children
 * if less than {@link childCount} exist, to consider for sequential
 * halving.
 */
// Exported for testing
export function selectInitialChildren<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  parent: NonTerminalStateNode<C, S, A>,
  childCount: number,
  actionToGumbel: Map<A, number>
): ReadonlyArray<ActionNode<C, S, A>> {
  const actionToLogits = parent.inferenceResult.policyLogits;
  return topK(
    parent.actionToChild.valueSeq(),
    childCount,
    (child: ActionNode<C, S, A>) => {
      const gumbel = requireDefined(actionToGumbel.get(child.action));
      return gumbel + requireDefined(actionToLogits.get(child.action));
    }
  );
}

// Exported for testing
export function selectTopKChildren<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  parent: NonTerminalStateNode<C, S, A>,
  children: ReadonlyArray<ActionNode<C, S, A>>,
  k: number,
  actionToGumbel: Map<A, number>
): ReadonlyArray<ActionNode<C, S, A>> {
  const actionToLogits = parent.inferenceResult.policyLogits;
  const maxVisitCount = requireDefined(
    Seq(children)
      .map((it) => it.visitCount)
      .max()
  );
  return topK(children, k, (child: ActionNode<C, S, A>) => {
    const gumbel = requireDefined(actionToGumbel.get(child.action));
    return (
      gumbel +
      requireDefined(actionToLogits.get(child.action)) +
      sigma(child.visitCount, maxVisitCount, C_VISIT, C_SCALE)
    );
  });
}

/**
 * Returns the subarray of items from {@link items} having the highest
 * score according to {@link score} and sorted by descending score
 */
// Exported for testing
export function topK<T>(
  items: Iterable<T>,
  k: number,
  score: (item: T) => number
): ReadonlyArray<T> {
  // This could be one in O(n) instead of O(n log n) but it shouldn't
  // matter in practice
  const itemToScore = Seq(items)
    .map<[T, number]>((item) => {
      return [item, score(item)];
    })
    .toArray();
  itemToScore.sort(([, score1], [, score2]) => score2 - score1);
  return itemToScore
    .slice(0, Math.min(k, itemToScore.length))
    .map(([child]) => child);
}

export function selectChildAtIntermediateNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(node: NonTerminalStateNode<C, S, A>): ActionNode<C, S, A> {
  const improvedPolicy = ProbabilityDistribution.fromLogits(
    improvedPolicyLogits(
      node,
      requireDefined(node.context.game.currentPlayer(node.snapshot))
    )
  );
  const child = requireDefined(
    node.actionToChild.valueSeq().max((child1, child2) => {
      return (
        intermediateNodeChildScore(node, child1, improvedPolicy) -
        intermediateNodeChildScore(node, child2, improvedPolicy)
      );
    })
  );
  return child;
}

function intermediateNodeChildScore<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  parent: NonTerminalStateNode<C, S, A>,
  node: ActionNode<C, S, A>,
  policy: ProbabilityDistribution<A>
): number {
  return (
    requireDefined(policy.get(node.action)) -
    node.visitCount / (1 + parent.visitCount)
  );
}

export function improvedPolicyLogits<A extends Action>(
  stateNodeInfo: StateNodeInfo<A>,
  currentPlayer: Player
): Map<A, number> {
  const maxActionVisitCount = requireDefined(
    stateNodeInfo.actionToNodeInfo
      .valueSeq()
      .map((it) => it.visitCount)
      .max()
  );
  const fallbackActionValue = sigma(
    estimateStateValue(stateNodeInfo, currentPlayer),
    maxActionVisitCount,
    C_VISIT,
    C_SCALE
  );
  let result = Map<A, number>();
  for (const [action, actionNodeInfo] of stateNodeInfo.actionToNodeInfo) {
    const completedQ =
      actionNodeInfo.visitCount > 0
        ? sigma(
            actionNodeInfo.expectedValues.requirePlayerValue(currentPlayer),
            maxActionVisitCount,
            C_VISIT,
            C_SCALE
          )
        : fallbackActionValue;

    result = result.set(action, actionNodeInfo.priorLogit + completedQ);
  }
  return result;
}

/**
 * Returns an estimate of the value of {@link stateNodeInfo} for
 * {@link currentPlayer} based on the value network's prediction
 * for the node and the priors and expected values of the visited
 * child nodes
 */
// Exported for testing
export function estimateStateValue<A extends Action>(
  stateNodeInfo: StateNodeInfo<A>,
  currentPlayer: Player
): number {
  let visitedChildrenPriorSum = 0;
  let visitedChildrenExpectationSum = 0;
  for (const actionNodeInfo of stateNodeInfo.actionToNodeInfo.valueSeq()) {
    if (actionNodeInfo.visitCount > 0) {
      // Exploration noise should not be used in conjunction with this
      // Gumbel code since exploration noise is incorporated into node
      // priors and improved policies should not be affected by noise
      visitedChildrenPriorSum += actionNodeInfo.priorProbability;
      visitedChildrenExpectationSum +=
        actionNodeInfo.priorProbability *
        requireDefined(
          actionNodeInfo.expectedValues.playerIdToValue.get(currentPlayer.id)
        );
    }
  }

  const nodePredictedValue = requireDefined(
    stateNodeInfo.predictedValues.playerIdToValue.get(currentPlayer.id)
  );

  if (visitedChildrenPriorSum == 0) {
    // The only data we have in this case is the model value so use
    // that directly rather than running into divide-by-zero below
    return nodePredictedValue;
  }

  return (
    (1 / (1 + stateNodeInfo.visitCount)) *
    (nodePredictedValue +
      (stateNodeInfo.visitCount * visitedChildrenExpectationSum) /
        visitedChildrenPriorSum)
  );
}

/**
 * Returns a monotonic transformation of {@link value}
 */
function sigma(
  nodeValue: number,
  maxVisitCount: number,
  cVisit: number,
  cScale: number
): number {
  return (cVisit + maxVisitCount) * cScale * nodeValue;
}
