import {
  GameConfiguration,
  GameState,
  Action,
  Game,
  EpisodeConfiguration,
  EpisodeSnapshot,
  proportionalRandom,
  requireDefined,
} from "game";
import { Range, Seq } from "immutable";
import {
  mcts,
  InferenceResult,
  gumbelSequentialHalving,
  EpisodeTrainingData,
  StateSearchData,
} from "agent";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

/**
 * Generator function for self-play episodes. Yields snapshots, receives inference
 * results, and returns episode training data.
 *
 * Actions are sampled proportionally with respect to MCTS visit counts.
 */
export async function* selfPlayEpisode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  mctsContext: mcts.MctsContext<C, S, A>,
  episodeConfig: EpisodeConfiguration
): AsyncGenerator<
  EpisodeSnapshot<C, S>,
  EpisodeTrainingData<C, S, A>,
  InferenceResult<A>
> {
  const startMs = performance.now();
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  const inferenceResult = yield snapshot;
  let root = new mcts.NonTerminalStateNode(
    mctsContext,
    snapshot,
    inferenceResult,
    /* addExplorationNoise = */ true
  );
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  while (game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(game.currentPlayer(snapshot));
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      // TODO this visit might not be necessary now that we don't necessarily
      // visit all children in the other branch
      yield* root.visit();
      selectedAction = root.actionToChild.keys().next().value;
    } else {
      for (let _i of Range(0, mctsContext.config.simulationCount)) {
        yield* root.visit();
      }
      const actionToVisitCount = Seq.Keyed(root.actionToChild).map(
        (node) => node.visitCount
      );
      selectedAction = proportionalRandom(actionToVisitCount);
    }
    nonTerminalStates.push(root.stateSearchData());
    const [newState, chanceKey] = game.apply(
      snapshot,
      requireDefined(selectedAction)
    );
    snapshot = snapshot.derive(newState);
    if (game.result(snapshot) != undefined) {
      break;
    }

    // Reuse the node for newState from the previous search tree if it exists.
    // It might not exist if there was non-determinism in the application of the
    // latest action.
    const existingStateNode = root.actionToChild
      .get(requireDefined(selectedAction))
      ?.chanceKeyToChild.get(chanceKey);
    if (existingStateNode != undefined) {
      if (!(existingStateNode instanceof mcts.NonTerminalStateNode)) {
        throw new Error(
          `Node for non-terminal state was not NonTerminalStateNode`
        );
      }
      root = existingStateNode;
    } else {
      root = new mcts.NonTerminalStateNode(
        mctsContext,
        snapshot,
        yield snapshot
      );
    }
  }
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    nonTerminalStates,
    snapshot.state,
    requireDefined(game.result(snapshot))
  );
}

/**
 * Generator function for self-play episodes. Yields snapshots, receives inference
 * results, and returns episode training data.
 *
 * Actions are selected by sequential halving.
 */
export async function* gumbelSelfPlayEpisode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  mctsContext: mcts.MctsContext<C, S, A>,
  episodeConfig: EpisodeConfiguration,
  simulationCount: number,
  initialActionCount: number
): AsyncGenerator<
  EpisodeSnapshot<C, S>,
  EpisodeTrainingData<C, S, A>,
  InferenceResult<A>
> {
  const startMs = performance.now();
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  const inferenceResult = yield snapshot;
  let root = new mcts.NonTerminalStateNode(
    mctsContext,
    snapshot,
    inferenceResult,
    /* addExplorationNoise = */ false
  );
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  while (game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(game.currentPlayer(snapshot));
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      // TODO this visit might not be necessary now that we don't necessarily
      // visit all children in the other branch
      yield* root.visit();
      selectedAction = root.actionToChild.keys().next().value;
    } else {
      const selectedChild = yield* gumbelSequentialHalving<C, S, A>(
        root,
        simulationCount,
        initialActionCount
      );
      selectedAction = selectedChild.action;
    }
    nonTerminalStates.push(root.stateSearchData());
    const [newState] = game.apply(snapshot, requireDefined(selectedAction));
    snapshot = snapshot.derive(newState);
    if (game.result(snapshot) != undefined) {
      break;
    }

    // Don't reuse nodes during Gumbel self-play
    root = new mcts.NonTerminalStateNode(mctsContext, snapshot, yield snapshot);
  }
  const elapsedMs = performance.now() - startMs;
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    nonTerminalStates,
    snapshot.state,
    requireDefined(game.result(snapshot))
  );
}
