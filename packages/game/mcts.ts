import {
  Action,
  ChanceKey,
  Episode,
  GameState,
  Model,
  PlayerValues,
  finalScores,
} from "./game.js";
import { Map } from "immutable";
import { requireDefined } from "studio-util";

class MctsConfig {
  readonly simulationCount: number;
  readonly explorationBias: number;
  readonly valueNetworkWeight: number;
  readonly randomPlayoutWeight: number;

  constructor(params: {
    simulationCount: number;
    explorationBias: number;
    valueNetworkWeight: number;
    randomPlayoutWeight: number;
  }) {
    this.simulationCount = params.simulationCount;
    this.explorationBias = params.explorationBias;
    this.valueNetworkWeight = params.valueNetworkWeight;
    this.randomPlayoutWeight = params.randomPlayoutWeight;
  }
}

class MctsStats {
  actionNodesCreated = 0;
  stateNodesCreated = 0;
  terminalStatesReached = 0;
}

/**
 * A node in a UCT search tree uniquely corresponding to a preceding sequence of
 * actions and random outcomes
 */
class ActionNode<StateT extends GameState, ActionT extends Action> {
  visitCount = 0;
  // TODO constrain the size of this map
  chanceKeyToChild = Map<ChanceKey, StateNode<StateT, ActionT>>();
  readonly playerExpectedValues = new PlayerValues();
  constructor(
    readonly config: MctsConfig,
    readonly model: Model<StateT, ActionT>,
    readonly action: ActionT
  ) {}

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  visit(episode: Episode<any, StateT, ActionT>): PlayerValues {
    this.visitCount++;
    const [childState, chanceKey] = episode.apply(this.action);
    let stateNode = this.chanceKeyToChild.get(chanceKey);
    let result: PlayerValues;
    if (stateNode == undefined) {
      // New child
      stateNode = new StateNode(this.config, this.model, childState);
      this.chanceKeyToChild = this.chanceKeyToChild.set(chanceKey, stateNode);
      result = stateNode.predictedValues(episode);
    } else {
      // Existing child: continue the search into a grandchild node
      result = stateNode.visit(episode);
    }
    this.playerExpectedValues.add(result);
    return result;
  }
}

/**
 * A node in a UCT search tree uniquely corresponding to a game state.
 */
class StateNode<StateT extends GameState, ActionT extends Action> {
  visitCount = 0;
  actionToChild: Map<ActionT, ActionNode<StateT, ActionT>>;
  readonly playerValues = new PlayerValues();
  constructor(
    readonly config: MctsConfig,
    readonly model: Model<StateT, ActionT>,
    readonly state: StateT
  ) {
    const policy = model.policy(state);
    this.actionToChild = Map(
      policy.mapEntries(([action, value]) => [
        action,
        new ActionNode(config, model, action),
      ])
    );
  }

  /**
   * Returns values to backpropagate when this node is first reached as a new leaf
   */
  predictedValues(episode: Episode<any, StateT, ActionT>): PlayerValues {
    const episodeResult = finalScores(episode);
    if (episodeResult != undefined) {
      return episodeResult;
    }

    const result = new PlayerValues();
    if (this.config.valueNetworkWeight > 0) {
      result.add(this.model.value(this.state), this.config.valueNetworkWeight);
    }
    if (this.config.randomPlayoutWeight > 0) {
      // TODO random playout
    }
    return result;
  }

  /**
   * Returns player expected values if episode is at a terminal state or
   * otherwise selects an action and visits the resulting action node
   */
  visit(episode: Episode<any, StateT, ActionT>): PlayerValues {
    this.visitCount++;

    const episodeResult = finalScores(episode);
    if (episodeResult != undefined) {
      return episodeResult;
    }

    const action = this.selectAction(this.state);
    const childState = episode.apply(action);
    let childNode = this.actionToChild.get(action);
    if (childNode == undefined) {
      // New child:
      childNode = new ActionNode(this.config, this.model, action);
      this.actionToChild = this.actionToChild.set(action, childNode);
    } else {
      // Existing child: continue the search into a grandchild node
      childNode.visit(episode);
    }
    this.playerValues.add(childNode.playerExpectedValues);
    return this.playerValues;
  }

  selectAction(state: StateT): ActionT {
    let maxUcb = 0;
    let maxUcbAction: ActionT | undefined = undefined;
    for (const [action, child] of this.actionToChild) {
      if (child.visitCount == 0) {
        return action;
      }

      const ucb =
        requireDefined(
          child.playerExpectedValues.playerIdToValue.get(
            requireDefined(state.currentPlayer).id
          )
        ) +
        this.config.explorationBias *
          Math.sqrt((2 * Math.log(this.visitCount)) / child.visitCount);
      if (ucb > maxUcb) {
        maxUcb = ucb;
        maxUcbAction = action;
      }
    }
    if (maxUcbAction == undefined) {
      throw new Error("No action to select");
    }
    return maxUcbAction;
  }
}

/**
 * Returns a map from possible actions from {@link state} to their predicted value
 *
 * @param steps how many search steps to perform
 */
export function mcts<StateT extends GameState, ActionT extends Action>(
  config: MctsConfig,
  model: Model<StateT, ActionT>,
  state: StateT
): Map<ActionT, number> {
  const currentPlayer = requireDefined(state.currentPlayer);
  const root = new StateNode(config, model, state);
  for (let step = 0; step < config.simulationCount; step++) {
    root.
  }
  return root.actionToChild.map((node) =>
    node.playerExpectedValues.get(currentPlayer.id)
  );
}

/**
 * Average values for each player at a single search tree node
 */
// class NodeValues {
//   resultCount = 0;
//   playerIdToAverageValue = Map<string, number>();
//   addGameResult(gameResult: GameResult) {
//     this.resultCount++;
//     this.playerIdToAverageValue = Map(
//       gameResult.playerIdOrder.map((playerId) => {
//         return [
//           playerId,
//           this.updatedPlayerValue(playerId, gameResult.value(playerId)),
//         ];
//       })
//     );
//   }
//   addExpectedValues(other: NodeValues) {
//     this.resultCount++;
//     this.playerIdToAverageValue = Map(
//       other.playerIdToAverageValue.keySeq().map((playerId) => {
//         return [
//           playerId,
//           this.updatedPlayerValue(
//             playerId,
//             other.playerIdToAverageValue.get(playerId, 0)
//           ),
//         ];
//       })
//     );
//   }
//   /**
//    * Returns the new average value for {@link playerId} taking into account {@link value}.
//    *
//    * {@link resultCount} should already take into account {@link value} when this method is called.
//    */
//   updatedPlayerValue(playerId: string, value: number): number {
//     const currentValue = this.playerIdToAverageValue.get(playerId, 0);
//     return currentValue + (value - currentValue) / this.resultCount;
//   }
// }
