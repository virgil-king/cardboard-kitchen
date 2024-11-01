import { MctsConfig } from "training";
import { RandomKingdominoAgent } from "./randomplayer.js";

// This file contains configuration for self-play, training, and eval

const randomAgent = new RandomKingdominoAgent();
export const SELF_PLAY_MCTS_CONFIG = new MctsConfig({
  simulationCount: 256,
  randomPlayoutConfig: { weight: 1, agent: randomAgent },
});
// This value should be larger than EVAL_BATCHES * EVAL_EPISODES_PER_BATCH
export const SELF_PLAY_EPISODES_PER_BATCH = 64;
export const SELF_PLAY_WORKER_COUNT = 16;

/** Number of samples per training batch */
export const TRAINING_BATCH_SIZE = 128;
/** Number of samples to retain in memory */
export const TRAINING_SAMPLE_BUFFER_SIZE = 1024 * 1024;
const gbBytes = 1024 * 1024 * 1024;
/** Cap on disk space used for models */
export const TRAINING_MAX_MODEL_BYTES = 16 * gbBytes;
/** Cap on disk space used for self-playe episodes */
export const TRAINING_MAX_EPISODE_BYTES = 64 * gbBytes;

/** Number of episodes per evaluation batch */
export const EVAL_EPISODES_PER_BATCH = 64;
/** Number of evaluation batches per model */
export const EVAL_BATCHES = 1;
const evalSimulationCount = 256;
/** MCTS config used by the baseline agent during eval */
export const EVAL_BASELINE_MCTS_CONFIG = new MctsConfig({
  simulationCount: evalSimulationCount,
  modelValueWeight: undefined,
  randomPlayoutConfig: {
    weight: 1,
    agent: randomAgent,
  },
});
/** MCTS config used by the subject agent during eval */
export const EVAL_MCTS_CONFIG = new MctsConfig({
  simulationCount: evalSimulationCount,
  randomPlayoutConfig: {
    weight: 1,
    agent: randomAgent,
  },
});
