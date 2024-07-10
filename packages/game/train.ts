import { drawN, requireDefined } from "studio-util";
import {
  Action,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "./game.js";
import {
  MctsConfig,
  MctsContext,
  MctsStats,
  NonTerminalStateNode,
} from "./mcts.js";
import { Map, Range, Seq } from "immutable";
import { Model, StateTrainingData } from "./model.js";
import { GameBuffer } from "./gamebuffer.js";

/**
 * @param batchSize number of state samples to use per batch
 */
export async function train<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  model: Model<C, S, A>,
  episodeConfig: EpisodeConfiguration,
  mctsConfig: MctsConfig<C, S, A>,
  batchSize: number,
  batchCount: number,
  sampleBufferSize: number
) {
  const context = {
    config: mctsConfig,
    game: game,
    model: model,
    stats: new MctsStats(),
  };
  let selfPlayDurationMs = 0;
  let trainingDurationMs = 0;
  const buffer = new GameBuffer<StateTrainingData<C, S, A>>(sampleBufferSize);
  // const perf = Performance.new();
  const decimalFormat = Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  });
  for (let i = 0; i < batchCount; i++) {
    const selfPlayStartMs = performance.now();
    // let samples = new Array<StateTrainingData<C, S, A>>();
    do {
      const episodeTrainingData = episode(context, episodeConfig);
      buffer.addGame(episodeTrainingData.stateTrainingDataArray());
    } while (buffer.sampleCount() < batchSize);
    console.log(`Filled next batch`);
    const now = performance.now();
    selfPlayDurationMs += now - selfPlayStartMs;
    const trainingStartMs = now;
    const batch = buffer.sample(batchSize);
    await model.train(batch);
    trainingDurationMs += performance.now() - trainingStartMs;
    const totalDurationMs = selfPlayDurationMs + trainingDurationMs;
    console.log(
      `Self play time ${Math.round(selfPlayDurationMs)} ms (${decimalFormat.format(
        (selfPlayDurationMs * 100) / totalDurationMs
      )}% of total)`
    );
    console.log(
      `Training time ${Math.round(trainingDurationMs)} ms (${decimalFormat.format(
        (trainingDurationMs * 100) / totalDurationMs
      )}% of total)`
    );
    console.log(
      `Inference time ${
        Math.round(context.stats.inferenceTimeMs)
      } ms (${decimalFormat.format(
        (context.stats.inferenceTimeMs * 100) / selfPlayDurationMs
      )}% of self play time)`
    );
  }
}

class StateSearchData<S extends GameState, A extends Action> {
  constructor(readonly state: S, readonly actionToVisitCount: Map<A, number>) {}
}

class EpisodeTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  constructor(
    readonly episodeConfig: EpisodeConfiguration,
    readonly gameConfig: C,
    readonly terminalValues: PlayerValues,
    readonly dataPoints: Array<StateSearchData<S, A>>
  ) {}

  get stateCount(): number {
    return this.dataPoints.length;
  }

  stateTrainingData(index: number): StateTrainingData<C, S, A> {
    return new StateTrainingData(
      new EpisodeSnapshot(
        this.episodeConfig,
        this.gameConfig,
        this.dataPoints[index].state
      ),
      this.dataPoints[index].actionToVisitCount,
      this.terminalValues
    );
  }

  stateTrainingDataArray(): Array<StateTrainingData<C, S, A>> {
    const result = new Array<StateTrainingData<C, S, A>>();
    for (let i = 0; i < this.stateCount; i++) {
      result.push(this.stateTrainingData(i));
    }
    return result;
  }
}

/**
 * Runs a new episode to completion and returns training data for each state in
 * the episode
 */
function episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  mctsContext: MctsContext<C, S, A>,
  episodeConfig: EpisodeConfiguration
): EpisodeTrainingData<C, S, A> {
  let snapshot = mctsContext.game.newEpisode(episodeConfig);
  if (mctsContext.game.result(snapshot) != undefined) {
    throw new Error(`episode called on completed state`);
  }
  let root = new NonTerminalStateNode(mctsContext, snapshot);
  const states = new Array<StateSearchData<S, A>>();
  while (mctsContext.game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(
      mctsContext.game.currentPlayer(snapshot)
    );
    // Run simulationCount steps or enough to try every possible action once
    for (let i of Range(
      0,
      Math.max(mctsContext.config.simulationCount, root.actionToChild.size)
    )) {
      root.visit();
    }
    // TODO incorporate noise
    // TODO choose proportionally rather than greedily
    // TODO some action nodes might not have been visited yet. How to fix that?
    const [actionWithGreatestExpectedValue] = requireDefined(
      Seq(root.actionToChild.entries()).max(
        ([, actionNode1], [, actionNode2]) =>
          actionNode1.requirePlayerValue(currentPlayer) -
          actionNode2.requirePlayerValue(currentPlayer)
      )
    );
    const stateSearchData = new StateSearchData(
      snapshot.state,
      Map(
        Seq(root.actionToChild.entries()).map(([action, child]) => [
          action,
          child.visitCount,
        ])
      )
    );
    // console.log(
    //   `New search data is ${JSON.stringify(
    //     stateSearchData.actionToVisitCount.toArray()
    //   )}`
    // );
    states.push(stateSearchData);
    // console.log(
    //   `Selected action ${JSON.stringify(
    //     actionWithGreatestExpectedValue,
    //     undefined,
    //     2
    //   )}`
    // );
    const [newState, chanceKey] = mctsContext.game.apply(
      snapshot,
      actionWithGreatestExpectedValue
    );
    snapshot = snapshot.derive(newState);
    if (mctsContext.game.result(snapshot) != undefined) {
      break;
    }
    // Reuse the node for newState from the previous search tree if it exists.
    // It might not exist if there was non-determinism in the application of the
    // latest action.
    const existingStateNode = root.actionToChild
      .get(actionWithGreatestExpectedValue)
      ?.chanceKeyToChild.get(chanceKey);
    if (existingStateNode != undefined) {
      if (!(existingStateNode instanceof NonTerminalStateNode)) {
        throw new Error(
          `Node for non-terminal state was not NonTerminalStateNode`
        );
      }
      root = existingStateNode;
    } else {
      root = new NonTerminalStateNode(mctsContext, snapshot);
    }
    // console.log(`New root node has ${root.visitCount} visits`);
  }
  console.log(`Completed episode`);
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    requireDefined(mctsContext.game.result(snapshot)),
    states
  );
}
