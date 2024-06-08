import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "./game.js";
import { Map } from "immutable";

export class StateTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  constructor(
    readonly snapshot: EpisodeSnapshot<C, S>,
    /** Used to train the policy function */
    readonly actionToVisitCount: Map<A, number>,
    /** Used to train the value function */
    readonly terminalValues: PlayerValues
  ) {
    if (
      snapshot.episodeConfiguration.players.players.count() !=
      terminalValues.playerIdToValue.count()
    ) {
      throw new Error(
        "Different player counts between config and terminal values"
      );
    }
  }
}

export interface Model<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /**
   * Map from possible actions from {@link snapshot} to their expected value for
   * the acting player
   */
  policy(snapshot: EpisodeSnapshot<C, S>): Map<A, number>;

  /**
   * Predicted final player values for the game starting from {@link snapshot}
   */
  value(snapshot: EpisodeSnapshot<C, S>): PlayerValues;

  /** Trains the model on the given data */
  train(dataPoints: StateTrainingData<C, S, A>[]): void;
}
