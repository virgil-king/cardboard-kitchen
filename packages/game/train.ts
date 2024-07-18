import {
  SettablePromise,
  decodeOrThrow,
  drawN,
  requireDefined,
  sleep,
} from "studio-util";
import {
  Action,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  JsonSerializable,
  PlayerValues,
  episodeConfigurationJson,
  playerValuesJson,
} from "./game.js";
import {
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts.js";
import { Map, Range, Seq } from "immutable";
import {
  InferenceModel,
  TrainingModel,
  StateTrainingData,
  Model,
} from "./model.js";
import { EpisodeBuffer, ReadonlyArrayLike } from "./episodebuffer.js";
import * as io from "io-ts";
import * as os from "os";
import * as worker_threads from "node:worker_threads";
import * as fs from "node:fs";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

/**
 * @param batchSize number of state samples to use per batch
 */
// export async function train<
//   C extends GameConfiguration,
//   S extends GameState,
//   A extends Action
// >(
//   game: Game<C, S, A>,
//   inferenceModel: InferenceModel<C, S, A>,
//   trainingModel: TrainingModel<C, S, A>,
//   episodeConfig: EpisodeConfiguration,
//   mctsConfig: MctsConfig<C, S, A>,
//   batchSize: number,
//   batchCount: number,
//   sampleBufferSize: number
// ) {
//   const context = {
//     config: mctsConfig,
//     game: game,
//     model: inferenceModel,
//     stats: new MctsStats(),
//   };
//   let selfPlayDurationMs = 0;
//   let trainingDurationMs = 0;
//   let episodeCount = 0;
//   const buffer = new EpisodeBuffer<
//     StateTrainingData<C, S, A>,
//     EpisodeTrainingData<C, S, A>
//   >(sampleBufferSize);
//   // const perf = Performance.new();
//   for (let i = 0; i < batchCount; i++) {
//     const selfPlayStartMs = performance.now();
//     // let samples = new Array<StateTrainingData<C, S, A>>();
//     do {
//       const episodeTrainingData = episode(context, episodeConfig);
//       episodeCount++;
//       buffer.addEpisode(episodeTrainingData);
//     } while (buffer.sampleCount() < batchSize);
//     console.log(`Filled next batch`);
//     const now = performance.now();
//     selfPlayDurationMs += now - selfPlayStartMs;
//     const trainingStartMs = now;
//     const batch = buffer.sample(batchSize);
//     await trainingModel.train(batch);
//     trainingDurationMs += performance.now() - trainingStartMs;
//     const totalDurationMs = selfPlayDurationMs + trainingDurationMs;
//     console.log(
//       `Self play time ${Math.round(
//         selfPlayDurationMs
//       )} ms (${decimalFormat.format(
//         (selfPlayDurationMs * 100) / totalDurationMs
//       )}% of total); ${decimalFormat.format(
//         selfPlayDurationMs / episodeCount
//       )} ms per episode`
//     );
//     console.log(
//       `Training time ${Math.round(
//         trainingDurationMs
//       )} ms (${decimalFormat.format(
//         (trainingDurationMs * 100) / totalDurationMs
//       )}% of total)`
//     );
//     console.log(
//       `Inference time ${Math.round(
//         context.stats.inferenceTimeMs
//       )} ms (${decimalFormat.format(
//         (context.stats.inferenceTimeMs * 100) / selfPlayDurationMs
//       )}% of self play time)`
//     );
//   }
// }

/**
 * @param batchSize number of state samples to use per batch
 */
export async function train_parallel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  model: Model<C, S, A>,
  batchSize: number,
  // batchCount: number,
  sampleBufferSize: number,
  workerScript: string,
  modelsPath: string
) {
  const trainingModel = model.trainingModel(batchSize);
  const modelArtifacts = await model.toJson();

  const buffer = new EpisodeBuffer<
    StateTrainingData<C, S, A>,
    EpisodeTrainingData<C, S, A>
  >(sampleBufferSize);

  // let resolve: (() => void) | undefined = undefined;
  // const bufferReady = new Promise<void>((r) => (resolve = r));
  const bufferReady = new SettablePromise<undefined>();
  let episodesReceived = 0;

  function receiveEpisode(message: any) {
    // console.log(`Encoded episode training data message is ${JSON.stringify(message)}`);
    // console.log(`Encoded episode training data is ${message.data}`);
    const decoded = EpisodeTrainingData.decode(game, message);
    buffer.addEpisode(decoded);
    console.log(`Received episode`);
    episodesReceived++;
    if (buffer.sampleCount() >= batchSize) {
      // requireDefined(resolve)();
      bufferReady.fulfill(undefined);
    }
  }

  const workerCount = os.cpus().length - 2;
  const workers = new Array<worker_threads.Worker>();
  const workerPorts = new Array<worker_threads.MessagePort>();
  for (let i = 0; i < workerCount; i++) {
    const channel = new worker_threads.MessageChannel();
    channel.port1.on("message", receiveEpisode);
    const worker = new worker_threads.Worker(workerScript, {
      workerData: channel.port2,
      transferList: [channel.port2],
    });
    channel.port1.postMessage(modelArtifacts);
    workers.push(worker);
    workerPorts.push(channel.port1);
  }
  console.log(`Spawned ${workerCount} self play workers`);

  await bufferReady.promise;

  // for (let i = 0; i < batchCount; i++) {
  let episodesBetweenModelUpdates = workerCount * 2;
  let episodesReceivedAtLastModelUpdate = 0;
  let lastSaveTime = performance.now();
  while (true) {
    const batch = buffer.sample(batchSize);
    await trainingModel.train(batch);
    await sleep(0);
    if (
      episodesReceived - episodesReceivedAtLastModelUpdate >
      episodesBetweenModelUpdates
    ) {
      console.log(
        `Broadcasting updated model after ${episodesReceived} total episodes`
      );
      episodesReceivedAtLastModelUpdate = episodesReceived;
      const modelArtifacts = await model.toJson();
      for (const port of workerPorts) {
        port.postMessage(modelArtifacts);
      }
    }
    const now = performance.now();
    const timeSinceLastSave = now - lastSaveTime;
    if (timeSinceLastSave > 5 * 60 * 1_000) {
      const path = `${modelsPath}/${new Date().toISOString()}`;
      fs.mkdirSync(path, { recursive: true });
      model.save(path);
      lastSaveTime = now;
      console.log(
        `Saved model after ${decimalFormat.format(timeSinceLastSave)} ms`
      );
    }
  }
}

