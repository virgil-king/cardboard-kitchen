import {
  Action,
  EpisodeSnapshot,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "game";
import { Map } from "immutable";
import { StateTrainingData } from "./training-data.js";
import * as io from "io-ts";

export type InferenceResult<A extends Action> = {
  /** Predicted values for each player from the input state */
  value: PlayerValues;
  /** Logits (not a probability distribution) for the valid actions from the input state */
  policyLogits: Map<A, number>;
};

export const modelMetadataCodec = io.type({
  trainingSampleCount: io.number,
});

export type ModelMetadata = io.TypeOf<typeof modelMetadataCodec>;

export const modelCodec = io.type({
  description: io.string,
  modelArtifacts: io.any,
  metadata: io.union([modelMetadataCodec, io.undefined]),
});

export type ModelCodecType = io.TypeOf<typeof modelCodec>;

/**
 * Implementations must support structured cloning and should use transferable
 * objects (e.g. ArrayBuffer) for efficiency
 */
export interface TransferableBatch {
  readonly count: number;
  readonly transfers: ReadonlyArray<any>;
}

/**
 * Encodes batches for training.
 *
 * Encoding happens separately from training so the two can happen on different threads.
 */
export interface ModelEncoder<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  T extends TransferableBatch
> {
  encodeTrainingBatch(samples: ReadonlyArray<StateTrainingData<C, S, A>>): T;
}

export interface Model<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  T extends TransferableBatch
> {
  description: string;

  inferenceModel: InferenceModel<C, S, A>;

  metadata: ModelMetadata | undefined;

  /**
   * Returns a training view of the model. {@link batchSize} is only used the
   * first time this method is called per model instance.
   */
  trainingModel(batchSize: number): TrainingModel<T>;

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

export interface TrainingModel<T extends TransferableBatch> {
  /** Trains the model on the given data */
  train(batch: T): Promise<ReadonlyArray<number>>;
}
