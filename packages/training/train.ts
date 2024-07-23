import {
  SettablePromise,
  decodeOrThrow,
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
} from "game";
import { MctsContext, NonTerminalStateNode } from "./mcts.js";
import { List, Map, Range, Seq } from "immutable";
import { Model } from "./model.js";
import { EpisodeBuffer } from "./episodebuffer.js";
import * as io from "io-ts";
import * as os from "os";
import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import {
  ActionStatistics,
  EpisodeTrainingData,
  StateSearchData,
  StateTrainingData,
} from "training-data";

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
  modelsPath: string,
  episodesDir?: string
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

  let initialEpisodeCount = 0;
  if (episodesDir != undefined) {
    for (const encodedEpisode of loadEpisodes(episodesDir)) {
      receiveEpisode(encodedEpisode);
      initialEpisodeCount++;
      if (buffer.sampleCount() >= sampleBufferSize) {
        console.log(`Loaded ${initialEpisodeCount} episodes`);
        break;
      }
      // const beforeSize = buffer.sampleCount();
      // buffer.addEpisode(episode);
      // episodeCount++;
      // const afterSize = buffer.sampleCount();
      // if (afterSize <= beforeSize) {
      //   console.log(`Loaded ${episodeCount} episodes`);
      //   break;
      // }
    }
  }

  await bufferReady.promise;

  // for (let i = 0; i < batchCount; i++) {
  let episodesBetweenModelUpdates = workerCount * 2;
  let episodesReceivedAtLastModelUpdate = initialEpisodeCount;
  let lastSaveTime = performance.now();
  let trailingLosses = List<number>();
  while (true) {
    const batch = buffer.sample(batchSize);
    const loss = await trainingModel.train(batch);
    trailingLosses = trailingLosses.push(loss);
    if (trailingLosses.count() > 100) {
      trailingLosses = trailingLosses.shift();
    }
    const trailingLoss =
      trailingLosses.reduce((reduction, next) => reduction + next, 0) /
      trailingLosses.count();
    console.log(`Sliding window loss: ${trailingLoss}`);
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
    if (timeSinceLastSave > 60 * 60 * 1_000) {
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

function* loadEpisodes<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  // game: Game<C, S, A>,
  episodesDir: string
  // buffer: EpisodeBuffer<
  //   StateTrainingData<C, S, A>,
  //   EpisodeTrainingData<C, S, A>
  // >
): Generator<any> {
  const files = fs.readdirSync(episodesDir);
  let filenameToModeTime = Map<string, number>();
  for (const filename of files) {
    const stat = fs.statSync(episodesDir + "/" + filename);
    filenameToModeTime = filenameToModeTime.set(filename, stat.mtimeMs);
  }
  const filesByDescendingModTime = files.sort(
    (a, b) =>
      requireDefined(filenameToModeTime.get(b)) -
      requireDefined(filenameToModeTime.get(a))
  );
  let episodeCount = 0;
  for (const filename of filesByDescendingModTime) {
    const path = episodesDir + "/" + filename;
    console.log(`Loading episode ${path}`);
    const episodeString = fs.readFileSync(path, {
      encoding: "utf8",
    });
    const episodeJson = JSON.parse(episodeString);
    // const episode = EpisodeTrainingData.decode(game, episodeJson);
    yield episodeJson;
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
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      root.visit();
      selectedAction = root.actionToChild.keys().next().value;
    } else {
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
      [selectedAction] = requireDefined(
        Seq(root.actionToChild.entries()).max(
          ([, actionNode1], [, actionNode2]) =>
            actionNode1.requirePlayerValue(currentPlayer) -
            actionNode2.requirePlayerValue(currentPlayer)
        )
      );
    }
    const stateSearchData = new StateSearchData(
      snapshot.state,
      root.inferenceResult.value,
      Map(
        Seq(root.actionToChild.entries()).map(([action, child]) => [
          action,
          new ActionStatistics(
            child.prior,
            child.visitCount,
            new PlayerValues(child.playerExpectedValues.playerIdToValue)
          ),
        ])
      )
    );
    nonTerminalStates.push(stateSearchData);
    const [newState] = game.apply(snapshot, requireDefined(selectedAction));
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
    requireDefined(game.result(snapshot))
  );
}
