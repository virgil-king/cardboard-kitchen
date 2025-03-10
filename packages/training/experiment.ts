import { Action, Game, GameConfiguration, GameState } from "game";
import { Model, ModelEncoder, TransferableBatch } from "agent";
import { LogDirectory } from "./logdirectory.js";
import { train_parallel } from "./train.js";
import fs from "node:fs/promises";

const gbBytes = 1024 * 1024 * 1024;

export class Experiment {
  readonly name: string;
  readonly selfPlayEpisodesPerBatch: number;
  readonly selfPlayWorkerCount: number;
  readonly trainingBatchSize: number;
  readonly trainingSampleBufferSize: number;
  readonly trainingMaxModelBytes: number;
  readonly trainingMaxEpisodeBytes: number;
  readonly evalEpisodesPerBatch: number;
  readonly evalBatchCount: number;
  readonly evalMaxEpisodeBytes: number;
  constructor(params: {
    /** Must be filename-safe */
    name: string;
    selfPlayEpisodesPerBatch?: number;
    selfPlayWorkerCount?: number;
    trainingBatchSize?: number;
    trainingSampleBufferSize?: number;
    trainingMaxModelBytes?: number;
    trainingMaxEpisodeBytes?: number;
    evalEpisodesPerBatch?: number;
    evalBatchCount?: number;
    evalMaxEpisodeBytes?: number;
  }) {
    this.name = params.name;
    this.selfPlayEpisodesPerBatch = params.selfPlayEpisodesPerBatch ?? 64;
    this.selfPlayWorkerCount = params.selfPlayWorkerCount ?? 8;
    this.trainingBatchSize = params.trainingBatchSize ?? 128;
    this.trainingSampleBufferSize =
      params.trainingSampleBufferSize ?? 1024 * 1024;
    this.trainingMaxModelBytes = params.trainingMaxModelBytes ?? 16 * gbBytes;
    this.trainingMaxEpisodeBytes =
      params.trainingMaxEpisodeBytes ?? 1 * gbBytes;
    this.evalEpisodesPerBatch = params.evalEpisodesPerBatch ?? 64;
    this.evalBatchCount = params.evalBatchCount ?? 1;
    this.evalMaxEpisodeBytes = params.evalMaxEpisodeBytes ?? 1 * gbBytes;
  }

  async experimentDirectory() {
    return this.createDirectoryIfNeeded(
      `${process.env.HOME}/ckdata/experiments/${this.name}`
    );
  }

  async modelsDirectory() {
    return this.createDirectoryIfNeeded(
      `${await this.experimentDirectory()}/models`
    );
  }

  async newestModelPath(): Promise<string | undefined> {
    const modelsDir = await this.modelsDirectory();
    try {
      const modelDirs = (await fs.readdir(modelsDir)).sort();
      if (modelDirs.length == 0) {
        console.log(`No model directories`);
        return undefined;
      }
      const newestModelDir = modelDirs[modelDirs.length - 1];
      return `${modelsDir}/${newestModelDir}`;
    } catch (e: any) {
      console.log(`Error loading model: ${e}`);
      return undefined;
    }
  }

  // These are self-play episodes
  async episodesDirectory() {
    return this.createDirectoryIfNeeded(
      `${await this.experimentDirectory()}/episodes`
    );
  }

  async evalEpisodesDirectory() {
    return this.createDirectoryIfNeeded(
      `${await this.experimentDirectory()}/eval_episodes`
    );
  }

  async logFile() {
    return `${await this.experimentDirectory()}/log.json`;
  }

  private async createDirectoryIfNeeded(path: string) {
    await fs.mkdir(path, { recursive: true });
    return path;
  }
}

export class ExperimentController<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action,
  T extends TransferableBatch
> {
  constructor(
    readonly game: Game<C, S, A>,
    readonly encoder: ModelEncoder<C, S, A, T>,
    readonly trainingWorkerScript: string,
    readonly selfPlayWorkerScript: string,
    readonly evalWorkerScript: string,
    readonly experiment: Experiment
  ) {}

  async run() {
    const episodesDir = new LogDirectory(
      await this.experiment.episodesDirectory(),
      this.experiment.trainingMaxEpisodeBytes
    );

    // TODO inline train_parallel
    train_parallel(
      this.game,
      this.encoder,
      this.experiment.trainingBatchSize,
      this.experiment.trainingSampleBufferSize,
      this.trainingWorkerScript,
      this.selfPlayWorkerScript,
      this.experiment.selfPlayWorkerCount,
      this.evalWorkerScript,
      episodesDir
    );
  }
}
