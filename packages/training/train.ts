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
import * as os from "os";
import * as worker_threads from "node:worker_threads";
import * as fs from "fs";
import {
  ActionStatistics,
  EpisodeTrainingData,
  StateSearchData,
} from "training-data";

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

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
  // batchCount: number,
  sampleBufferSize: number,
  workerScript: string,
  modelsPath: string,
  episodesDir?: string
) {
  const trainingModel = model.trainingModel(batchSize);
  const modelArtifacts = await model.toJson();

  const buffer = new EpisodeBuffer<
    EncodedSampleT,
    SimpleArrayLike<EncodedSampleT>
  >(sampleBufferSize);

  const bufferReady = new SettablePromise<undefined>();

  function processEpisode(message: any) {
    const decoded = EpisodeTrainingData.decode(game, message);
    const encodedSamples = decoded
      .stateTrainingDataArray()
      .map((sample) => trainingModel.encodeSample(sample));
    buffer.addEpisode(new SimpleArrayLike(encodedSamples));
    if (buffer.sampleCount() >= batchSize) {
      bufferReady.fulfill(undefined);
    }
  }

  let initialEpisodeCount = 0;
  if (episodesDir != undefined) {
    for (const encodedEpisode of loadEpisodes(episodesDir)) {
      processEpisode(encodedEpisode);
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
  const workersStartedMs = performance.now();
  function receiveEpisode(message: any) {
    processEpisode(message);
    episodesReceived++;
    const sinceWorkersStartedMs = performance.now() - workersStartedMs;
    console.log(
      `Seconds per episode: ${decimalFormat.format(
        sinceWorkersStartedMs / 1_000 / episodesReceived
      )}`
    );
  }

  const workerCount = 1; // os.cpus().length - 2;
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

  let episodesBetweenModelUpdates = workerCount;
  let episodesReceivedAtLastModelUpdate = 0;
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
    const episodesReceivedSinceLastModelUpdate =
      episodesReceived - episodesReceivedAtLastModelUpdate;
    // console.log(`${newEpisodesReceived} new episodes received; `)
    if (episodesReceivedSinceLastModelUpdate >= episodesBetweenModelUpdates) {
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
    if (timeSinceLastSave > 15 * 60 * 1_000) {
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
>(episodesDir: string): Generator<any> {
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
    const episodeJson = JSON.parse(episodeString);
    yield episodeJson;
  }
}

// class EpisodeStep<
//   C extends GameConfiguration,
//   S extends GameState,
//   A extends Action
// > {
//   constructor(
//     readonly game: Game<C, S, A>,
//     readonly playerIdToMctsContext: Map<string, MctsContext<C, S, A>>,
//     readonly snapshot: EpisodeSnapshot<C, S>,
//     readonly currentPlayerContext: MctsContext<C, S, A>,
//     readonly root: NonTerminalStateNode<C, S, A>
//   ) {}

//   next(): EpisodeStep<C, S, A> | undefined {
//     const currentPlayer = requireDefined(
//       this.game.currentPlayer(this.snapshot)
//     );
//     // Run simulationCount steps or enough to try every possible action once
//     let selectedAction: A | undefined = undefined;
//     if (this.root.actionToChild.size == 1) {
//       // When root has exactly one child, visit it once to populate the
//       // action statistics, but no further visits are necessary
//       this.root.visit();
//       selectedAction = this.root.actionToChild.keys().next().value;
//     } else {
//       for (let i of Range(
//         0,
//         Math.max(
//           this.currentPlayerContext.config.simulationCount,
//           this.root.actionToChild.size
//         )
//       )) {
//         this.root.visit();
//       }
//       // TODO incorporate noise
//       // [selectedAction] = requireDefined(
//       //   Seq(root.actionToChild.entries()).max(
//       //     ([, actionNode1], [, actionNode2]) =>
//       //       actionNode1.requirePlayerValue(currentPlayer) -
//       //       actionNode2.requirePlayerValue(currentPlayer)
//       //   )
//       // );
//       const actionToVisitCount = Seq.Keyed(this.root.actionToChild).map(
//         (node) => node.visitCount
//       );
//       selectedAction = proportionalRandom(actionToVisitCount);
//     }
//     const stateSearchData = new StateSearchData(
//       this.snapshot.state,
//       this.root.inferenceResult.value,
//       Map(
//         Seq(root.actionToChild.entries()).map(([action, child]) => [
//           action,
//           new ActionStatistics(
//             child.prior,
//             child.visitCount,
//             new PlayerValues(child.playerExpectedValues.playerIdToValue)
//           ),
//         ])
//       )
//     );
//     nonTerminalStates.push(stateSearchData);
//     const [newState] = this.game.apply(this.snapshot, requireDefined(selectedAction));
//     const newSnapshot = this.snapshot.derive(newState);
//     if (this.game.result(newSnapshot) != undefined) {
//       return;
//     }
//     const newMctsContext = mctsContext();

//     // Reuse the node for newState from the previous search tree if it exists.
//     // It might not exist if there was non-determinism in the application of the
//     // latest action.
//     // const existingStateNode = root.actionToChild
//     //   .get(actionWithGreatestExpectedValue)
//     //   ?.chanceKeyToChild.get(chanceKey);
//     // if (existingStateNode != undefined) {
//     //   if (!(existingStateNode instanceof NonTerminalStateNode)) {
//     //     throw new Error(
//     //       `Node for non-terminal state was not NonTerminalStateNode`
//     //     );
//     //   }
//     //   if (existingStateNode.context == currentMctsContext) {
//     //     root = existingStateNode;
//     //   } else {
//     //     console.log(
//     //       "Ignoring current child node because it has a different current player"
//     //     );
//     //     root = new NonTerminalStateNode(currentMctsContext, snapshot);
//     //   }
//     // } else {
//     //   root = new NonTerminalStateNode(currentMctsContext, snapshot);
//     // }

//     // root = new NonTerminalStateNode(currentMctsContext, snapshot);
//   }
// }

/**
 * Runs a new episode to completion and returns training data for each state in
 * the episode
 */
export function* episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  // playerIdToMctsContext: Map<string, MctsContext<C, S, A>>,
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
  // function mctsContext(): MctsContext<C, S, A> {
  //   const player = requireDefined(game.currentPlayer(snapshot));
  //   return requireDefined(playerIdToMctsContext.get(player.id));
  // }
  // let currentMctsContext = mctsContext();
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
      // [selectedAction] = requireDefined(
      //   Seq(root.actionToChild.entries()).max(
      //     ([, actionNode1], [, actionNode2]) =>
      //       actionNode1.requirePlayerValue(currentPlayer) -
      //       actionNode2.requirePlayerValue(currentPlayer)
      //   )
      // );
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
    // currentMctsContext = mctsContext();

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

    // root = new NonTerminalStateNode(mctsContext, snapshot, yield snapshot);

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
