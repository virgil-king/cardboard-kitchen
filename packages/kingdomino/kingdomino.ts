import { Game, Players } from "game";
import { KingdominoState } from "./state.js";
import _ from "lodash";

import { KingdominoAction } from "./action.js";
import { KingdominoEpisode } from "./generator.js";
import { Tensor, Rank } from "@tensorflow/tfjs-node-gpu";

export class Kingdomino implements Game<KingdominoState, KingdominoAction> {
  tensorToAction(tensor: Tensor<Rank>): KingdominoAction {
    throw new Error("Method not implemented.");
  }
  playerCounts = [2, 3, 4];

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  /**
   * @param shuffledTileNumbers shuffled tiles to use instead of a random shuffle of all tiles
   */
  newEpisode(
    players: Players,
    shuffledTileNumbers?: Array<number>
  ): KingdominoEpisode {
    return new KingdominoEpisode(players, shuffledTileNumbers);
  }
}
