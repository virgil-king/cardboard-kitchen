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
import { Map as ImmutableMap, Range, Seq } from "immutable";
import {
  ProbabilityDistribution,
  requireDefined,
  weightedMerge,
} from "studio-util";
import { InferenceResult, InferenceModel } from "./model.js";
import gamma from "@stdlib/random-base-gamma";

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
  readonly modelValueWeight: number | undefined;
  readonly randomPlayoutConfig: RandomPlayoutConfig<C, S, A> | undefined;
  readonly maxChanceBranches: number;
  constructor(params: {
    simulationCount?: number;
    explorationBias?: number;
    modelValueWeight?: number;
    randomPlayoutConfig?: RandomPlayoutConfig<C, S, A>;
    maxChanceBranches?: number;
    minPolicyValue?: number;
  }) {
    this.simulationCount = params.simulationCount ?? 32;
    this.explorationBias = params.explorationBias ?? Math.sqrt(2);
    this.modelValueWeight = params.modelValueWeight;
    this.randomPlayoutConfig = params.randomPlayoutConfig;
    if (
      this.modelValueWeight == undefined &&
      this.randomPlayoutConfig == undefined
    ) {
      throw new Error(
        `modelValueWeight and randomPlayoutConfig were both null`
      );
    }
    this.maxChanceBranches = params.maxChanceBranches ?? 4;
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
  chanceKeyToChild = ImmutableMap<ChanceKey, StateNode<C, S, A>>();
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
    readonly prior: number,
    /** Predicted value for the acting player */
    readonly predictedValue: number
  ) {
    this.context.stats.actionNodesCreated++;
  }

  get visitCount(): number {
    return this.playerExpectedValues.visitCount;
  }

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  async *visit(
    snapshot: EpisodeSnapshot<C, S>
  ): AsyncGenerator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
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
        const start = performance.now();
        const inferenceResult = yield childSnapshot;
        this.context.stats.inferenceTimeMs += performance.now() - start;
        this.context.stats.inferences++;
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
      result = await stateNode.predictedValues();
    } else {
      // Existing child: continue the search into a grandchild node
      // debugLog(
      //   () => `Using existing state node for ${JSON.stringify(childState)}`
      // );
      result = yield* stateNode.visit();
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

  addToCache(chanceKey: ChanceKey, node: StateNode<C, S, A>) {
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
  predictedValues(): Promise<PlayerValues>;
  visit(): AsyncGenerator<
    EpisodeSnapshot<C, S>,
    PlayerValues,
    InferenceResult<A>
  >;
}

const gammaFactory = gamma.factory(0.3, 1);
const explorationFactor = 0.25;

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
  actionToChild: ImmutableMap<A, ActionNode<C, S, A>>;
  readonly playerValues = new NodeValues();
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>,
    readonly inferenceResult: InferenceResult<A>,
    addExplorationNoise: boolean = false
  ) {
    context.stats.stateNodesCreated++;

    let policy = ProbabilityDistribution.create(inferenceResult.policy);
    let itemToPrior = policy.itemToProbability;

    if (addExplorationNoise) {
      itemToPrior = itemToPrior.map((prior) => {
        const noise = gammaFactory();
        return explorationFactor * noise + (1 - explorationFactor) * prior;
      });
    }

    const maxPolicyLogit = requireDefined(
      inferenceResult.policy.valueSeq().max()
    );
    const currentPlayer = requireDefined(context.game.currentPlayer(snapshot));
    const statePredictedValue = requireDefined(
      inferenceResult.value.playerIdToValue.get(currentPlayer.id)
    );

    this.actionToChild = ImmutableMap(
      itemToPrior.map((prior, action) => {
        // Estimate the value of this action for the acting player as the
        // estimated value of the parent node times the ratio between the
        // action's logit and the best action's logit
        const policyLogit = requireDefined(inferenceResult.policy.get(action));
        const actionPredictedValue =
          (policyLogit / maxPolicyLogit) * statePredictedValue;
        return new ActionNode(context, action, prior, actionPredictedValue);
      })
    );
  }

  /**
   * Returns expected values computed using all enabled prediction methods
   */
  async predictedValues(): Promise<PlayerValues> {
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

    const modelValues = this.inferenceResult.value;

    const config = this.context.config;
    if (
      config.modelValueWeight != undefined &&
      config.randomPlayoutConfig == undefined
    ) {
      return modelValues;
    }

    if (config.randomPlayoutConfig != undefined) {
      const startMs = performance.now();
      const randomPlayoutValues = await this.randomPlayout(
        config.randomPlayoutConfig.agent
      );
      this.context.stats.randomPlayoutTimeMs += performance.now() - startMs;

      if (config.modelValueWeight == undefined) {
        return randomPlayoutValues;
      }

      const mergedValues = weightedMerge(
        modelValues.playerIdToValue,
        config.modelValueWeight,
        randomPlayoutValues.playerIdToValue,
        config.randomPlayoutConfig.weight
      );
      if (mergedValues.find((n) => Number.isNaN(n)) != undefined) {
        throw new Error(
          `modelValues: ${modelValues.playerIdToValue}, playout values: ${randomPlayoutValues.playerIdToValue}`
        );
      }
      return new PlayerValues(mergedValues);
    }

    throw new Error("Neigher model values or random playouts configured");
  }

  async randomPlayout(agent: Agent<C, S, A>): Promise<PlayerValues> {
    // console.log(`Starting random playout from ${JSON.stringify(this.snapshot.state)}`);
    let snapshot = this.snapshot;
    while (true) {
      const result = this.context.game.result(snapshot);
      if (result != undefined) {
        return result;
      }
      // Ignore chance keys
      const [newState] = this.context.game.apply(
        snapshot,
        await agent.act(snapshot)
      );
      snapshot = snapshot.derive(newState);
    }
  }

  /**
   * Returns final player values if this node corresponds to a terminal state or
   * otherwise selects an action, visits the corresponding action node, updates
   * this node's expected values based on that visit, and returns this node's
   * new expected values
   */
  async *visit(
    selectUnvisitedActionsFirst: boolean = false
  ): AsyncGenerator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
    this.visitCount++;

    const episodeResult = this.context.game.result(this.snapshot);
    if (episodeResult != undefined) {
      // Don't bother merging values in this case; our values will always be
      // just the same episode result
      return episodeResult;
    }

    const action = this.selectAction(selectUnvisitedActionsFirst);
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

  selectAction(selectUnvisitedActionsFirst: boolean): A {
    let maxUcb = Number.NEGATIVE_INFINITY;
    let maxUcbAction: A | undefined = undefined;
    const currentPlayer = requireDefined(
      this.context.game.currentPlayer(this.snapshot)
    );
    const childEvs = [];
    const ucbs = [];

    // const pb_c_base = 19652;
    // const pb_c_init = 1.25 * 3; // 3 is the max value in four-player games

    for (const [action, child] of this.actionToChild) {
      if (selectUnvisitedActionsFirst && child.visitCount == 0) {
        debugLog(
          () => `Selecting ${JSON.stringify(action)} because it is unvisited`
        );
        return action;
      }

      const childEv = child.playerExpectedValues.playerIdToValue.get(
        currentPlayer.id
      );
      childEvs.push(childEv);
      // const explorationBonus =
      // pb_c_init + Math.log((this.visitCount + pb_c_base + 1) / pb_c_base);
      const ucb =
        (childEv ?? child.predictedValue) +
        (child.prior *
          this.context.config.explorationBias *
          Math.sqrt(1 + this.visitCount)) /
          (1 + child.visitCount);
      ucbs.push(ucb);

      debugLog(
        () =>
          `Considering action node ${JSON.stringify(
            action
          )} with current value ${child.playerExpectedValues.playerIdToValue.get(
            currentPlayer.id
          )}, prior ${child.prior}, visit count ${
            child.visitCount
          }, and UCB score ${ucb}`
      );

      // console.log(`ucb is ${ucb}`);
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
        )}; policy ${JSON.stringify(
          this.inferenceResult.policy.toArray(),
          undefined,
          2
        )}; child priors ${[...this.actionToChild.entries()].map(
          (entry) => entry[1].prior
        )}; ucbs = ${ucbs}; child evs = ${childEvs}`
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

  async predictedValues(): Promise<PlayerValues> {
    return this.result;
  }

  async *visit(): AsyncGenerator<
    EpisodeSnapshot<C, S>,
    PlayerValues,
    InferenceResult<A>
  > {
    this.visitCount++;
    return this.result;
  }
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
