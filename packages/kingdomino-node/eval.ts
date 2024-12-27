import { Map, Range } from "immutable";
import {
  Action,
  Agent,
  Episode,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  Player,
  Players,
} from "game";
import {} from "training";

import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";
import { requireDefined } from "studio-util";
import { mcts, MctsAgent } from "mcts";
import { loadModelFromFile } from "./model.js";
import { kingdominoExperiment } from "./config.js";

// Script to run eval episodes on a saved model

const modelPath = await kingdominoExperiment.newestModelPath();
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = loadModelFromFile(modelPath);
console.log(`Loaded model from ${modelPath}`);

const episodeCount = parseInt(process.argv[2]);
console.log(`episodeCount is ${episodeCount}`);

const mctsConfig = new mcts.MctsConfig<
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
    stats: new mcts.MctsStats(),
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
    const snapshots = await Array.fromAsync(
      generateEpisode(Kingdomino.INSTANCE, episodeConfig, playerIdToAgent)
    );

    const lastStateIndex = snapshots.length - 1;
    const lastSnapshot = snapshots[lastStateIndex];
    const result = requireDefined(Kingdomino.INSTANCE.result(lastSnapshot));

    console.log(
      `Episode complete after ${
        (performance.now() - start) / 1_000
      } seconds. Scores: ${JSON.stringify(
        lastSnapshot.state.props.playerIdToState
          .map((state) => state.score)
          .sort()
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

/**
 * Runs a new episode of {@link game} using {@link playerIdToAgent} to
 * select actions and yielding each new snapshot.
 */
export async function* generateEpisode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  config: EpisodeConfiguration,
  playerIdToAgent: Map<string, Agent<C, S, A>>
): AsyncGenerator<EpisodeSnapshot<C, S>, EpisodeSnapshot<C, S>, unknown> {
  let snapshot = game.newEpisode(config);
  let episode = new Episode(game, snapshot);
  yield episode.currentSnapshot;
  while (game.result(episode.currentSnapshot) == undefined) {
    const currentPlayer = game.currentPlayer(episode.currentSnapshot);
    if (currentPlayer == undefined) {
      throw new Error(`Current player is undefined but game isn't over`);
    }
    const agent = playerIdToAgent.get(currentPlayer.id);
    if (agent == undefined) {
      throw new Error(`No agent for ${currentPlayer.id}`);
    }
    const action = agent.act(episode.currentSnapshot);
    episode.apply(await action);
    yield episode.currentSnapshot;
  }
  return episode.currentSnapshot;
}

main();
