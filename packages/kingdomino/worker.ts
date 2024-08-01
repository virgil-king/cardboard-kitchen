import { SettablePromise, requireDefined, sleep } from "studio-util";
import { Episode, EpisodeConfiguration, Player, Players } from "game";
import {
  InferenceResult,
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
  episode as gameEpisode,
} from "training";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { Kingdomino, KingdominoSnapshot } from "./kingdomino.js";
import * as worker_threads from "node:worker_threads";
import { Map } from "immutable";
import * as fs from "fs";
import { KingdominoConvolutionalModel } from "./model-cnn.js";
import { Range } from "immutable";
import { EpisodeTrainingData, StateTrainingData } from "training-data";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { first } from "lodash";

const messagePort = worker_threads.workerData as worker_threads.MessagePort;

let model: KingdominoConvolutionalModel | undefined;

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
const cecile = new Player("cecile", "Cecile");
const derek = new Player("derek", "Derek");
const players = new Players(alice, bob, cecile, derek);
const episodeConfig = new EpisodeConfiguration(players);
const randomAgent = new RandomKingdominoAgent();

const mctsConfig = new MctsConfig({
  simulationCount: 128,
  randomPlayoutConfig: { weight: 1, agent: randomAgent },
});

const ready = new SettablePromise<undefined>();

messagePort.on("message", async (message: any) => {
  const newModel = await KingdominoConvolutionalModel.fromJson(message);
  model?.model.dispose();
  model = newModel;
  console.log(`Received new model`);
  ready.fulfill(undefined);
});

const home = process.env.HOME;
const gamesDir = `${home}/ckdata/kingdomino/games`;
fs.mkdirSync(gamesDir, { recursive: true });

const concurrentEpisodeCount = 64;

type KingdominoEpisodeTrainingData = EpisodeTrainingData<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>;
type KingdominoInferenceResult = InferenceResult<KingdominoAction>;
type KingdominoGenerator = Generator<
  KingdominoSnapshot,
  KingdominoEpisodeTrainingData,
  KingdominoInferenceResult
>;
type KingdominoIteratorResult = IteratorResult<
  KingdominoSnapshot,
  KingdominoEpisodeTrainingData
>;

async function main() {
  await ready.promise;

  while (true) {
    const localModel = requireDefined(model);

    const mctsContext = {
      config: mctsConfig,
      game: Kingdomino.INSTANCE,
      model: localModel.inferenceModel,
      stats: new MctsStats(),
    };

    // Pairs of generators and the latest values from the associated generator
    let generatorToNext = Range(0, concurrentEpisodeCount)
      .map<[KingdominoGenerator, KingdominoIteratorResult]>((i) => {
        const generator = gameEpisode(
          Kingdomino.INSTANCE,
          mctsContext,
          episodeConfig
        );
        return [generator, generator.next()];
      })
      .toArray();

    // Completed episodes
    const results = new Array<KingdominoEpisodeTrainingData>();

    // While there are any remaining generators (as opposed to completed episodes)...
    while (generatorToNext.length != 0) {
      // Collect the generators and snapshots that need inference results. The list may
      // be shorter than generatorToNext if some episodes were completed on this step.
      const generatorToSnapshot = new Array<
        [KingdominoGenerator, KingdominoSnapshot]
      >();
      for (const [generator, iteratorResult] of generatorToNext) {
        if (iteratorResult.done) {
          results.push(iteratorResult.value);
        } else {
          generatorToSnapshot.push([generator, iteratorResult.value]);
        }
      }
      // Batch inference
      const inferenceResult = localModel.inferenceModel.infer(
        generatorToSnapshot.map(([, snapshot]) => snapshot)
      );
      // Supply inference results to the waiting generators yielding the next list of
      // iterator results to scan
      const newGeneratorToNext = new Array<
        [KingdominoGenerator, KingdominoIteratorResult]
      >();
      for (let i = 0; i < generatorToSnapshot.length; i++) {
        const [generator] = generatorToSnapshot[i];
        const next = generator.next(inferenceResult[i]);
        newGeneratorToNext.push([generatorToSnapshot[i][0], next]);
      }
      generatorToNext = newGeneratorToNext;
    }

    // console.log(
    //   `Scores: ${episodeTrainingData.terminalState.props.playerIdToState
    //     .valueSeq()
    //     .map((state) => state.score)
    //     .toArray()
    //     .sort((a, b) => a - b)}`
    // );

    // const elapsedMs = performance.now() - startMs;
    // console.log(
    //   `Inference time: ${
    //     mctsContext.stats.inferenceTimeMs / elapsedMs
    //   } of total`
    // );
    // console.log(
    //   `Random playout time: ${
    //     mctsContext.stats.randomPlayoutTimeMs / elapsedMs
    //   } of total`
    // );

    // messagePort.postMessage(episodeTrainingData.toJson());

    // const encoded = episodeTrainingData.toJson();
    // fs.writeFileSync(
    //   `${gamesDir}/${new Date().toISOString()}`,
    //   JSON.stringify(encoded, undefined, 1)
    // );

    await sleep(0);
  }
}

main();
