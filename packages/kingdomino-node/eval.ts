import { Map, Range, Seq } from "immutable";
import {
  Action,
  Agent,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  generateEpisode,
  Player,
  Players,
} from "game";
import { newestModelPath } from "training";

import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoModel,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";
import { driveGenerators, requireDefined } from "studio-util";
import {
  MctsAgent,
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "mcts";
import * as tf from "@tensorflow/tfjs-node-gpu";

// Script to run eval episodes on a saved model

const modelPath = newestModelPath("kingdomino", "conv3");
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = KingdominoModel.loadFromFile(modelPath, tf);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);

const mctsConfig = new MctsConfig<
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

const model1 = new Player("model-1", "Model 1");
const model2 = new Player("model-2", "Model 2");
const random1 = new Player("random-1", "Random 1");
const random2 = new Player("random-2", "Random 2");

const decimalFormat = Intl.NumberFormat(undefined, {
  maximumFractionDigits: 3,
});

async function main() {
  const mctsContext = {
    config: mctsConfig,
    game: Kingdomino.INSTANCE,
    model: (await model).inferenceModel,
    stats: new MctsStats(),
  };
  const randomAgent = new RandomKingdominoAgent();
  const mctsAgent = new MctsAgent(Kingdomino.INSTANCE, mctsContext);
  const playerIdToAgent = Map([
    [model1.id, mctsAgent],
    [model2.id, mctsAgent],
    [random1.id, randomAgent],
    [random2.id, randomAgent],
  ]);
  const episodeConfig = new EpisodeConfiguration(
    new Players(model1, model2, random1, random2)
  );

  let playerIdToValue = Map<string, number>();
  for (const episodeIndex of Range(0, episodeCount)) {
    console.log(`Starting episode ${episodeIndex}`);
    const start = performance.now();
    const transcript = await Array.fromAsync(
      generateEpisode(Kingdomino.INSTANCE, episodeConfig, playerIdToAgent)
    );

    const lastStateIndex = transcript.length - 1;
    const lastSnapshot = transcript[lastStateIndex];
    const result = requireDefined(Kingdomino.INSTANCE.result(lastSnapshot));

    console.log(
      `Episode complete after ${
        (performance.now() - start) / 1_000
      } seconds. Scores: ${JSON.stringify(
        lastSnapshot.state.props.playerIdToState.map((state) => state.score)
      )}`
    );

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

main();
