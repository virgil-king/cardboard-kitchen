import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "game";
import { Map } from "immutable";
import { StateTrainingData } from "training-data";
import * as io from "io-ts";

export type InferenceResult<A extends Action> = {
  value: PlayerValues;
  policy: Map<A, number>;
};

export const modelMetadataCodec = io.type({
  trainingSampleCount: io.number,
});

export type ModelMetadata = io.TypeOf<typeof modelMetadataCodec>;

export const modelCodec = io.type({
  modelArtifacts: io.any,
  metadata: io.union([modelMetadataCodec, io.undefined]),
});

export type ModelCodecType = io.TypeOf<typeof modelCodec>;

export interface Model<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  EncodedSampleT
> {
  inferenceModel: InferenceModel<C, S, A>;

  metadata: ModelMetadata | undefined;

  /**
   * Returns a training view of the model. {@link batchSize} is only used the
   * first time this method is called per model instance.
   */
  trainingModel(batchSize: number): TrainingModel<C, S, A, EncodedSampleT>;

  toJson(): Promise<ModelCodecType>;

  /** Logs a model summary to the console */
  logSummary(): void;

  /** Frees underlying resources */
  dispose(): void;
}

export interface InferenceModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /** Returns value and policy results for {@link snapshots} */
  infer(
    snapshots: ReadonlyArray<EpisodeSnapshot<C, S>>
  ): Promise<ReadonlyArray<InferenceResult<A>>>;
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
