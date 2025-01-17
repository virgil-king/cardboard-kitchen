This project provides a framework for implementing rules, machine learning, and web interfaces for board games. It uses TypeScript and TensorflowJS so board game rules and AI opponents can run on a workstation for training and in a browser for low-latency and offline play.

The currently implemented game is Kingdomino.

Training quick start:
1. Install Node.js and pnpm
2. Run `pnpm install` in the repository root to install all npm dependencies
3. `cd packages/kingdomino-training`
4. `pnpm exec turbo build && node --max-old-space-size=64000 out/run-training.js`

These steps will start or continue the training experiment defined in `packages/kingdomino-training/config.ts`, reading and writing files in `~/ckdata/experiments/${experimentName}`.

Training uses the following workers/threads:
1. N workers continuously generate self-play episodes using the most recent model delivered to them
2. One worker runs a set of evaluation episodes using each model delivered to it and saves the results to a log file in the experiment data directory
3. The main thread waits until it has a sufficient buffer of self-play episodes from previous training sessions and the current self-play workers and then begins training the current model using state samples from that buffer, occasionally snapshotting the model and sending copies to the self-play and evalution workers

`packages/kingdomino-ui` contains a NextJS project that can be used to browse training data and play against models.