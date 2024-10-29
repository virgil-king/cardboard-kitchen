import {
  KingdominoConfiguration,
} from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Agent } from "game";
import { requireDefined } from "studio-util";

import { KingdominoSnapshot } from "./kingdomino.js";

export class RandomKingdominoAgent
  implements Agent<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  act(snapshot: KingdominoSnapshot): KingdominoAction {
    return requireDefined(streamingRandom(snapshot.state.possibleActions()));
  }
}

interface Rng {
  /** Returns a number between 0 and 1 */
  random(): number;
}

const platformRng: Rng = {
  random: function (): number {
    return Math.random();
  },
};

/**
 * Returns a random item from {@link stream} or undefined if the stream is empty
 */
export function streamingRandom<T>(
  stream: Generator<T>,
  rng: Rng = platformRng
): T | undefined {
  let count = 0;
  let result: T | undefined = undefined;
  for (let item of stream) {
    count++;
    const random = rng.random();
    if (random < 1 / count) {
      result = item;
    }
  }
  return result;
}
