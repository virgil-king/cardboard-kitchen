import {
  SettablePromise,
  proportionalRandom,
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
  PlayerValues,
} from "game";
import { MctsContext, NonTerminalStateNode } from "./mcts.js";
import { List, Map, Range, Seq } from "immutable";
import { InferenceResult, Model } from "./model.js";
import { EpisodeBuffer, SimpleArrayLike } from "./episodebuffer.js";
import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import {
  ActionStatistics,
  EpisodeTrainingData,
  StateSearchData,
  StateTrainingData,
} from "training-data";
import { LogDirectory } from "./logdirectory.js";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const gbBytes = 1024 * 1024 * 1024;
const maxModelBytes = 16 * gbBytes;
const maxEpisodeBytes = 64 * gbBytes;

const textEncoder = new TextEncoder();

/**
 * @param batchSize number of state samples to use per batch
 */
export async function train_parallel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT
>(
  game: Game<C, S, A>,
  model: Model<C, S, A, EncodedSampleT>,
  batchSize: number,
  sampleBufferSize: number,
  workerScript: string,
  modelsDirPath: string,
  episodesDirPath?: string
) {
  const trainingModel = model.trainingModel(batchSize);
  const modelArtifacts = await model.toJson();
  const modelsDir =
    modelsDirPath == undefined
      ? undefined
      : new LogDirectory(modelsDirPath, maxModelBytes);
  const episodesDir =
    episodesDirPath == undefined
      ? undefined
      : new LogDirectory(episodesDirPath, maxEpisodeBytes);

  const buffer = new EpisodeBuffer<
    StateTrainingData<C, S, A>,
    SimpleArrayLike<StateTrainingData<C, S, A>>
  >(sampleBufferSize);

  const bufferReady = new SettablePromise<undefined>();

  function addEpisodeToBuffer(message: any) {
    const decoded = EpisodeTrainingData.decode(game, message);
    const encodedSamples = decoded.stateTrainingDataArray();
    // .map((sample) => trainingModel.encodeSample(sample));
    buffer.addEpisode(new SimpleArrayLike(encodedSamples));
    if (buffer.sampleCount() >= batchSize) {
      bufferReady.fulfill(undefined);
    }
  }

  let initialEpisodeCount = 0;
  if (episodesDirPath != undefined) {
    for (const encodedEpisode of loadEpisodesJson(episodesDirPath)) {
      addEpisodeToBuffer(encodedEpisode);
      initialEpisodeCount++;
      if (buffer.sampleCount() >= sampleBufferSize) {
        break;
      }
    }
    console.log(
      `Loaded ${initialEpisodeCount} episodes; sample buffer size is ${buffer.sampleCount()} with maximum ${sampleBufferSize}`
    );
  }

  let episodesReceived = 0;
  let episodeBatchesReceived = 0;
  const workersStartedMs = performance.now();
  function receiveEpisodeBatch(episodes: Array<any>) {
    for (const episodeJson of episodes) {
      addEpisodeToBuffer(episodeJson);
      if (episodesDir != undefined) {
        episodesDir.writeData(
          textEncoder.encode(JSON.stringify(episodeJson, undefined, 1))
        );
      }
      episodesReceived++;
    }
    episodeBatchesReceived++;
    const sinceWorkersStartedMs = performance.now() - workersStartedMs;
    console.log(
      `Seconds per episode: ${decimalFormat.format(
        sinceWorkersStartedMs / 1_000 / episodesReceived
      )}`
    );
  }

  const workerCount = 16; // os.cpus().length - 2;
  const workers = new Array<worker_threads.Worker>();
  const workerPorts = new Array<worker_threads.MessagePort>();
  for (let i = 0; i < workerCount; i++) {
    const channel = new worker_threads.MessageChannel();
    channel.port1.on("message", receiveEpisodeBatch);
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

  let episodeBatchesBetweenModelUpdates = workerCount;
  let episodeBatchesReceivedAtLastModelUpdate = 0;
  let lastSaveTime = performance.now();
  let trailingLosses = List<number>();
  while (true) {
    const beforeBatch = performance.now();
    const batch = buffer.sample(batchSize).map((sample) => {
      return trainingModel.encodeSample(sample);
    });
    const beforeTrain = performance.now();
    const loss = await trainingModel.train(batch);
    const afterTrain = performance.now();
    const totalBatchTime = afterTrain - beforeBatch;
    console.log(
      `Batch time ${decimalFormat.format(
        (100 * (beforeTrain - beforeBatch)) / totalBatchTime
      )} data prep, ${decimalFormat.format(
        (100 * (afterTrain - beforeTrain)) / totalBatchTime
      )} training`
    );
    trailingLosses = trailingLosses.push(loss);
    if (trailingLosses.count() > 100) {
      trailingLosses = trailingLosses.shift();
    }
    const trailingLoss =
      trailingLosses.reduce((reduction, next) => reduction + next, 0) /
      trailingLosses.count();
    console.log(`Sliding window loss: ${trailingLoss}`);
    console.log(
      `Training step took ${decimalFormat.format(
        performance.now() - beforeBatch
      )} ms`
    );
    await sleep(0);
    const episodeBatchesReceivedSinceLastModelUpdate =
      episodeBatchesReceived - episodeBatchesReceivedAtLastModelUpdate;
    if (
      episodeBatchesReceivedSinceLastModelUpdate >=
      episodeBatchesBetweenModelUpdates
    ) {
      console.log(
        `Broadcasting updated model after ${episodeBatchesReceived} episode batches`
      );
      episodeBatchesReceivedAtLastModelUpdate = episodeBatchesReceived;
      const modelArtifacts = await model.toJson();
      for (const port of workerPorts) {
        port.postMessage(modelArtifacts);
      }
    }
    const now = performance.now();
    const timeSinceLastSave = now - lastSaveTime;
    if (modelsDir != undefined && timeSinceLastSave > 15 * 60 * 1_000) {
      modelsDir.write((path) => {
        fs.mkdirSync(path);
        return model.save(path);
      });
      lastSaveTime = now;
      console.log(
        `Saved model after ${decimalFormat.format(timeSinceLastSave)} ms`
      );
    }
  }
}

function* loadEpisodesJson(episodesDir: string): Generator<any> {
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
  for (const filename of filesByDescendingModTime) {
    const path = episodesDir + "/" + filename;
    console.log(`Loading episode ${path}`);
    const episodeString = fs.readFileSync(path, {
      encoding: "utf8",
    });
    yield JSON.parse(episodeString);
  }
}

/**
 * Generator function for training episodes. Yields snapshots, receives inference
 * results, and returns episode training data.
 */
export function* trainingEpisode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  mctsContext: MctsContext<C, S, A>,
  episodeConfig: EpisodeConfiguration
): Generator<
  EpisodeSnapshot<C, S>,
  EpisodeTrainingData<C, S, A>,
  InferenceResult<A>
