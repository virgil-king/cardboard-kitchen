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
} from "game";
import { Map as ImmutableMap, Seq } from "immutable";
import {
  ProbabilityDistribution,
  requireDefined,
  requireFulfilled,
  weightedMerge,
} from "studio-util";
import { InferenceResult, InferenceModel } from "./model.js";

/**
 * This MCTS implementation supports batch inference within a single
 * episode. It does so by returning Promises from inference and node
 * visits, allowing nodes to be visited multiple times before any
 * inference occurs. Then queued inferences can be performed as a
 * batch causing the accumulated graph of Promises to be resolved to
 * back-propagate new leaf node values.
 *
 * The order of node visits is not exactly the same as in non-batch
 * MCTS since leaf nodes don't contribute new back-propagated values
 * to affect subsequent searches in the same batch.
 */

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
// Exported for testing
export class ActionNode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  private chanceKeyToChild = ImmutableMap<ChanceKey, StateNode<C, S, A>>();
  incompleteVisitCount = 0;
  /**
   * Weighted average values across the possible states resulting from this
   * node's action due to chance. Only populated after the first call to
   * {@link visit} has fully resolved.
   */
  readonly playerExpectedValues = new NodeValues();
  /**
   * @param prior probability of selecting this action from the previous state
   * according to {@link Model.policy}.
   *
   * This property has a placeholder value until its parent state node has
   * received and processed its inference result.
   */
  priorProbability: number;
  priorLogit: number;
  /** Predicted value of this action for the acting player */
  predictedValue = 0;
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly action: A,
    prior: number,
    priorLogit: number
  ) {
    if (prior < 0) {
      throw new Error(`Negative prior ${prior}`);
    }
    this.priorProbability = prior;
    this.priorLogit = priorLogit;
    this.context.stats.actionNodesCreated++;
  }

  get visitCount(): number {
    return this.playerExpectedValues.visitCount;
  }

  get combinedVisitCount(): number {
    return this.visitCount + this.incompleteVisitCount;
  }

  initializeFromModel(
    priorProbability: number,
    priorLogit: number,
    predictedValue: number
  ) {
    this.priorProbability = priorProbability;
    this.priorLogit = priorLogit;
    this.predictedValue = predictedValue;
  }

  /**
   * Updates the node by applying {@link action} to {@link episode} and then
   * creating or visiting the resulting state node
   */
  async visit(snapshot: EpisodeSnapshot<C, S>): Promise<PlayerValues> {
    this.incompleteVisitCount++;
    const [childState, chanceKey] = this.context.game.apply(
      snapshot,
      this.action
    );
    let stateNode = this.chanceKeyToChild.get(chanceKey);
    let stateNodeValues: Promise<PlayerValues>;
    if (stateNode == undefined) {
      const childSnapshot = snapshot.derive(childState);
      let stateNode: StateNode<C, S, A>;
      if (this.context.game.result(childSnapshot) == undefined) {
        stateNode = new NonTerminalStateNode(this.context, childSnapshot);
      } else {
        stateNode = new TerminalStateNode(this.context, childSnapshot);
      }
      this.addToCache(chanceKey, stateNode);
      // Use the new node's initial predicted values
      stateNodeValues = stateNode.predictedValues();
    } else {
      stateNodeValues = stateNode.visit();
    }
    const it = await stateNodeValues;
    this.playerExpectedValues.merge(it);
    this.incompleteVisitCount--;
    debugLog(
      () =>
        `Action node ${JSON.stringify(
          this.action
        )} new values are ${this.playerExpectedValues.toString()}`
    );
    return it;
  }

  private addToCache(chanceKey: ChanceKey, node: StateNode<C, S, A>) {
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
  /**
   * Count of visits whose results are not yet reflected in the node's values
   */
  incompleteVisitCount: number;
  visitCount: number;
  combinedVisitCount: number;
  predictedValues(): Promise<PlayerValues>;
  visit(): Promise<PlayerValues>;
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
  incompleteVisitCount = 0;
  // TODO use playerValues visit count instead?
  visitCount = 0;
  actionToChild = ImmutableMap<A, ActionNode<C, S, A>>();
  readonly playerValues = new NodeValues();
  readonly inference: Promise<InferenceResult<A>>;
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>
  ) {
    if (context.game.result(snapshot) != undefined) {
      throw new Error(`Non-terminal node created with terminal snapshot`);
    }

    this.context.stats.stateNodesCreated++;

    const legalActions = [...context.game.legalActions(snapshot)];
    // Initialize child action nodes with uniform priors. Priors will be
    // replaced with model priors after the first batch of inference
    // results is received.
    debugLog(() => `legalActions = ${JSON.stringify(legalActions)}`);
    const uniformPrior = 1 / legalActions.length;
    for (const action of legalActions) {
      this.actionToChild = this.actionToChild.set(
        action,
        new ActionNode(context, action, uniformPrior, uniformPrior)
      );
    }

    this.context.stats.inferences++;
    this.inference = context.model.infer([snapshot]).then((resultBatch) => {
      const inferenceResult = resultBatch[0];
      debugLog(
        () =>
          `policy is ${JSON.stringify(inferenceResult.policyLogits.toArray())}`
      );
      const actionToModelPrior = ProbabilityDistribution.fromLogits(
        inferenceResult.policyLogits
      );

      debugLog(
        () =>
          `actionToModelPrior is ${JSON.stringify(
            actionToModelPrior.itemToProbability.toArray()
          )}`
      );

      const maxPolicyLogit = requireDefined(
        inferenceResult.policyLogits.valueSeq().max()
      );
      const currentPlayer = requireDefined(
        context.game.currentPlayer(snapshot)
      );
      const statePredictedValue = requireDefined(
        inferenceResult.value.playerIdToValue.get(currentPlayer.id)
      );

      for (const [
        action,
        modelPriorProbability,
      ] of actionToModelPrior.itemToProbability.entries()) {
        const actionNode = this.actionToChild.get(action);
        if (actionNode == undefined) {
          throw new Error(
            `No action node for model policy action ${JSON.stringify(
              action
            )}; actionToChild is ${JSON.stringify(this.actionToChild)}`
          );
        }

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

        debugLog(
          () =>
            `Updating ${JSON.stringify(
              action
            )} with prior=${modelPriorProbability} and predictedValue=${actionPredictedValue}`
        );
        actionNode.initializeFromModel(
          modelPriorProbability,
          policyLogit,
          actionPredictedValue
        );
      }
      return inferenceResult;
    });
  }

  get combinedVisitCount(): number {
    return this.visitCount + this.incompleteVisitCount;
  }

  /**
   * Returns expected values computed using all enabled prediction methods
   */
  async predictedValues(): Promise<PlayerValues> {
    const config = this.context.config;
    const modelValueWeight = config.modelValueWeight;
    const randomPlayoutConfig = config.randomPlayoutConfig;
    if (modelValueWeight != undefined && randomPlayoutConfig == undefined) {
      return (await this.inference).value;
    }

    if (randomPlayoutConfig != undefined) {
      const startMs = performance.now();
      const randomPlayoutValues = this.randomPlayout(randomPlayoutConfig.agent);
      this.context.stats.randomPlayoutTimeMs += performance.now() - startMs;

      if (modelValueWeight == undefined) {
        return randomPlayoutValues;
      }

      const modelValuesResult = (await this.inference).value;
      const randomPlayoutValuesResult = await randomPlayoutValues;
      const mergedValues = weightedMerge(
        modelValuesResult.playerIdToValue,
        modelValueWeight,
        randomPlayoutValuesResult.playerIdToValue,
        randomPlayoutConfig.weight
      );
      if (mergedValues.find((n) => Number.isNaN(n)) != undefined) {
        throw new Error(
          `modelValues: ${modelValuesResult.playerIdToValue}, playout values: ${randomPlayoutValuesResult.playerIdToValue}`
        );
      }
      return new PlayerValues(mergedValues);
    }

    throw new Error("Neither model values nor random playouts configured");
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

  /**
   * Selects an action, visits the corresponding action node, updates this node's
   * expected values based on that visit, and returns this node's new expected values
   */
  async visit(
    selectUnvisitedActionsFirst: boolean = false
  ): Promise<PlayerValues> {
    this.incompleteVisitCount++;

    const action = this.selectAction(selectUnvisitedActionsFirst);
    let child = this.actionToChild.get(action);
    if (child == undefined) {
      throw new Error(
        "An action was visited which was not reported by the policy"
      );
    }
    const childResultPromise = child.visit(this.snapshot);

    return Promise.allSettled([this.inference, childResultPromise]).then(
      ([inferenceResult, childResult]) => {
        const unused = requireFulfilled(inferenceResult);
        const childValue = requireFulfilled(childResult);
        this.playerValues.merge(childValue);
        this.incompleteVisitCount--;
        this.visitCount++;
        return childValue;
      }
    );
  }

  selectAction(selectUnvisitedActionsFirst: boolean): A {
    let maxUcb = Number.NEGATIVE_INFINITY;
    let maxUcbAction: A | undefined = undefined;
    const currentPlayer = requireDefined(
      this.context.game.currentPlayer(this.snapshot)
    );
    const ucbs = [];
    for (const [action, child] of this.actionToChild) {
      if (selectUnvisitedActionsFirst && child.combinedVisitCount == 0) {
        debugLog(
          () => `Selecting ${JSON.stringify(action)} because it is unvisited`
        );
        return action;
      }

      const childEv =
        child.playerExpectedValues.playerIdToValue.get(currentPlayer.id) ??
        child.predictedValue;

      debugLog(
        () =>
          `Considering action node ${JSON.stringify(
            action
          )} with current value ${childEv}, prior ${
            child.priorProbability
          }, visit count ${child.visitCount}, and incomplete visit count ${
            child.incompleteVisitCount
          }`
      );

      // Incomplete visits are not counted in child EVs, which are only
      // based on complete visits, but we do count them in the second
      // component of this formula to encourage search to visit different
      // children within a batch
      const ucb =
        childEv +
        child.priorProbability *
          Math.sqrt(
            (this.context.config.explorationBias *
              Math.log(1 + this.combinedVisitCount)) /
              (1 + child.combinedVisitCount)
          );
      ucbs.push(ucb);
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
  incompleteVisitCount = 0;
  visitCount = 0;
  constructor(
    readonly context: MctsContext<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S>
  ) {
    const gameResult = context.game.result(snapshot);
    debugLog(
      () =>
        `Creating new terminal node for state ${JSON.stringify(
          snapshot,
          undefined,
          2
        )} with result ${JSON.stringify(gameResult, undefined, 2)}`
    );
    if (gameResult == undefined) {
      throw new Error(`Terminal node created with non-terminal state`);
    }
    this.result = gameResult;
  }

  get combinedVisitCount(): number {
    return this.visitCount;
  }

  async predictedValues(): Promise<PlayerValues> {
    return this.result;
  }

  async visit(): Promise<PlayerValues> {
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
