import { MctsConfig } from "training";
import { RandomKingdominoAgent } from "./randomplayer.js";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";

// This file contains configuration for self-play, training, and eval

const randomAgent = new RandomKingdominoAgent();
export const SELF_PLAY_MCTS_CONFIG = new MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: 128,
  modelValueWeight: 1,
});
export const SELF_PLAY_EPISODES_PER_BATCH = 32;
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
const evalSimulationCount = 128;
/** MCTS config used by the baseline agent during eval */
export const EVAL_BASELINE_MCTS_CONFIG = new MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: evalSimulationCount,
  randomPlayoutConfig: {
    weight: 1,
    agent: randomAgent,
  },
});
/** MCTS config used by the subject agent during eval */
export const EVAL_MCTS_CONFIG = new MctsConfig<
  KingdominoConfiguration,
  KingdominoState,
  KingdominoAction
>({
  simulationCount: evalSimulationCount,
  modelValueWeight: 1,
});
