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
import {
  InferenceModel,
  InferenceResult,
  mcts,
} from "mcts";
import {
  EVAL_RANDOM_PLAYOUT_MCTS_CONFIG,
  EVAL_MODEL_VALUE_CONFIG as EVAL_MODEL_VALUE_CONFIG,
} from "./config.js";
import { NeutralKingdominoModel } from "./neutral-model.js";

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

export type AgentResult = {
  value: number;
  timeMs: number;
};

export type EvalResult = {
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
  infer(
    snapshots: readonly EpisodeSnapshot<C, S>[]
  ): Promise<readonly InferenceResult<A>[]> {
    return this.delegate.infer(snapshots).then((results) => {
      return results.map((result) => {
        const policySize = result.policy.count();
        const policyValue = 1 / policySize;
        const policy = result.policy.map(() => policyValue);
        return {
          value: result.value,
          policy: policy,
        } satisfies InferenceResult<A>;
      });
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
): Promise<EvalResult> {
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
  const agentIdToAgent = Map<string, BatchAgent>([
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
  const terminalSnapshots = await driveGenerators(
    generators,
    async (snapshots) => {
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
      const actions = new Array<KingdominoAction>(snapshots.length);
      for (const [agentId, requests] of agentIdToRequests) {
        const responses = await requireDefined(agentIdToResponses.get(agentId));
        for (const [agentRequestIndex, request] of requests.entries()) {
          const response = responses[agentRequestIndex];
          actions[request.requestIndex] = response;
        }
      }
      return actions;
    }
  );
  const elapsed = performance.now() - start;
  console.log(
    `Completed ${episodeCount} episodes in ${decimalFormat.format(
      elapsed
    )} ms (${decimalFormat.format(elapsed / episodeCount)} per episode)`
  );

  const result = {
    agentIdToResult: agentIdToResult,
  } satisfies EvalResult;

  for (const snapshot of terminalSnapshots) {
    const episodeResult = requireDefined(Kingdomino.INSTANCE.result(snapshot));
    for (const player of snapshot.episodeConfiguration.players.players) {
      const value = requireDefined(
        episodeResult.playerIdToValue.get(player.id)
      );
      const agentId = requireDefined(playerIdToAgentId.get(player.id));
      requireDefined(agentIdToResult.get(agentId)).value += value;
    }
  }

  return result;
}

interface BatchAgent {
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): Promise<ReadonlyArray<KingdominoAction>>;
}

class MctsBatchAgent implements BatchAgent {
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
  ): Promise<ReadonlyArray<KingdominoAction>> {
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
): AsyncGenerator<EpisodeSnapshot<C, S>, A, InferenceResult<A>> {
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
  if (root.actionToChild.size == 1) {
    // When root has exactly one child, visit it once to populate the
    // action statistics, but no further visits are necessary
    yield* root.visit();
    return requireDefined(root.actionToChild.keys().next().value);
  } else {
    for (const _ of Range(
      0,
      Math.max(mctsContext.config.simulationCount, root.actionToChild.size)
    )) {
      yield* root.visit(true);
    }
    // Greedily select action with greatest expected value
    const [selectedAction] = requireDefined(
      Seq(root.actionToChild.entries()).maxBy(([, actionNode]) =>
        actionNode.requirePlayerValue(currentPlayer)
      )
    );
    return selectedAction;
  }
}

/**
 * Runs an episode to completion using a generator, yielding states and
 * receiving actions.
 *
 * The purpose of this pattern is to allow multiple episodes to run
 * concurrently using batch inference to select next moves.
 *
 * This function does not record search data for training.
 */
function* episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  episodeConfig: EpisodeConfiguration
): Generator<EpisodeSnapshot<C, S>, EpisodeSnapshot<C, S>, A> {
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  while (game.result(snapshot) == undefined) {
    const action = yield snapshot;
    // Ignore chance keys since we're not building a state search tree in
    // this case
    const [newState] = game.apply(snapshot, action);
    snapshot = snapshot.derive(newState);
  }
  return snapshot;
}