export class ActionStatistics {
  constructor(
    /** Predicted probability that the current player would select this action */
    readonly prior: number,
    /** Number of times the action was visited by MCTS */
    readonly visitCount: number,
    /** Player values assigned by MCTS for the action */
    readonly expectedValues: PlayerValues
  ) { }
  toJson(): EncodedActionStatistics {
    return { prior: this.prior, visitCount: this.visitCount, expectedValues: this.expectedValues.toJson() };
  }
  static decode(encoded: any): ActionStatistics {
    const decoded = decodeOrThrow(actionStatisticsJson, encoded);
    return new ActionStatistics(decoded.prior, decoded.visitCount, PlayerValues.decode(decoded.expectedValues));
  }
}

const actionStatisticsJson = io.type({ prior: io.number, visitCount: io.number, expectedValues: playerValuesJson });
type EncodedActionStatistics = io.TypeOf<typeof actionStatisticsJson>;

const stateSearchDataJson = io.type({
  state: io.any,
  predictedValues: playerValuesJson,
  actionToStatistics: io.array(io.tuple([io.any, actionStatisticsJson])),
});

type EncodedStateSearchData = io.TypeOf<typeof stateSearchDataJson>;

export class StateSearchData<S extends GameState, A extends Action>
  implements JsonSerializable {
  constructor(
    readonly state: S,
    /** Model-predicted values for this state, for diagnostic purposes only */
    readonly predictedValues: PlayerValues,
    readonly actionToStatistics: Map<A, ActionStatistics>) { }
  toJson(): EncodedStateSearchData {
    return {
      state: this.state.toJson(),
      predictedValues: this.predictedValues.toJson(),
      actionToStatistics: this.actionToStatistics
        .entrySeq()
        .map<[any, EncodedActionStatistics]>(([action, value]) => [action.toJson(), value.toJson()])
        .toArray(),
    };
  }
  static decode<S extends GameState, A extends Action>(
    game: Game<GameConfiguration, S, A>,
    encoded: EncodedStateSearchData
  ): StateSearchData<S, A> {
    const decoded = decodeOrThrow(stateSearchDataJson, encoded);
    return new StateSearchData(
      game.decodeState(decoded.state),
      PlayerValues.decode(decoded.predictedValues),
      Map(
        decoded.actionToStatistics.map(([encodedAction, encodedValue]) => [
          game.decodeAction(encodedAction),
          ActionStatistics.decode(encodedValue),
        ])
      )
    );
  }
}

const episodeTrainingDataJson = io.type({
  episodeConfig: episodeConfigurationJson,
  gameConfig: io.any,
  dataPoints: io.array(stateSearchDataJson),
  terminalState: io.any,
  terminalValues: playerValuesJson,
});

type EncodedEpisodeTrainingData = io.TypeOf<typeof episodeTrainingDataJson>;

export class EpisodeTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements JsonSerializable, ReadonlyArrayLike<StateTrainingData<C, S, A>> {
  constructor(
    readonly episodeConfig: EpisodeConfiguration,
    readonly gameConfig: C,
    readonly dataPoints: Array<StateSearchData<S, A>>,
    /** Terminal state, for diagnostic purposes only */
    readonly terminalState: S,
    /** Terminal values, for diagnostic purposes only */
    readonly terminalValues: PlayerValues,
  ) { }