> {
  const startMs = performance.now();
  let snapshot = game.newEpisode(episodeConfig);
  if (game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  const inferenceResult = yield snapshot;
  let root = new NonTerminalStateNode(mctsContext, snapshot, inferenceResult);
  const nonTerminalStates = new Array<StateSearchData<S, A>>();
  while (game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(game.currentPlayer(snapshot));
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      yield* root.visit();
      selectedAction = root.actionToChild.keys().next().value;
    } else {
      for (let i of Range(
        0,
        Math.max(mctsContext.config.simulationCount, root.actionToChild.size)
      )) {
        yield* root.visit();
      }
      // TODO incorporate noise
      const actionToVisitCount = Seq.Keyed(root.actionToChild).map(
        (node) => node.visitCount
      );
      selectedAction = proportionalRandom(actionToVisitCount);
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
    const [newState, chanceKey] = game.apply(
      snapshot,
      requireDefined(selectedAction)
    );
    snapshot = snapshot.derive(newState);
    if (game.result(snapshot) != undefined) {
      break;
    }

    // Reuse the node for newState from the previous search tree if it exists.
    // It might not exist if there was non-determinism in the application of the
    // latest action.
    const existingStateNode = root.actionToChild
      .get(requireDefined(selectedAction))
      ?.chanceKeyToChild.get(chanceKey);
    if (existingStateNode != undefined) {
      if (!(existingStateNode instanceof NonTerminalStateNode)) {
        throw new Error(
          `Node for non-terminal state was not NonTerminalStateNode`
        );
      }
      root = existingStateNode;
    } else {
      root = new NonTerminalStateNode(mctsContext, snapshot, yield snapshot);
    }
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
