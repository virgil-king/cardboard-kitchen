import { mcts, selectChildAtIntermediateNode } from "agent";
import {
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";
import { Experiment } from "training";

// This file contains configuration for Kingdomino self-play, training, and eval

export const kingdominoExperiment = new Experiment({
  name: "kingdomino-gumbel-custom-loss",
  selfPlayEpisodesPerBatch: 256,
  selfPlayWorkerCount: 2,
  // trainingSampleBufferSize: 1024 * 4,

  trainingBatchSize: 128,

  evalEpisodesPerBatch: 128,
  evalBatchCount: 1,
});

// Defaults for self-play and eval
const mctsConfigDefaults = {
  simulationCount: 128,
  explorationBias: 5,
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
