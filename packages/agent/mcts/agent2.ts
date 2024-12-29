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
import { Map, Range } from "immutable";
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
    // action statistics, but no further visits are necessary. Otherwise
    // visit the configured number of times or at least enough times to
    // visit each child node at least once.
    const simulationCount =
      root.actionToChild.count() == 1
        ? 1
        : Math.max(
            this.context.config.simulationCount,
            root.actionToChild.size
          );

    let batchStart = performance.now();
    for (let _ of Range(0, simulationCount)) {
      visitResults.push(root.visit(true));
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

    console.log(`MCTS stats: ${JSON.stringify(this.context.stats)}`);

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
    const [selectedAction] = requireDefined(
      actionToStatistics
        .entrySeq()
        .max(
          ([, values1], [, values2]) =>
            requireDefined(
              values1.expectedValues.playerIdToValue.get(currentPlayer.id)
            ) -
            requireDefined(
              values2.expectedValues.playerIdToValue.get(currentPlayer.id)
            )
        )
    );
    return selectedAction;
  }

  async act(snapshot: EpisodeSnapshot<C, S>): Promise<A> {
    const mctsResult = await this.mcts(snapshot);
    return this.greedyAction(snapshot, mctsResult.actionToStatistics);
  }
}
