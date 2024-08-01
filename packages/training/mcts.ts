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
  Agent,
} from "game";
import { Map as ImmutableMap, Seq } from "immutable";
import { requireDefined, weightedMerge } from "studio-util";
import { InferenceResult, InferenceModel } from "./model.js";

const debugLoggingEnabled = false;
function debugLog(block: () => string) {
  if (debugLoggingEnabled) {
    console.log(block());
  }
}

type RandomPlayoutConfig<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> = {
  /** Weight to apply to random playout values, relative to 1 */
  weight: number;
  agent: Agent<C, S, A>;
};

export class MctsConfig<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  readonly simulationCount: number;
  readonly explorationBias: number;
  readonly randomPlayoutConfig: RandomPlayoutConfig<C, S, A> | undefined;
  readonly maxChanceBranches: number;
  readonly minPrior: number;
  constructor({
    simulationCount = 32,
    explorationBias = 3, // Math.sqrt(2),
    randomPlayoutConfig = undefined,
    maxChanceBranches = 4,
    minPolicyValue = 0.01,
  }: {
    simulationCount?: number;
    explorationBias?: number;
    randomPlayoutConfig?: RandomPlayoutConfig<C, S, A>;
    maxChanceBranches?: number;
    minPolicyValue?: number;
  }) {
    this.simulationCount = simulationCount;
    this.explorationBias = explorationBias;
    this.randomPlayoutConfig = randomPlayoutConfig;
    this.maxChanceBranches = maxChanceBranches;
    this.minPrior = minPolicyValue;
  }
}

export class MctsStats {
  actionNodesCreated = 0;
  stateNodesCreated = 0;
  terminalStatesReached = 0;
  inferences = 0;
  inferenceTimeMs = 0;
  randomPlayoutTimeMs = 0;
}

export interface MctsContext<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  readonly config: MctsConfig<C, S, A>;
  readonly game: Game<C, S, A>;
  readonly model: InferenceModel<C, S, A>;
  readonly stats: MctsStats;
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
  chanceKeyToChild = ImmutableMap<ChanceKey, StateNode>();
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
  ) {
    if (prior < 0) {
      throw new Error(`Negative prior ${prior}`);
    }
    this.context.stats.actionNodesCreated++;
  }

  get visitCount(): number {
    return this.playerExpectedValues.visitCount;
  }

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  *visit(
    snapshot: EpisodeSnapshot<C, S>
  ): Generator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
    const [childState, chanceKey] = this.context.game.apply(
      snapshot,
      this.action
    );
    let stateNode = this.chanceKeyToChild.get(chanceKey);
    let result: PlayerValues;
    if (stateNode == undefined) {
      // New child
      // debugLog(
      //   () => `Creating new state node for ${JSON.stringify(childState)}`
      // );
      const childSnapshot = snapshot.derive(childState);
      if (this.context.game.result(childSnapshot) == undefined) {
        const inferenceResult = yield childSnapshot;
        stateNode = new NonTerminalStateNode(
          this.context,
          childSnapshot,
          inferenceResult
        );
      } else {
        stateNode = new TerminalStateNode(this.context, childSnapshot);
      }
      this.addToCache(chanceKey, stateNode);
      // Use the new node's initial predicted values
      result = stateNode.predictedValues();
    } else {
      // Existing child: continue the search into a grandchild node
      // debugLog(
      //   () => `Using existing state node for ${JSON.stringify(childState)}`
      // );
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

  addToCache(chanceKey: ChanceKey, node: StateNode) {
    if (
      this.chanceKeyToChild.count() >= this.context.config.maxChanceBranches
    ) {
      // Eject a least-visited child
      const [leastVisitedKey, leastVisitedNode] = requireDefined(
        Seq(this.chanceKeyToChild.entries()).min(
          ([, aValue], [, bValue]) => aValue.visitCount - bValue.visitCount
        )
      );
      debugLog(
        () =>
          `Ejecting state node for ${leastVisitedKey} with visit count ${leastVisitedNode.visitCount}`
      );
      this.chanceKeyToChild = this.chanceKeyToChild.remove(leastVisitedKey);
    }
    this.chanceKeyToChild = this.chanceKeyToChild.set(chanceKey, node);
  }

  requirePlayerValue(player: Player): number {
    return requireDefined(
      this.playerExpectedValues.playerIdToValue.get(player.id)
    );
  }
}

interface StateNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  visitCount: number;
  predictedValues(): PlayerValues;
  visit(): Generator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>>;
}

/**
 * A node in a UCT search tree uniquely corresponding to a game state. State
 * nodes' children correspond to possible actions following that state.
 */
