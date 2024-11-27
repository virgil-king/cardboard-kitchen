import { mcts } from "mcts";
import {
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";

// This file contains configuration for self-play, training, and eval

// Defaults for self-play and eval
const mctsConfigDefaults = {
  simulationCount: 256,
  // This value is tailored to four-player episodes, where the maximum
  // value for one player is 3. It should be updated when episodes with
  // other player counts are included.
  explorationBias: 8, // 3 * Math.sqrt(2),
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
});
export const SELF_PLAY_EPISODES_PER_BATCH = 64;
export const SELF_PLAY_WORKER_COUNT = 8;

/** Number of samples per training batch */
export const TRAINING_BATCH_SIZE = 128;
/** Number of samples to retain in memory */
export const TRAINING_SAMPLE_BUFFER_SIZE = 1024 * 512; // 1024;
const gbBytes = 1024 * 1024 * 1024;
/** Cap on disk space used for models */
export const TRAINING_MAX_MODEL_BYTES = 16 * gbBytes;
/** Cap on disk space used for self-playe episodes */
export const TRAINING_MAX_EPISODE_BYTES = 64 * gbBytes;

/** Number of episodes per evaluation batch */
export const EVAL_EPISODES_PER_BATCH = 32;
/** Number of evaluation batches per model */
export const EVAL_BATCHES = 1;
/** MCTS config used by the baseline agent during eval */
export const EVAL_BASELINE_MCTS_CONFIG = new mcts.MctsConfig<
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
export const EVAL_MCTS_CONFIG = new mcts.MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({ ...mctsConfigDefaults, modelValueWeight: 1 });
