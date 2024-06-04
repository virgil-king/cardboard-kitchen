import {
  Action,
  ChanceKey,
  Episode,
  PlayerValues,
  GameState,
  Model,
} from "./game.js";
import { Map as ImmutableMap } from "immutable";
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
 * A node in a UCT search tree uniquely corresponding to an action following a
 * previous state. Action nodes' children correspond to possible chance outcomes
 * following that action.
 */
class ActionNode<StateT extends GameState, ActionT extends Action> {
  visitCount = 0;
  // TODO constrain the size of this map
  readonly chanceKeyToChild = new Map<ChanceKey, StateNode<StateT, ActionT>>();
  /**
   * Weighted average values across the possible states resulting from this
   * node's action due to chance
   */
  readonly playerExpectedValues = new NodeValues();
  constructor(
    readonly config: MctsConfig,
    readonly model: Model<StateT, ActionT>,
    readonly action: ActionT
  ) {}

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  visit(episode: Episode<StateT, ActionT>): PlayerValues {
    this.visitCount++;
    const [childState, chanceKey] = episode.apply(this.action);
    let stateNode = this.chanceKeyToChild.get(chanceKey);
    let result: PlayerValues;
    if (stateNode == undefined) {
      // New child
      stateNode = new StateNode(this.config, this.model, childState);
      this.chanceKeyToChild.set(chanceKey, stateNode);
      result = stateNode.predictedValues(episode);
    } else {
      // Existing child: continue the search into a grandchild node
      result = stateNode.visit(episode);
    }
    this.playerExpectedValues.mergeExpectedValues(result);
    return result;
  }
}

/**
 * A node in a UCT search tree uniquely corresponding to a game state. State
 * nodes' children correspond to possible actions following that state.
 */
class StateNode<StateT extends GameState, ActionT extends Action> {
  visitCount = 0;
  actionToChild: Map<ActionT, ActionNode<StateT, ActionT>>;
  readonly playerValues = new NodeValues();
  constructor(
    readonly config: MctsConfig,
    readonly model: Model<StateT, ActionT>,
    readonly state: StateT
  ) {
    const policy = model.policy(state);
    this.actionToChild = new Map(
      policy.mapEntries(([action]) => [
        action,
        new ActionNode(config, model, action),
      ])
    );
  }

  /**
   * Returns values to backpropagate when this node is first reached as a new leaf
   */
  predictedValues(episode: Episode<StateT, ActionT>): PlayerValues {
    const episodeResult = episode.currentState.result;
    if (episodeResult != undefined) {
      return episodeResult;
    }

    const result = new NodeValues();
    if (this.config.valueNetworkWeight > 0) {
      result.mergeExpectedValues(
        this.model.value(this.state)
        // this.config.valueNetworkWeight
      );
    }
    if (this.config.randomPlayoutWeight > 0) {
      // TODO random playout
    }
    return result;
  }

  /**
   * Returns final player values if episode is at a terminal state or otherwise
   * selects an action, visits the corresponding action node, and returns the
   * result of that visit
   */
  visit(episode: Episode<StateT, ActionT>): PlayerValues {
    this.visitCount++;

    const episodeResult = episode.currentState.result;
    if (episodeResult != undefined) {
      return episodeResult;
    }

    const action = this.selectAction(this.state);
    let childNode = this.actionToChild.get(action);
    if (childNode == undefined) {
      throw new Error(
        "An action was visited which was not reported by the policy"
      );
    }
    this.playerValues.mergeExpectedValues(childNode.visit(episode));
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
): ImmutableMap<ActionT, number> {
  const currentPlayer = requireDefined(state.currentPlayer);
  const root = new StateNode(config, model, state);
  for (let step = 0; step < config.simulationCount; step++) {
    // root.
  }
  return ImmutableMap(
    Array.from(root.actionToChild.entries()).map(([action, node]) => [
      action,
      requireDefined(
        node.playerExpectedValues.playerIdToValue.get(currentPlayer.id)
      ),
    ])
  );
}

/**
 * Average values for each player at a single search tree node
 */
class NodeValues implements PlayerValues {
  resultCount = 0;
  playerIdToValue = ImmutableMap<string, number>();
  mergeExpectedValues(gameResult: PlayerValues) {
    this.resultCount++;
    for (const [playerId, value] of gameResult.playerIdToValue) {
      this.playerIdToValue = this.playerIdToValue.set(
        playerId,
        this.updatedPlayerValue(playerId, value)
      );
    }
  }
  megeNodeValues(other: NodeValues) {
    this.resultCount++;
    for (const [playerId, value] of other.playerIdToValue) {
      this.playerIdToValue = this.playerIdToValue.set(
        playerId,
        this.updatedPlayerValue(playerId, value)
      );
    }
  }
  /**
   * Returns the new average value for {@link playerId} taking into account {@link value}.
   *
   * {@link resultCount} should already take into account {@link value} when this method is called.
   */
  updatedPlayerValue(playerId: string, value: number): number {
    const currentValue = this.playerIdToValue.get(playerId) ?? 0;
    return currentValue + (value - currentValue) / this.resultCount;
  }
}
