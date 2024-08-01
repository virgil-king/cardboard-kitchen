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
  A extends Action,
  EncodedSampleT
> {
  inferenceModel: InferenceModel<C, S, A>;
  /**
   * Returns a training view of the model. {@link batchSize} is only used the
   * first time this method is called per model instance.
   */
  trainingModel(batchSize: number): TrainingModel<C, S, A, EncodedSampleT>;

  toJson(): Promise<tfcore.io.ModelArtifacts>;

  save(path: string): void;
}

export interface InferenceModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /** Returns value and policy results for {@link snapshots} */
  infer(snapshots: ReadonlyArray<EpisodeSnapshot<C, S>>): ReadonlyArray<InferenceResult<A>>;
}

export interface TrainingModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT
> {
  encodeSample(sample: StateTrainingData<C, S, A>): EncodedSampleT;

  /** Trains the model on the given data */
  train(dataPoints: ReadonlyArray<EncodedSampleT>): Promise<number>;
}
