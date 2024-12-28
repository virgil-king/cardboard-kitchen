import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Agent, requireDefined, streamingRandom } from "game";

import { KingdominoSnapshot } from "./kingdomino.js";

export class RandomKingdominoAgent
  implements Agent<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  act(snapshot: KingdominoSnapshot): Promise<KingdominoAction> {
    return Promise.resolve(
      requireDefined(streamingRandom(snapshot.state.possibleActions()))
    );
  }
}
