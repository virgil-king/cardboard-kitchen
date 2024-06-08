import {
  Action,
  ChanceKey,
  PlayerValues,
  GameState,
  GameConfiguration,
  Game,
  EpisodeSnapshot,
  playerValuesToString,
  Player,
} from "./game.js";
import { Map as ImmutableMap, Seq } from "immutable";
import { requireDefined } from "studio-util";
import { Model } from "./model.js";

const debugLoggingEnabled = true;
function debugLog(block: () => string) {
  if (debugLoggingEnabled) {
    console.log(block());
  }
}

export class MctsConfig {
  readonly simulationCount: number;
  readonly explorationBias: number;
  constructor({
    simulationCount = 256,
    explorationBias = Math.sqrt(2),
  }: {
    simulationCount?: number;
    explorationBias?: number;
  }) {
    this.simulationCount = simulationCount;
    this.explorationBias = explorationBias;
  }
}

class MctsStats {
  actionNodesCreated = 0;
  stateNodesCreated = 0;
  terminalStatesReached = 0;
}

export interface MctsContext<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  readonly config: MctsConfig;
  readonly game: Game<C, S, A>;
  readonly model: Model<C, S, A>;
}

/**
 * A node in a UCT search tree uniquely corresponding to an action following a
 * previous state. Action nodes' children correspond to possible chance outcomes
 * following that action.
 */
class ActionNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  // TODO constrain the size of this map
  readonly chanceKeyToChild = new Map<ChanceKey, StateNode<C, S, A>>();
  /**
   * Weighted average values across the possible states resulting from this
   * node's action due to chance. Only populated after the first call to
   * {@link visit}.
   */
  readonly playerExpectedValues = new NodeValues();
  /**
   * @param prior probability of selecting this action from the previous state
   * according to {@link Model.policy}
   */
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly action: A,
    readonly prior: number
  ) {}

  get visitCount(): number {
    return this.playerExpectedValues.visitCount;
  }

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  visit(snapshot: EpisodeSnapshot<C, S>): PlayerValues {
    const [childState, chanceKey] = this.context.game.apply(
      snapshot,
      this.action
    );
    let stateNode = this.chanceKeyToChild.get(chanceKey);
    let result: PlayerValues;
    if (stateNode == undefined) {
      // New child
      debugLog(
        () => `Creating new state node for ${JSON.stringify(childState)}`
      );
      stateNode = new StateNode(this.context, snapshot.derive(childState));
      this.chanceKeyToChild.set(chanceKey, stateNode);
      // Use the new node's initial predicted values
      result = stateNode.predictedValues();
    } else {
      // Existing child: continue the search into a grandchild node
      debugLog(
        () => `Using existing state node for ${JSON.stringify(childState)}`
      );
      result = stateNode.visit();
    }
    this.playerExpectedValues.merge(result);
    debugLog(
      () =>
        `Action node ${JSON.stringify(
          this.action
        )} new values are ${this.playerExpectedValues.toString()}`
    );
    return result;
  }

  requirePlayerValue(player: Player): number {
    return requireDefined(
      this.playerExpectedValues.playerIdToValue.get(player.id)
    );
  }
}

/**
 * A node in a UCT search tree uniquely corresponding to a game state. State
 * nodes' children correspond to possible actions following that state.
 */
