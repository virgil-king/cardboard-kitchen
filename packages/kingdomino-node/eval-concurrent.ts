import { List, Map, Range, Seq } from "immutable";
import {
  Action,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  Player,
  Players,
} from "game";

import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoInferenceModel,
  KingdominoState,
} from "kingdomino";
import {
  driveAsyncGenerators,
  driveGenerators,
  requireDefined,
} from "studio-util";
import _ from "lodash";
import { InferenceModel, InferenceResult, mcts } from "mcts";
import {
  EVAL_RANDOM_PLAYOUT_MCTS_CONFIG,
  EVAL_MODEL_VALUE_CONFIG as EVAL_MODEL_VALUE_CONFIG,
} from "./config.js";
import { NeutralKingdominoModel } from "./neutral-model.js";
import { EpisodeTrainingData, StateSearchData } from "training-data";

// This file provides functionality for playing model evaluation episodes
// using batch MCTS

// Agents:
// 1. Policy + value
// 2. Policy + random playout
// 3. Neutral policy + value
// 4. Neutral policy + random playout

const modelPolicyModelValue = new Player(
  "model-policy-model-value",
  "model-policy-model-value"
);
const modelPolicyRandomPlayout = new Player(
  "model-policy-random-playout",
  "model-policy-random-playout"
);
const neutralPolicyModelValue = new Player(
  "neutral-policy-model-value",
  "neutral-policy-model-value"
);
const neutralPolicyRandomPlayout = new Player(
  "neutral-policy-random-playout",
  "neutral-policy-random-playout"
);

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

/**
 * Eval result for one agent
 */
export type AgentResult = {
  /** The sum of the values of the players that used the agent */
  value: number;
  /** The total amount of thinking time used by the agent */
  timeMs: number;
};

export type EvalResult<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> = {
  episodeTrainingData: ReadonlyArray<EpisodeTrainingData<C, S, A>>;
  agentIdToResult: Map<string, AgentResult>;
};

/**
 * InferenceModel wrapper that neutralizes the policy of the delegate
 * but retains its value function
 */
class NeutralPolicyInferenceModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements InferenceModel<C, S, A>
{
  constructor(readonly delegate: InferenceModel<C, S, A>) {}
  async infer(
    snapshots: readonly EpisodeSnapshot<C, S>[]
  ): Promise<readonly InferenceResult<A>[]> {
    const results = await this.delegate.infer(snapshots);
    return results.map((result) => {
      const policySize = result.policyLogits.count();
      const policyValue = 1 / policySize;
      const policy = result.policyLogits.map(() => policyValue);
      return {
        value: result.value,
        policyLogits: policy,
      } satisfies InferenceResult<A>;
    });
  }
}

/**
 * Performs `episodeCount` eval episodes with four players.
 *
 * Subject players use `model`.
 *
 * Baseline players use a neutral model.
 *
 * Both players use `simulationCount` simulations per action.
 *
 * @return total points for subject and baseline players. The best possible ratio is 5:1.
 */
// TODO save episodes for inspection using the same encoding as self-play episodes
export async function evalEpisodeBatch(
  model: KingdominoInferenceModel,
  episodeCount: number
): Promise<
  EvalResult<KingdominoConfiguration, KingdominoState, KingdominoAction>
