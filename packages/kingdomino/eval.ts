import { loadLayersModel } from "@tensorflow/tfjs-node-gpu";
import { KingdominoModel } from "./model.js";
import { Map, Range } from "immutable";
import {
  EpisodeConfiguration,
  MctsConfig,
  MctsContext,
  MctsStats,
  Player,
  Players,
  episode,
} from "game";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Kingdomino } from "./kingdomino.js";
import { RandomKingdominoAgent } from "./randomplayer.js";

const model1 = loadModel(process.argv[2]);
const model2 = loadModel(process.argv[3]);

const episodeCount = parseInt(process.argv[4]);
console.log(`episodeCount is ${episodeCount}`);

const mctsConfig = new MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: 128,
  randomPlayoutConfig: {
    weight: 1,
    agent: new RandomKingdominoAgent(),
  },
  //   explorationBias: 0,
  //   randomPlayoutConfig: undefined,
  //   maxChanceBranches: 4,
});

const player1 = new Player("player1", "Player 1");
const player2 = new Player("player2", "Player 2");

async function loadModel(path: string): Promise<KingdominoModel> {
  const layersModel = await loadLayersModel(`file://${path}`);
  //   console.log(layersModel.weights);
  return new KingdominoModel(layersModel);
}

async function main() {
  const playerIdToMctsContext = Map<
    string,
    MctsContext<KingdominoConfiguration, KingdominoState, KingdominoAction>
  >([
    [
      player1.id,
      {
        config: mctsConfig,
        game: Kingdomino.INSTANCE,
        model: (await model1).inferenceModel,
        stats: new MctsStats(),
      },
    ],
    [
      player2.id,
      {
        config: mctsConfig,
        game: Kingdomino.INSTANCE,
        model: (await model2).inferenceModel,
        stats: new MctsStats(),
      },
    ],
  ]);

  const episodeConfig = new EpisodeConfiguration(new Players(player1, player2));
  let playerIdToVictories = Map<string, number>();
  for (const episodeIndex of Range(0, episodeCount)) {
    console.log(`Starting episode ${episodeIndex}`);
    const transcript = episode(
      Kingdomino.INSTANCE,
      playerIdToMctsContext,
      episodeConfig
    );

    console.log(`Episode complete.`);
    const lastStateIndex = transcript.dataPoints.length - 1;
    const lastSnapshot = transcript.get(lastStateIndex).snapshot;
    const result = Kingdomino.INSTANCE.result(lastSnapshot);
    const player1Score = lastSnapshot.state.requirePlayerState(
      player1.id
    ).score;
    console.log(`Player 1 score: ${player1Score}`);
    const player2Score = lastSnapshot.state.requirePlayerState(
      player2.id
    ).score;
    console.log(
      `Player 2 score: ${
        lastSnapshot.state.requirePlayerState(player2.id).score
      }`
    );
    if (player1Score > player2Score) {
      playerIdToVictories = playerIdToVictories.set(
        player1.id,
        playerIdToVictories.get(player1.id, 0)
      );
    } else if (player2Score > player1Score) {
      playerIdToVictories = playerIdToVictories.set(
        player2.id,
        playerIdToVictories.get(player2.id, 0)
      );
    }
  }
  console.log(playerIdToVictories.toArray());
}

main();
