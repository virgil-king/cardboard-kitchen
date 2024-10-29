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
  InferenceModel,
  InferenceResult,
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
  newestModelPath,
} from "training";

import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { driveGenerators, requireDefined } from "studio-util";

const modelPath = newestModelPath("kingdomino", "conv3");
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = KingdominoConvolutionalModel.load(modelPath);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);

const modelPlayer1 = new Player("model-1", "Model 1");
const modelPlayer2 = new Player("model-2", "Model 2");
const randomPlayer1 = new Player("random-1", "Random 1");
const randomPlayer2 = new Player("random-2", "Random 2");

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

async function main() {
  const randomAgent = new RandomBatchAgent();
  const model1Agent = new MctsBatchAgent((await model).inferenceModel);
  const agentIdToAgent = Map<string, BatchAgent>([
    ["random", randomAgent],
    ["model", model1Agent],
  ]);

  const playerIdToAgentId = Map([
    [modelPlayer1.id, "model"],
    [modelPlayer2.id, "model"],
    [randomPlayer1.id, "random"],
    [randomPlayer2.id, "random"],
  ]);
  const episodeConfig = new EpisodeConfiguration(
    new Players(modelPlayer1, modelPlayer2, randomPlayer1, randomPlayer2)
  );

  let playerIdToValue = Map<string, number>();
  const generators = Range(0, episodeCount)
    .map(() => episode(Kingdomino.INSTANCE, episodeConfig))
    .toArray();

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
      return requireDefined(agentIdToAgent.get(agentId)).act(
        requests.map((request) => request.snapshot).toArray()
      );
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

  for (const snapshot of terminalSnapshots) {
    const result = requireDefined(Kingdomino.INSTANCE.result(snapshot));
    for (const player of episodeConfig.players.players) {
      const value = requireDefined(result.playerIdToValue.get(player.id));
      playerIdToValue = playerIdToValue.set(
        player.id,
        value + playerIdToValue.get(player.id, 0)
      );
    }
  }

  console.log(playerIdToValue.toArray());
}

interface BatchAgent {
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<KingdominoAction>;
}

class MctsBatchAgent implements BatchAgent {
  readonly mctsConfig = new MctsConfig<
    KingdominoConfiguration,
    KingdominoState,
    KingdominoAction
  >({
    simulationCount: 256,
    randomPlayoutConfig: {
      weight: 1,
      agent: new RandomKingdominoAgent(),
    },
  });
  constructor(
    readonly model: InferenceModel<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >
  ) {}
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<KingdominoAction> {
    const generators = snapshots.map((snapshot) => {
      return mcts(
        Kingdomino.INSTANCE,
        this.model,
        snapshot,
        this.mctsConfig
      );
    });
    return driveGenerators(generators, (snapshots) => {
      return this.model.infer(snapshots);
    });
  }
}

class RandomBatchAgent implements BatchAgent {
  nonBatchAgent = new RandomKingdominoAgent();
  act(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<KingdominoAction> {
    return snapshots.map((snapshot) => this.nonBatchAgent.act(snapshot));
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
  A extends Action,
  E
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
    for (const i of Range(
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

main();
