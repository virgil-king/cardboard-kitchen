import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  JsonSerializable,
  PlayerValues,
} from "./game.js";
import { Map } from "immutable";
import * as io from "io-ts";
import tfcore from "@tensorflow/tfjs-core";

const StateTrainingDataJson = io.type({});

export class StateTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  constructor(
    /** Game state */
    // Consider pre-encoding as vectors to move work from the training thread to
    // self-play threads
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

export type InferenceResult<A extends Action> = {
  value: PlayerValues;
  policy: Map<A, number>;
};

export interface Model<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  inferenceModel: InferenceModel<C, S, A>;
  /**
   * Returns a training view of the model. {@link batchSize} is only used the
   * first time this method is called per model instance.
   */
  trainingModel(batchSize: number): TrainingModel<C, S, A>;

  toJson(): Promise<tfcore.io.ModelArtifacts>;

  save(path: string): void;
}

export interface InferenceModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /** Returns value and policy results for {@link snapshot} */
  infer(snapshot: EpisodeSnapshot<C, S>): InferenceResult<A>;
}

export interface TrainingModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /** Trains the model on the given data */
  train(dataPoints: ReadonlyArray<StateTrainingData<C, S, A>>): Promise<void>;
}
