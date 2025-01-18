import { mcts, selectChildAtIntermediateNode } from "agent";
import {
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";
import { Experiment } from "training";

// This file contains configuration for Kingdomino self-play, training, and eval

const productionExperiment = new Experiment({
  name: "kingdomino-split-test",
  selfPlayEpisodesPerBatch: 256,
  selfPlayWorkerCount: 4,
  trainingSampleBufferSize: 1024 * 1024,

  trainingBatchSize: 256,

  evalEpisodesPerBatch: 128,
  evalBatchCount: 1,
});

const testExperiment = new Experiment({
  name: "kingdomino-split-test",
  selfPlayEpisodesPerBatch: 32,
  selfPlayWorkerCount: 2,
  trainingSampleBufferSize: 1024 * 32,

  trainingBatchSize: 256,

  evalEpisodesPerBatch: 32,
  evalBatchCount: 1,
});

export const kingdominoExperiment = productionExperiment;

// Defaults for self-play and eval
const mctsConfigDefaults = {
  simulationCount: 128,
  explorationBias: Math.sqrt(2),
  maxChanceBranches: 1,
};

const randomAgent = new RandomKingdominoAgent();

export const SELF_PLAY_MCTS_CONFIG = new mcts.MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  ...mctsConfigDefaults,
  modelValueWeight: 1,
  randomPlayoutConfig: undefined,
  selectChild: selectChildAtIntermediateNode,
});

export const EVAL_RANDOM_PLAYOUT_MCTS_CONFIG = new mcts.MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  ...mctsConfigDefaults,
  randomPlayoutConfig: {
    weight: 1,
    agent: randomAgent,
  },
});

/** MCTS config used by the subject agent during eval */
export const EVAL_MODEL_VALUE_MCTS_CONFIG = new mcts.MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({ ...mctsConfigDefaults, modelValueWeight: 1 });
