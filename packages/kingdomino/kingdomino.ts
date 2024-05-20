import { EpisodeConfiguration, Game, Players } from "game";
import { KingdominoState } from "./state.js";
import _ from "lodash";

import { KingdominoAction } from "./action.js";
import { KingdominoEpisode } from "./episode.js";
import { Tensor, Rank } from "@tensorflow/tfjs-node-gpu";
import { KingdominoConfiguration } from "./base.js";

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
    config: EpisodeConfiguration,
    shuffledTileNumbers: Array<number> | undefined = undefined
  ): KingdominoEpisode {
    return new KingdominoEpisode(
      config,
      new KingdominoConfiguration(
        config.players.players.count(),
        shuffledTileNumbers
      )
    );
  }
}
