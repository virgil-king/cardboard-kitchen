import {
  Action,
  ChanceKey,
  PlayerValues,
  GameState,
  GameConfiguration,
  Game,
  EpisodeSnapshot,
  Player,
  Agent,
  ProbabilityDistribution,
  requireDefined,
  weightedMerge,
} from "game";
import { Map as ImmutableMap, Seq } from "immutable";
import { InferenceResult, InferenceModel } from "./model.js";
import gamma from "@stdlib/random-base-gamma";
import {
  ActionNodeInfo,
  ActionStatistics,
  StateNodeInfo,
  StateSearchData,
} from "training-data";

// This file is an implementation of MCTS that supports multiple-episode
// batching due to its asynchronous API but does not support single-episode
// batching

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
  readonly selectChild: (
    node: NonTerminalStateNode<C, S, A>
  ) => ActionNode<C, S, A>;
  constructor(params: {
    simulationCount?: number;
    explorationBias?: number;
    modelValueWeight?: number;
    randomPlayoutConfig?: RandomPlayoutConfig<C, S, A>;
    maxChanceBranches?: number;
    minPolicyValue?: number;
    selectChild?: (node: NonTerminalStateNode<C, S, A>) => ActionNode<C, S, A>;
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
    this.selectChild = params.selectChild ?? ((node) => node.selectChildUcb());
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
export class ActionNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements ActionNodeInfo
{
  chanceKeyToChild = ImmutableMap<ChanceKey, StateNode<C, S, A>>();
  /**
   * Weighted average values across the possible states resulting from this
   * node's action due to chance. Only populated after the first call to
   * {@link visit}.
   */
  readonly playerExpectedValues = new NodeValues();
  /**
   * @param priorProbability probability of selecting this action from the previous state
   * according to {@link Model.policy}
   */
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly action: A,
    /** Predicted value for the acting player */
    readonly predictedValue: number,
    readonly priorProbability: number,
    readonly priorLogit: number
  ) {
    if (isNaN(predictedValue)) {
      throw new Error(`Predicted value was NaN`);
    }

    this.context.stats.actionNodesCreated++;
  }

  get visitCount(): number {
    return this.playerExpectedValues.visitCount;
  }

  get expectedValues(): PlayerValues {
    return new PlayerValues(this.playerExpectedValues.playerIdToValue);
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
      debugLog(
        () => `Creating new state node for ${JSON.stringify(childState)}`
      );
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
      result = await stateNode.expectedValues();
    } else {
      // Existing child: continue the search into a grandchild node
      debugLog(
        () => `Using existing state node for ${JSON.stringify(childState)}`
      );
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
  /**
   * Returns an initial prediction of the player values for the node
   */
  expectedValues(): Promise<PlayerValues>;
  /**
   * Visits the node, selects a child using the configured function,
   * yields a snapshot for inference if needed, and returns
   * player values updated based on the new visit.
   */
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
> implements StateNode<C, S, A>, StateNodeInfo<A>
{
  visitCount = 0;
  actionToChild: ImmutableMap<A, ActionNode<C, S, A>>;
  readonly playerValues = new NodeValues();
  readonly policy: ProbabilityDistribution<A>;
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>,
    readonly inferenceResult: InferenceResult<A>,
    /** Whether to add noise to child priors. Used at the root node only in AlphaZero. */
    addExplorationNoise: boolean = false
  ) {
    const episodeResult = this.context.game.result(this.snapshot);
    if (episodeResult != undefined) {
      throw new Error(`NonTerminalStateNode created with terminal state`);
    }

    this.context.stats.stateNodesCreated++;

    this.policy = ProbabilityDistribution.fromLogits(
      this.inferenceResult.policyLogits
    );
    let itemToPrior = this.policy.itemToProbability;

    if (addExplorationNoise) {
      itemToPrior = itemToPrior.map((prior) => {
        const noise = gammaFactory();
        return explorationFactor * noise + (1 - explorationFactor) * prior;
      });
    }

    const maxPolicyLogit = requireDefined(
      inferenceResult.policyLogits.valueSeq().max()
    );
    const currentPlayer = requireDefined(context.game.currentPlayer(snapshot));
    const statePredictedValue = requireDefined(
      inferenceResult.value.playerIdToValue.get(currentPlayer.id)
    );

    this.actionToChild = ImmutableMap(
      itemToPrior.map((priorProbability, action) => {
        // Estimate the value of this action for the acting player as the
        // estimated value of the parent node times the ratio between the
        // action's logit and the best action's logit
        const policyLogit = requireDefined(
          inferenceResult.policyLogits.get(action)
        );
        const actionPredictedValue =
          maxPolicyLogit == 0
            ? 0
            : (policyLogit / maxPolicyLogit) * statePredictedValue;
        return new ActionNode(
          context,
          action,
          actionPredictedValue,
          priorProbability,
          requireDefined(this.inferenceResult.policyLogits.get(action))
        );
      })
    );
  }

  get predictedValues(): PlayerValues {
    return this.inferenceResult.value;
  }

  get actionToNodeInfo(): ImmutableMap<A, ActionNodeInfo> {
    return this.actionToChild;
  }

  /**
   * Returns expected values computed using all enabled prediction methods
   */
  async expectedValues(): Promise<PlayerValues> {
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

  visit(): AsyncGenerator<
    EpisodeSnapshot<C, S>,
    PlayerValues,
    InferenceResult<A>
  > {
    const child = this.context.config.selectChild(this);
    return this.visitChild(child);
  }

  async *visitChild(
    child: ActionNode<C, S, A>
  ): AsyncGenerator<EpisodeSnapshot<C, S>, PlayerValues, InferenceResult<A>> {
    this.visitCount++;
    const childResult = yield* child.visit(this.snapshot);
    this.playerValues.merge(childResult);
    return childResult;
  }

  selectChildUcb(): ActionNode<C, S, A> {
    let maxUcb = Number.NEGATIVE_INFINITY;
    let maxUcbAction: A | undefined = undefined;
    let maxUcbChild: ActionNode<C, S, A> | undefined = undefined;
    const currentPlayer = requireDefined(
      this.context.game.currentPlayer(this.snapshot)
    );
    const childEvs = [];
    const ucbs = [];

    for (const [action, child] of this.actionToChild) {
      const childEv = child.playerExpectedValues.playerIdToValue.get(
        currentPlayer.id
      );
      childEvs.push(childEv);
      const ucb =
        (childEv ?? child.predictedValue) +
        (child.priorProbability *
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
          )}, prior ${child.priorProbability}, visit count ${
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
        maxUcbChild = child;
      }
    }
    if (maxUcbChild == undefined) {
      throw new Error(
        `No action to select from state ${JSON.stringify(
          this.snapshot.state,
          undefined,
          2
        )}; policy logits ${JSON.stringify(
          this.inferenceResult.policyLogits.toArray(),
          undefined,
          2
        )}; child priors ${[...this.actionToChild.entries()].map(
          (entry) => entry[1].priorProbability
        )}; ucbs = ${JSON.stringify(ucbs)}; child evs = ${JSON.stringify(
          childEvs
        )}`
      );
    }
    debugLog(
      () => `Selecting ${JSON.stringify(maxUcbAction)} with max UCB ${maxUcb}`
    );
    return maxUcbChild;
  }

  stateSearchData(): StateSearchData<S, A> {
    return new StateSearchData(
      this.snapshot.state,
      this.inferenceResult.value,
      ImmutableMap(
        Seq(this.actionToChild.entries()).map(([action, child]) => [
          action,
          new ActionStatistics(
            child.priorProbability,
            child.priorLogit,
            child.visitCount,
            new PlayerValues(child.playerExpectedValues.playerIdToValue)
          ),
        ])
      ),
      this.visitCount
    );
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

  async expectedValues(): Promise<PlayerValues> {
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
    return JSON.stringify(this.playerIdToValue.toArray());
  }
}