export class StateNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  visitCount = 0;
  actionToChild: Map<A, ActionNode<C, S, A>>;
  readonly playerValues = new NodeValues();
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>
  ) {
    const policy = context.model.policy(snapshot);
    const priorSum = Array.from(policy.values()).reduce(
      (sum, next) => sum + next,
      0
    );
    this.actionToChild = new Map(
      policy.mapEntries(([action, prior]) => [
        action,
        new ActionNode(context, action, prior / priorSum),
      ])
    );
  }

  /**
   * Returns expected values computed using all enabled prediction methods
   */
  predictedValues() {
    const episodeResult = this.context.game.result(this.snapshot);
    if (episodeResult != undefined) {
      debugLog(
        () =>
          `Using final result ${JSON.stringify(
            episodeResult
          )} for state ${JSON.stringify(this.snapshot.state)}`
      );
      return episodeResult;
    }

    const predictedValues = this.context.model.value(this.snapshot);
    debugLog(
      () =>
        `Using predicted values ${JSON.stringify(
          predictedValues
        )} for state ${JSON.stringify(this.snapshot.state)}`
    );
    return predictedValues;
  }

  /**
   * Returns final player values if this node corresponds to a terminal state or
   * otherwise selects an action, visits the corresponding action node, updates
   * this node's expected values based on that visit, and returns this node's
   * new expected values
   */
  visit(): PlayerValues {
    this.visitCount++;

    const episodeResult = this.context.game.result(this.snapshot);
    if (episodeResult != undefined) {
      // Don't bother merging values in this case; our values will always be
      // just the same episode result
      return episodeResult;
    }

    const action = this.selectAction();
    let child = this.actionToChild.get(action);
    if (child == undefined) {
      throw new Error(
        "An action was visited which was not reported by the policy"
      );
    }
    const childResult = child.visit(this.snapshot);
    this.playerValues.merge(childResult);
    debugLog(
      () =>
        `State node ${JSON.stringify(
          this.snapshot.state
        )} new values are ${this.playerValues.toString()}`
    );
    return childResult;
  }

  selectAction(): A {
    let maxUcb = -1;
    let maxUcbAction: A | undefined = undefined;
    const currentPlayer = requireDefined(
      this.context.game.currentPlayer(this.snapshot)
    );
    for (const [action, child] of this.actionToChild) {
      if (child.visitCount == 0) {
        debugLog(
          () => `Selecting ${JSON.stringify(action)} because it is unvisited`
        );
        return action;
      }

      debugLog(
        () =>
          `Considering action node ${JSON.stringify(
            action
          )} with values ${child.playerExpectedValues.toString()} and visit count ${
            child.visitCount
          }`
      );
      const ucb =
        requireDefined(
          child.playerExpectedValues.playerIdToValue.get(currentPlayer.id)
        ) +
        child.prior *
          this.context.config.explorationBias *
          Math.sqrt(Math.log(this.visitCount) / child.visitCount);
      if (ucb > maxUcb) {
        debugLog(
          () => `New max UCB ${ucb} for action ${JSON.stringify(action)}`
        );
        maxUcb = ucb;
        maxUcbAction = action;
      }
    }
    if (maxUcbAction == undefined) {
      throw new Error("No action to select");
    }
    debugLog(
      () => `Selecting ${JSON.stringify(maxUcbAction)} with max UCB ${maxUcb}`
    );
    return maxUcbAction;
  }
}

/**
 * Returns a map from possible actions from {@link snapshot} to their predicted
 * values for all players
 *
 * @param config MCTS configuration
 * @param game game with which to simulate episodes
 * @param model model to use to guide MCTS
 * @param snapshot game state from which to search
 * @returns map from valid actions to their expected values
 */
export function mcts<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  config: MctsConfig,
  game: Game<C, S, A>,
  model: Model<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>
): ImmutableMap<A, PlayerValues> {
  const currentPlayer = requireDefined(game.currentPlayer(snapshot));
  const context: MctsContext<C, S, A> = {
    config: config,
    game: game,
    model: model,
  };
  const root = new StateNode(context, snapshot);
  for (let step = 0; step < config.simulationCount; step++) {
    debugLog(() => `New simulation`);
    root.visit();
  }
  const result = ImmutableMap(
    Seq(root.actionToChild.entries()).map(([action, node]) => [
      action,
      node.playerExpectedValues,
    ])
  );
  debugLog(
    () =>
      `Result is ${JSON.stringify(
        result.toArray().map(([key, value]) => [JSON.stringify(key), value]),
        null,
        2
      )}`
  );
  return result;
}

/**
 * Average values for each player at a single search tree node
 */
class NodeValues implements PlayerValues {
  visitCount = 0;
  playerIdToValue = ImmutableMap<string, number>();
  /**
   * Updates the receiver to incorporate {@link values} as a new data point
   */
  merge(values: PlayerValues) {
    this.visitCount++;
    for (const [playerId, value] of values.playerIdToValue) {
      this.playerIdToValue = this.playerIdToValue.set(
        playerId,
        this.updatedPlayerValue(playerId, value)
      );
    }
  }

  /**
   * Returns the new average value for {@link playerId} taking into account {@link value}.
   *
   * {@link visitCount} should already take into account {@link value} when this method is called.
   */
  private updatedPlayerValue(playerId: string, value: number): number {
    const currentValue = this.playerIdToValue.get(playerId) ?? 0;
    return currentValue + (value - currentValue) / this.visitCount;
  }

  toString(): string {
    return playerValuesToString(this);
  }
}
