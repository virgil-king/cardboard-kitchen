import { requireDefined } from "studio-util";
import {
  Action,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "./game.js";
import { MctsConfig, MctsContext, StateNode } from "./mcts.js";
import { Map, Range, Seq } from "immutable";
import { Model, StateTrainingData } from "./model.js";

export function train<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  model: Model<C, S, A>,
  episodeConfig: EpisodeConfiguration,
  mctsConfig: MctsConfig,
  episodeCount: number
) {
  const context = {
    config: mctsConfig,
    game: game,
    model: model,
  };
  for (let i = 0; i < episodeCount; i++) {
    const episodeTrainingData = episode(context, episodeConfig);
    for (let j of Range(0, episodeTrainingData.stateCount)) {
        model.train([episodeTrainingData.stateTrainingData(j)]);
    }
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
}

function episode<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  mctsContext: MctsContext<C, S, A>,
  episodeConfig: EpisodeConfiguration
): EpisodeTrainingData<C, S, A> {
  let snapshot = mctsContext.game.newEpisode(episodeConfig);
  let root = new StateNode(mctsContext, snapshot);
  const states = new Array<StateSearchData<S, A>>();
  while (mctsContext.game.result(snapshot) == undefined) {
    const currentPlayer = requireDefined(
      mctsContext.game.currentPlayer(snapshot)
    );
    for (let i of Range(0, mctsContext.config.simulationCount)) {
      root.visit();
    }
    // TODO incorporate noise
    // TODO choose proportionally rather than greedily
    const [actionWithGreatestExpectedValue] = requireDefined(
      Seq(root.actionToChild.entries()).max(
        ([, actionNode1], [, actionNode2]) =>
          actionNode1.requirePlayerValue(currentPlayer) -
          actionNode2.requirePlayerValue(currentPlayer)
      )
    );
    states.push(
      new StateSearchData(
        snapshot.state,
        Map(
          Seq(root.actionToChild.entries()).map(([action, child]) => [
            action,
            child.requirePlayerValue(currentPlayer),
          ])
        )
      )
    );
    const [newState, chanceKey] = mctsContext.game.apply(
      snapshot,
      actionWithGreatestExpectedValue
    );
    snapshot.derive(newState);
    // Reuse the node for newState from the previous search tree if it exists.
    // It might not exist if there was non-determinism in the application of the
    // latest action.
    root =
      root.actionToChild
        .get(actionWithGreatestExpectedValue)
        ?.chanceKeyToChild.get(chanceKey) ??
      new StateNode(mctsContext, snapshot);
    console.log(`New root node has ${root.visitCount} visits`);
  }
  return new EpisodeTrainingData(
    episodeConfig,
    snapshot.gameConfiguration,
    requireDefined(mctsContext.game.result(snapshot)),
    states
  );
}
