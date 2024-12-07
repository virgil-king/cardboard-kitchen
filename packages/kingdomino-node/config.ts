import { mcts } from "mcts";
import {
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
  RandomKingdominoAgent,
} from "kingdomino";
import { Experiment } from "training";

// This file contains configuration for self-play, training, and eval

export const kingdominoConv7 = new Experiment({
  name: "kingdomino-conv7",
  selfPlayEpisodesPerBatch: 128,
  selfPlayWorkerCount: 1,

  trainingBatchSize: 128,

  evalEpisodesPerBatch: 128,
  evalBatchCount: 1,
});

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
