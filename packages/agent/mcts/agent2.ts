import {
  Action,
  Agent,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  PlayerValues,
  requireDefined,
  throwFirstRejection,
} from "game";
import { Map, Range, Seq } from "immutable";
import {
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts2.js";
import { BatchingModel } from "../batchingmodel.js";
import { InferenceModel } from "../model.js";
import { ActionStatistics } from "../training-data.js";

export type MctsResult<A extends Action> = {
  stateValues: PlayerValues;
  actionToStatistics: Map<A, ActionStatistics>;
};

/**
 * Agent that supports batch inference within a single episode
 */
export class MctsAgent2<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements Agent<C, S, A>
{
  readonly batchingModel: BatchingModel<C, S, A>;
  readonly context: MctsContext<C, S, A>;
  constructor(
    game: Game<C, S, A>,
    model: InferenceModel<C, S, A>,
    config: MctsConfig<C, S, A>,
    readonly batchSize: number,
    stats: MctsStats
  ) {
    this.batchingModel = new BatchingModel(model);
    this.context = {
      config: config,
      game: game,
      model: this.batchingModel,
      stats: stats,
    };
  }
  /**
   * Performs MCTS starting from {@link snapshot} and returns a map from
   * valid action to expected values for all players
   */
  async mcts(
    snapshot: EpisodeSnapshot<C, S>,
    abortController?: AbortController
  ): Promise<MctsResult<A>> {
    const root = new NonTerminalStateNode(this.context, snapshot);
    const visitResults = new Array<Promise<unknown>>();
    visitResults.push(root.inference);

    // When root has exactly one child, visit it once to populate the
    // action statistics, but no further visits are necessary.
    const simulationCount =
      root.actionToChild.count() == 1 ? 1 : this.context.config.simulationCount;

    let batchStart = performance.now();
    // Start the visit index at 1 to account for the initial root node inference
    for (const _ of Range(1, simulationCount)) {
      visitResults.push(root.visit(0, false));
      if (this.batchingModel.requests.length >= this.batchSize) {
        this.batchingModel.fulfillRequests();
        await throwFirstRejection(visitResults);
        if (abortController?.signal?.aborted) {
          throw new Error("Canceled");
        }
        console.log(
          `Completed batch of ${visitResults.length} inferences in ${
            performance.now() - batchStart
          } ms`
        );
        batchStart = performance.now();
        visitResults.length = 0;
      }
    }

    // Final batch
    if (visitResults.length > 0) {
      this.batchingModel.fulfillRequests();
      await throwFirstRejection(visitResults);
      if (abortController?.signal?.aborted) {
        throw new Error("Canceled");
      }
      console.log(
        `Completed batch of ${visitResults.length} inferences in ${
          performance.now() - batchStart
        } ms`
      );
    }

    const actionToStatistics = root.actionToChild.map((node) => {
      const values = new PlayerValues(
        node.playerExpectedValues.playerIdToValue
      );
      return new ActionStatistics(
        node.priorProbability,
        node.priorLogit,
        node.visitCount,
        values
      );
    });

    return {
      stateValues: (await root.inference).value,
      actionToStatistics: actionToStatistics,
    };
  }

  greedyAction(
    snapshot: EpisodeSnapshot<C, S>,
    actionToStatistics: Map<A, ActionStatistics>
  ): A {
    const currentPlayer = requireDefined(
      this.context.game.currentPlayer(snapshot)
    );
    let selectedAction: A;
    // If any chldren have expected values, choose the child with the greatest
    // expected value. Otherwise we'll use priors.
    if (
      actionToStatistics
        .valueSeq()
        .find((it) =>
          it.expectedValues.playerIdToValue.has(currentPlayer.id)
        ) != undefined
    ) {
      [selectedAction] = requireDefined(
        actionToStatistics
          .entrySeq()
          .max(
            ([, values1], [, values2]) =>
              (values1.expectedValues.playerIdToValue.get(currentPlayer.id) ??
                0) -
              (values2.expectedValues.playerIdToValue.get(currentPlayer.id) ??
                0)
          )
      );
    } else {
      [selectedAction] = requireDefined(
        actionToStatistics
          .entrySeq()
          .max(
            ([, values1], [, values2]) =>
              values1.priorProbability - values2.priorProbability
          )
      );
    }
    return selectedAction;
  }

  async act(snapshot: EpisodeSnapshot<C, S>): Promise<A> {
    const mctsResult = await this.mcts(snapshot);
    return this.greedyAction(snapshot, mctsResult.actionToStatistics);
  }
}
