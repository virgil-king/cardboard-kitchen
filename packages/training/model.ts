import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "game";
import { Map } from "immutable";
import tfcore from "@tensorflow/tfjs-core";
import { StateTrainingData } from "training-data";

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
  train(dataPoints: ReadonlyArray<StateTrainingData<C, S, A>>): Promise<number>;
}