  count(): number {
    return this.dataPoints.length;
  }

  get(index: number): StateTrainingData<C, S, A> {
    return new StateTrainingData(
      new EpisodeSnapshot(
        this.episodeConfig,
        this.gameConfig,
        this.dataPoints[index].state
      ),
      this.dataPoints[index].actionToStatistics,
      this.terminalValues
    );
  }

  stateTrainingDataArray(): Array<StateTrainingData<C, S, A>> {
    const result = new Array<StateTrainingData<C, S, A>>();
    for (let i = 0; i < this.count(); i++) {
      result.push(this.get(i));
    }
    return result;
  }

  toJson(): EncodedEpisodeTrainingData {
    return {
      episodeConfig: this.episodeConfig.toJson(),
      gameConfig: this.gameConfig.toJson(),
      terminalValues: this.terminalValues.toJson(),
      dataPoints: this.dataPoints.map((it) => it.toJson()),
      terminalState: this.terminalState.toJson()
    };
  }

  static decode<
    C extends GameConfiguration,
    S extends GameState,
    A extends Action
  >(game: Game<C, S, A>, encoded: any): EpisodeTrainingData<C, S, A> {
    const decoded = decodeOrThrow(episodeTrainingDataJson, encoded);
    return new EpisodeTrainingData(
      EpisodeConfiguration.decode(decoded.episodeConfig),
      game.decodeConfiguration(decoded.gameConfig),
      decoded.dataPoints.map((it) => StateSearchData.decode(game, it)),
      game.decodeState(decoded.terminalState),
      PlayerValues.decode(decoded.terminalValues),
    );
  }
}

/**
 * Runs a new episode to completion and returns training data for each state in
 * the episode
 */
export function episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  playerIdToMctsContext: Map<string, MctsContext<C, S, A>>,
  episodeConfig: EpisodeConfiguration
): EpisodeTrainingData<C, S, A> {
  const startMs = performance.now();
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  function mctsContext(): MctsContext<C, S, A> {
    const player = requireDefined(game.currentPlayer(snapshot));
    return requireDefined(playerIdToMctsContext.get(player.id));
  }
  let currentMctsContext = mctsContext();
  let root = new NonTerminalStateNode(currentMctsContext, snapshot);
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  while (game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(game.currentPlayer(snapshot));
    // Run simulationCount steps or enough to try every possible action once
    for (let i of Range(
      0,
      Math.max(
        currentMctsContext.config.simulationCount,
        root.actionToChild.size
      )
    )) {
      root.visit();
    }
    // TODO incorporate noise
    // TODO choose proportionally rather than greedily during training
    const [actionWithGreatestExpectedValue] = requireDefined(
      Seq(root.actionToChild.entries()).max(
        ([, actionNode1], [, actionNode2]) =>
          actionNode1.requirePlayerValue(currentPlayer) -
          actionNode2.requirePlayerValue(currentPlayer)
      )
    );
    const stateSearchData = new StateSearchData(
      snapshot.state,
      root.inferenceResult.value,
      Map(
        Seq(root.actionToChild.entries()).map(([action, child]) => [
          action,
          new ActionStatistics(child.prior, child.visitCount, new PlayerValues(child.playerExpectedValues.playerIdToValue)),
        ])
      )
    );
    nonTerminalStates.push(stateSearchData);
    const [newState,] = game.apply(
      snapshot,
      actionWithGreatestExpectedValue
    );
    snapshot = snapshot.derive(newState);
    if (game.result(snapshot) != undefined) {
      break;
    }
    currentMctsContext = mctsContext();

    // Reuse the node for newState from the previous search tree if it exists.
    // It might not exist if there was non-determinism in the application of the
    // latest action.
    // const existingStateNode = root.actionToChild
    //   .get(actionWithGreatestExpectedValue)
    //   ?.chanceKeyToChild.get(chanceKey);
    // if (existingStateNode != undefined) {
    //   if (!(existingStateNode instanceof NonTerminalStateNode)) {
    //     throw new Error(
    //       `Node for non-terminal state was not NonTerminalStateNode`
    //     );
    //   }
    //   if (existingStateNode.context == currentMctsContext) {
    //     root = existingStateNode;
    //   } else {
    //     console.log(
    //       "Ignoring current child node because it has a different current player"
    //     );
    //     root = new NonTerminalStateNode(currentMctsContext, snapshot);
    //   }
    // } else {
    //   root = new NonTerminalStateNode(currentMctsContext, snapshot);
    // }

    root = new NonTerminalStateNode(currentMctsContext, snapshot);

    // console.log(`New root node has ${root.visitCount} visits`);
  }
  const elapsedMs = performance.now() - startMs;
  console.log(
    `Completed episode; elapsed time ${decimalFormat.format(elapsedMs)} ms`
  );
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    nonTerminalStates,
    snapshot.state,
    requireDefined(game.result(snapshot)),
  );
}
