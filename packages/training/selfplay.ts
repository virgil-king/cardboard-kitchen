import {
  GameConfiguration,
  GameState,
  Action,
  Game,
  EpisodeConfiguration,
  EpisodeSnapshot,
  PlayerValues,
} from "game";
import { Map, Range, Seq } from "immutable";
import { mcts, InferenceResult } from "mcts";
import { requireDefined, proportionalRandom } from "studio-util";
import {
  EpisodeTrainingData,
  StateSearchData,
  ActionStatistics,
} from "training-data";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

/**
 * Generator function for self-play episodes. Yields snapshots, receives inference
 * results, and returns episode training data.
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
    inferenceResult
  );
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  while (game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(game.currentPlayer(snapshot));
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      yield* root.visit();
      selectedAction = root.actionToChild.keys().next().value;
    } else {
      for (let _i of Range(
        0,
        Math.max(mctsContext.config.simulationCount, root.actionToChild.size)
      )) {
        yield* root.visit();
      }
      // TODO incorporate noise
      const actionToVisitCount = Seq.Keyed(root.actionToChild).map(
        (node) => node.visitCount
      );
      selectedAction = proportionalRandom(actionToVisitCount);
    }
    const stateSearchData = new StateSearchData(
      snapshot.state,
      root.inferenceResult.value,
      Map(
        Seq(root.actionToChild.entries()).map(([action, child]) => [
          action,
          new ActionStatistics(
            child.prior,
            child.visitCount,
            new PlayerValues(child.playerExpectedValues.playerIdToValue)
          ),
        ])
      )
    );
    nonTerminalStates.push(stateSearchData);
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
  const elapsedMs = performance.now() - startMs;
  console.log(
    `Completed episode; elapsed time ${decimalFormat.format(elapsedMs)} ms`
  );
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    nonTerminalStates,
    snapshot.state,
    requireDefined(game.result(snapshot))
  );
}
