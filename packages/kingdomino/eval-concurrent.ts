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

import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { KingdominoInferenceModel } from "./model.js";
import { driveGenerators, requireDefined } from "studio-util";
import { NeutralKingdominoModel } from "./neutral-model.js";
import { EVAL_BASELINE_MCTS_CONFIG, EVAL_MCTS_CONFIG } from "./config.js";
import _ from "lodash";
import { InferenceModel, InferenceResult, MctsConfig, MctsContext, MctsStats, NonTerminalStateNode } from "mcts";

const subjectPlayer1 = new Player("model-1", "Model 1");
const subjectPlayer2 = new Player("model-2", "Model 2");
const baselinePlayer1 = new Player("baseline-1", "Baseline 1");
const baselinePlayer2 = new Player("baseline-2", "Baseline 2");

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

export type EvalResult = {
  subjectPoints: number;
  subjectTimeMs: number;
  baselinePoints: number;
  baselineTimeMs: number;
};

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
export function evalEpisodeBatch(
  model: KingdominoInferenceModel,
  episodeCount: number
): EvalResult {
  const baselineAgent = new MctsBatchAgent(
    new NeutralKingdominoModel(),
    EVAL_BASELINE_MCTS_CONFIG
  );
  const model1Agent = new MctsBatchAgent(model, EVAL_MCTS_CONFIG);
  const agentIdToAgent = Map<string, BatchAgent>([
    ["baseline", baselineAgent],
    ["model", model1Agent],
  ]);

  const playerIdToAgentId = Map([
    [subjectPlayer1.id, "model"],
    [subjectPlayer2.id, "model"],
    [baselinePlayer1.id, "baseline"],
    [baselinePlayer2.id, "baseline"],
  ]);

  const players = [
    subjectPlayer1,
    subjectPlayer2,
    baselinePlayer1,
    baselinePlayer2,
  ];
  let playerIdToValue = Map<string, number>();
  const generators = Range(0, episodeCount)
    .map(() => {
      const shuffledPlayers = _.shuffle(players);
      const episodeConfig = new EpisodeConfiguration(
        new Players(...shuffledPlayers)
      );
      return episode(Kingdomino.INSTANCE, episodeConfig);
    })
    .toArray();

  let subjectTimeMs = 0;
  let baselineTimeMs = 0;

  const start = performance.now();
  const terminalSnapshots = driveGenerators(generators, (snapshots) => {
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
    const agentIdToResponses = agentIdToRequests.map((requests, agentId) => {
      const actStart = performance.now();
      const result = requireDefined(agentIdToAgent.get(agentId)).act(
        requests.map((request) => request.snapshot).toArray()
      );
      const elapsed = performance.now() - actStart;
      switch (agentId) {
        case "model": {
          subjectTimeMs += elapsed;
          break;
        }
        case "baseline": {
          baselineTimeMs += elapsed;
          break;
        }
        default:
          throw new Error(`Unexpected agent ID ${agentId}`);
      }
      return result;
    });
    const actions = new Array<KingdominoAction>(snapshots.length);
    for (const [agentId, requests] of agentIdToRequests) {
      const responses = requireDefined(agentIdToResponses.get(agentId));
      for (const [agentRequestIndex, request] of requests.entries()) {
        const response = responses[agentRequestIndex];
        actions[request.requestIndex] = response;
      }
    }
    return actions;
  });
  const elapsed = performance.now() - start;
  console.log(
    `Completed ${episodeCount} episodes in ${decimalFormat.format(
      elapsed
    )} ms (${decimalFormat.format(elapsed / episodeCount)} per episode)`
  );

  const result = {
    subjectPoints: 0,
    subjectTimeMs: subjectTimeMs,
    baselinePoints: 0,
    baselineTimeMs: baselineTimeMs,
  } satisfies EvalResult;

  for (const snapshot of terminalSnapshots) {
    const episodeResult = requireDefined(Kingdomino.INSTANCE.result(snapshot));
    for (const player of snapshot.episodeConfiguration.players.players) {
      const value = requireDefined(
        episodeResult.playerIdToValue.get(player.id)
      );
      playerIdToValue = playerIdToValue.set(
        player.id,
        value + playerIdToValue.get(player.id, 0)
      );
      const agentId = playerIdToAgentId.get(player.id);
      switch (agentId) {
        case "model":
          result.subjectPoints += value;
          break;
        case "baseline":
          result.baselinePoints += value;
          break;
        default:
          throw new Error(`Unexpected agent ID ${agentId}`);
      }
    }
  }

  console.log(playerIdToValue.toArray());
  return result;
}

interface BatchAgent {
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<KingdominoAction>;
}

class MctsBatchAgent implements BatchAgent {
  constructor(
    readonly model: InferenceModel<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >,
    readonly mctsConfig: MctsConfig<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    > = new MctsConfig({
      simulationCount: 32,
      randomPlayoutConfig: {
        weight: 1,
        agent: new RandomKingdominoAgent(),
      },
    })
  ) {}
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<KingdominoAction> {
    const generators = snapshots.map((snapshot) => {
      return mcts(Kingdomino.INSTANCE, this.model, snapshot, this.mctsConfig);
    });
    return driveGenerators(generators, (snapshots) => {
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
function* mcts<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  model: InferenceModel<C, S, A>,
  snapshot: EpisodeSnapshot<C, S>,
  mctsConfig: MctsConfig<C, S, A>
): Generator<EpisodeSnapshot<C, S>, A, InferenceResult<A>> {
  const mctsContext: MctsContext<C, S, A> = {
    config: mctsConfig,
    game: game,
    model: model,
    stats: new MctsStats(),
  };
  const inferenceResult = yield snapshot;
  const root = new NonTerminalStateNode(mctsContext, snapshot, inferenceResult);
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
      yield* root.visit();
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
  const startMs = performance.now();
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
  const elapsedMs = performance.now() - startMs;
  console.log(
    `Completed episode; elapsed time ${decimalFormat.format(elapsedMs)} ms`
  );
  return snapshot;
}