> {
  const modelPolicyModelValueAgent = new MctsBatchAgent(
    model,
    EVAL_MODEL_VALUE_CONFIG
  );
  const modelPolicyRandomPlayoutAgent = new MctsBatchAgent(
    model,
    EVAL_RANDOM_PLAYOUT_MCTS_CONFIG
  );
  const neutralPolicyModelValueAgent = new MctsBatchAgent(
    new NeutralPolicyInferenceModel(model),
    EVAL_MODEL_VALUE_CONFIG
  );
  const neutralPolicyRandomPlayoutAgent = new MctsBatchAgent(
    new NeutralKingdominoModel(),
    EVAL_RANDOM_PLAYOUT_MCTS_CONFIG
  );
  const agentIdToAgent = Map<string, MctsBatchAgent>([
    ["model-policy-model-value", modelPolicyModelValueAgent],
    ["model-policy-random-playout", modelPolicyRandomPlayoutAgent],
    ["neutral-policy-model-value", neutralPolicyModelValueAgent],
    ["neutral-policy-random-playout", neutralPolicyRandomPlayoutAgent],
  ]);

  const playerIdToAgentId = Map([
    [modelPolicyModelValue.id, "model-policy-model-value"],
    [modelPolicyRandomPlayout.id, "model-policy-random-playout"],
    [neutralPolicyModelValue.id, "neutral-policy-model-value"],
    [neutralPolicyRandomPlayout.id, "neutral-policy-random-playout"],
  ]);

  const players = [
    modelPolicyModelValue,
    modelPolicyRandomPlayout,
    neutralPolicyModelValue,
    neutralPolicyRandomPlayout,
  ];

  const generators = Range(0, episodeCount)
    .map(() => {
      const shuffledPlayers = _.shuffle(players);
      const episodeConfig = new EpisodeConfiguration(
        new Players(...shuffledPlayers)
      );
      return episode(Kingdomino.INSTANCE, episodeConfig);
    })
    .toArray();

  const agentIdToResult = Map(
    players
      .map((player) => player.id)
      .map((playerId) => [
        playerId,
        { value: 0, timeMs: 0 } satisfies AgentResult,
      ])
  );

  const start = performance.now();
  const episodeData = await driveGenerators(generators, async (snapshots) => {
    const agentIdToRequests = List(snapshots)
      .map((snapshot, index) => {
        return { requestIndex: index, snapshot: snapshot };
      })
      .groupBy((request) => {
        const currentPlayerId = requireDefined(
          Kingdomino.INSTANCE.currentPlayer(request.snapshot)
        ).id;
        return requireDefined(playerIdToAgentId.get(currentPlayerId));
      });
    const agentIdToResponses = agentIdToRequests.map(
      async (requests, agentId) => {
        const actStart = performance.now();
        const result = await requireDefined(agentIdToAgent.get(agentId)).act(
          requests.map((request) => request.snapshot).toArray()
        );
        const elapsedMs = performance.now() - actStart;
        requireDefined(agentIdToResult.get(agentId)).timeMs += elapsedMs;
        return result;
      }
    );
    const mctsResults = new Array<
      MctsResult<KingdominoState, KingdominoAction>
    >(snapshots.length);
    for (const [agentId, requests] of agentIdToRequests) {
      const responses = await requireDefined(agentIdToResponses.get(agentId));
      for (const [agentRequestIndex, request] of requests.entries()) {
        const mctsResult = responses[agentRequestIndex];
        mctsResults[request.requestIndex] = mctsResult;
      }
    }
    return mctsResults;
  });
  const elapsed = performance.now() - start;
  console.log(
    `Completed ${episodeCount} episodes in ${decimalFormat.format(
      elapsed
    )} ms (${decimalFormat.format(elapsed / episodeCount)} per episode)`
  );

  for (const episodeTrainingData of episodeData) {
    console.log(
      `Scores: ${JSON.stringify(
        episodeTrainingData.terminalState.props.playerIdToState
          .valueSeq()
          .map((state) => state.score)
          .sort()
          .toArray()
          .reverse()
      )}`
    );
    for (const player of episodeTrainingData.episodeConfig.players.players) {
      const value = requireDefined(
        episodeTrainingData.terminalValues.playerIdToValue.get(player.id)
      );
      const agentId = requireDefined(playerIdToAgentId.get(player.id));
      requireDefined(agentIdToResult.get(agentId)).value += value;
    }
  }

  return {
    episodeTrainingData: episodeData,
    agentIdToResult: agentIdToResult,
  };
}

type MctsResult<S extends GameState, A extends Action> = {
  action: A;
  searchData: StateSearchData<S, A>;
};

class MctsBatchAgent {
  constructor(
    readonly model: InferenceModel<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >,
    readonly mctsConfig: mcts.MctsConfig<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >
  ) {}
  async act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): Promise<ReadonlyArray<MctsResult<KingdominoState, KingdominoAction>>> {
    const generators = snapshots.map((snapshot) => {
      return selectAction(
        Kingdomino.INSTANCE,
        this.model,
        snapshot,
        this.mctsConfig
      );
    });
    return driveAsyncGenerators(generators, (snapshots) => {
      return this.model.infer(snapshots);
    });
  }
}

/**
 * Performs MCTS iterations as configured by {@link mctsConfig}, yielding
 * snapshots for inference and receiving inference results.
 *
 * @returns the greedily selected best action according to the MCTS results
 */
async function* selectAction<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  model: InferenceModel<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>,
  mctsConfig: mcts.MctsConfig<C, S, A>
): AsyncGenerator<EpisodeSnapshot<C, S>, MctsResult<S, A>, InferenceResult<A>> {
  const mctsContext: mcts.MctsContext<C, S, A> = {
    config: mctsConfig,
    game: game,
    model: model,
    stats: new mcts.MctsStats(),
  };
  const inferenceResult = yield snapshot;
  const root = new mcts.NonTerminalStateNode(
    mctsContext,
    snapshot,
    inferenceResult
  );
  const currentPlayer = requireDefined(game.currentPlayer(snapshot));
  // Run simulationCount steps or enough to try every possible action once
  let selectedAction: A;
  if (root.actionToChild.size == 1) {
    // When root has exactly one child, visit it once to populate the
    // action statistics, but no further visits are necessary
    yield* root.visit();
    selectedAction = requireDefined(root.actionToChild.keys().next().value);
  } else {
    for (const _ of Range(0, mctsContext.config.simulationCount)) {
      yield* root.visit();
    }
    // Greedily select action with greatest expected value
    [selectedAction] = requireDefined(
      Seq(root.actionToChild.entries()).maxBy(
        ([, actionNode]) =>
          actionNode.playerExpectedValues.playerIdToValue.get(
            currentPlayer.id
          ) ?? 0
      )
    );
  }
  return { action: selectedAction, searchData: root.stateSearchData() };
}

/**
 * Runs an episode to completion using a generator, yielding states,
 * receiving {@link MctsResult}, and returning {@link EpisodeTrainingData}.
 *
 * The purpose of this pattern is to allow multiple episodes to run
 * concurrently using batch inference to select next moves.
 */
function* episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  episodeConfig: EpisodeConfiguration
): Generator<
  EpisodeSnapshot<C, S>,
  EpisodeTrainingData<C, S, A>,
  MctsResult<S, A>
> {
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  while (game.result(snapshot) == undefined) {
    const mctsResult = yield snapshot;
    const [newState] = game.apply(snapshot, mctsResult.action);
    snapshot = snapshot.derive(newState);
    nonTerminalStates.push(mctsResult.searchData);
  }
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    nonTerminalStates,
    snapshot.state,
    requireDefined(game.result(snapshot))
  );
}