export class NonTerminalStateNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements StateNode<C, S, A>
{
  visitCount = 0;
  actionToChild: Map<A, ActionNode<C, S, A>>;
  readonly playerValues = new NodeValues();
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>,
    readonly inferenceResult: InferenceResult<A>
  ) {
    this.context.stats.stateNodesCreated++;
    // const inferenceStartMs = performance.now();
    // this.inferenceResult = context.model.infer([snapshot])[0];
    // this.context.stats.inferenceTimeMs += performance.now() - inferenceStartMs;
    // this.context.stats.inferences++;
    let policy = this.inferenceResult.policy;
    // console.log(`policy is ${policy.toArray()}`);

    // Shift priors if needed to honor the configured minimum prior
    const minPrior = requireDefined(Seq(policy.values()).min());
    if (minPrior < context.config.minPrior) {
      const delta = context.config.minPrior - minPrior;
      policy = policy.map((value) => value + delta);
      // console.log(`Compensated for negative policy values`);
    }

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
    // debugLog(() => `actionToChild is ${JSON.stringify(this.actionToChild)}`);
  }

  /**
   * Returns expected values computed using all enabled prediction methods
   */
  predictedValues(): PlayerValues {
    const episodeResult = this.context.game.result(this.snapshot);
    if (episodeResult != undefined) {
      debugLog(
        () =>
          `Using final result ${JSON.stringify(
            episodeResult
          )} for state ${JSON.stringify(this.snapshot.state)}`
      );
      this.context.stats.terminalStatesReached++;
      return episodeResult;
    }

    // Model prediction
    let predictedValues = this.inferenceResult.value;
    // debugLog(
    //   () =>
    //     `Using predicted values ${JSON.stringify(
    //       predictedValues
    //     )} for state ${JSON.stringify(this.snapshot.state)}`
    // );

    // Random playout
    const randomPlayoutConfig = this.context.config.randomPlayoutConfig;
    if (randomPlayoutConfig != undefined) {
      const startMs = performance.now();
      const randomPlayoutValues = this.randomPlayout(randomPlayoutConfig.agent);
      predictedValues = new PlayerValues(
        weightedMerge(
          predictedValues.playerIdToValue,
          1,
          randomPlayoutValues.playerIdToValue,
          randomPlayoutConfig.weight
        )
      );
      this.context.stats.randomPlayoutTimeMs += performance.now() - startMs;
    }

    return predictedValues;
  }

  randomPlayout(agent: Agent<C, S, A>): PlayerValues {
    // console.log(`Starting random playout from ${JSON.stringify(this.snapshot.state)}`);
    let snapshot = this.snapshot;
    while (true) {
      const result = this.context.game.result(snapshot);
      if (result != undefined) {
        return result;
      }
      // Ignore chance keys
      const [newState] = this.context.game.apply(snapshot, agent.act(snapshot));
      snapshot = snapshot.derive(newState);
    }
  }

  /**
   * Returns final player values if this node corresponds to a terminal state or
   * otherwise selects an action, visits the corresponding action node, updates
   * this node's expected values based on that visit, and returns this node's
   * new expected values
   */
  *visit(): Generator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
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
    const childResult = yield* child.visit(this.snapshot);
    this.playerValues.merge(childResult);
    // debugLog(
    //   () =>
    //     `State node ${JSON.stringify(
    //       this.snapshot.state
    //     )} new values are ${this.playerValues.toString()}`
    // );
    return childResult;
  }

  selectAction(): A {
    let maxUcb = Number.NEGATIVE_INFINITY;
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
          )} with current value ${child.playerExpectedValues.playerIdToValue.get(
            currentPlayer.id
          )}, prior ${child.prior}, and visit count ${child.visitCount}`
      );
      const ucb =
        requireDefined(
          child.playerExpectedValues.playerIdToValue.get(currentPlayer.id)
        ) +
        (child.prior *
          this.context.config.explorationBias *
          Math.sqrt(Math.log(this.visitCount))) /
          child.visitCount;
      if (ucb > maxUcb) {
        debugLog(
          () => `New max UCB ${ucb} for action ${JSON.stringify(action)}`
        );
        maxUcb = ucb;
        maxUcbAction = action;
      }
    }
    if (maxUcbAction == undefined) {
      throw new Error(
        `No action to select from state ${JSON.stringify(
          this.snapshot.state,
          undefined,
          2
        )}`
      );
    }
    debugLog(
      () => `Selecting ${JSON.stringify(maxUcbAction)} with max UCB ${maxUcb}`
    );
    return maxUcbAction;
  }
}

export class TerminalStateNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements StateNode<C, S, A>
{
  result: PlayerValues;
  visitCount = 0;
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>
  ) {
    const gameResult = context.game.result(snapshot);
    if (gameResult == undefined) {
      throw new Error(`Terminal node created with non-terminal state`);
    }
    this.result = gameResult;
  }

  predictedValues(): PlayerValues {
    return this.result;
  }

  *visit(): Generator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
    this.visitCount++;
    return this.result;
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
  config: MctsConfig<C, S, A>,
  game: Game<C, S, A>,
  model: InferenceModel<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>
): ImmutableMap<A, PlayerValues> {
  const currentPlayer = requireDefined(game.currentPlayer(snapshot));
  const context: MctsContext<C, S, A> = {
    config: config,
    game: game,
    model: model,
    stats: new MctsStats(),
  };
  const inferenceResult = model.infer([snapshot])[0];
  const root = new NonTerminalStateNode(context, snapshot, inferenceResult);
  for (let step = 0; step < config.simulationCount; step++) {
    debugLog(() => `New simulation`);
    root.visit();
  }
  const result = ImmutableMap(
    Seq(root.actionToChild.entries()).map(([action, node]) => [
      action,
      new PlayerValues(node.playerExpectedValues.playerIdToValue),
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
class NodeValues {
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
    return playerValuesToString(this.playerIdToValue);
  }
}
