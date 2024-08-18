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
import {
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

// const model1 = KingdominoModel.load(process.argv[2]);
// const model2 = KingdominoModel.load(process.argv[3]);

const modelPath = newestModelPath("kingdomino", "conv3");
if (modelPath == undefined) {
  throw new Error("No model to evaluate");
}

const model = KingdominoConvolutionalModel.load(modelPath);
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
  // explorationBias: Math.sqrt(2),
  //   maxChanceBranches: 4,
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
  // const playerIdToMctsContext = Map<
  //   string,
  //   MctsContext<KingdominoConfiguration, KingdominoState, KingdominoAction>
  // >([
  //   [model1.id, mctsContext],
  //   [model2.id, mctsContext],
  // ]);

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
    const transcript = [
      ...generateEpisode(Kingdomino.INSTANCE, episodeConfig, playerIdToAgent),
    ];

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
    // const player1Score = lastSnapshot.state.requirePlayerState(model1.id).score;
    // console.log(`Player 1 score: ${player1Score}`);
    // const player2Score = lastSnapshot.state.requirePlayerState(model2.id).score;
    // console.log(`Player 2 score: ${player2Score}`);
    // if (player1Score > player2Score) {
    //   playerIdToValue = playerIdToValue.set(
    //     model1.id,
    //     playerIdToValue.get(model1.id, 0) + 1
    //   );
    // } else if (player2Score > player1Score) {
    //   playerIdToValue = playerIdToValue.set(
    //     model2.id,
    //     playerIdToValue.get(model2.id, 0) + 1
    //   );
    // }
  }
  console.log(playerIdToValue.toArray());
}

class MctsAgent<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements Agent<C, S, A>
{
  constructor(
    readonly game: Game<C, S, A>,
    readonly mctsContext: MctsContext<C, S, A>
  ) {}
  act(snapshot: EpisodeSnapshot<C, S>): A {
    const root = new NonTerminalStateNode(
      this.mctsContext,
      snapshot,
      this.mctsContext.model.infer([snapshot])[0]
    );
    // Run simulationCount steps or enough to try every possible action once
    let selectedAction: A | undefined = undefined;
    if (root.actionToChild.size == 1) {
      // When root has exactly one child, visit it once to populate the
      // action statistics, but no further visits are necessary
      // root.visit();
      this.visit(root);
      return root.actionToChild.keys().next().value;
    } else {
      for (let i of Range(
        0,
        Math.max(
          this.mctsContext.config.simulationCount,
          root.actionToChild.size
        )
      )) {
        // root.visit();
        this.visit(root);
      }
      const currentPlayer = requireDefined(this.game.currentPlayer(snapshot));
      // Greedily select action with greatest expected value
      [selectedAction] = requireDefined(
        Seq(root.actionToChild.entries()).max(
          ([, actionNode1], [, actionNode2]) =>
            actionNode1.requirePlayerValue(currentPlayer) -
            actionNode2.requirePlayerValue(currentPlayer)
        )
      );
      return selectedAction;
    }
  }

  visit(node: NonTerminalStateNode<C, S, A>) {
    const generator = node.visit();
    // let next = generator.next();
    // while (true) {
    //   if (next.done) {
    //     return;
    //   }
    //   const inference = this.mctsContext.model.infer([next.value])[0];
    //   next = generator.next(inference);
    // }
    driveGenerators([generator], (snapshots) =>
      this.mctsContext.model.infer(snapshots)
    );
  }
}

main();
