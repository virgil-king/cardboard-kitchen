import { KingdominoConfiguration } from "./base.js";
import { KingdominoState } from "./state.js";
import { KingdominoAction } from "./action.js";
import { Agent } from "game";
import { requireDefined, streamingRandom } from "studio-util";

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
