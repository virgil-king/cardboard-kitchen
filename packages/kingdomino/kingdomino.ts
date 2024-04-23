import { Game, Players } from "game";
import { KingdominoState } from "./state.js";
import * as Proto from "kingdomino-proto";
import _ from "lodash";
import {
  dealOffer,
  playerCountToConfiguration,
} from "./base.js";
import { tiles } from "./tiles.js";

export class Kingdomino implements Game<KingdominoState> {
  playerCounts(): number[] {
    return [2, 3, 4];
  }

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  newGame(players: Players): KingdominoState {
    const protoPlayers: Proto.PlayerState[] = players.players.map((player) => {
      return {
        id: player.id,
        name: player.name,
        locationEntry: [],
      };
    });
    const playerCount = players.players.length;
    const config = playerCountToConfiguration.get(playerCount);
    const allTileNumbers = _.range(1, tiles.length + 1);
    const shuffledTiles = _.shuffle(allTileNumbers).slice(0, config.tileCount);
    const firstOffer = dealOffer(
      config.firstRoundTurnOrder.length,
      shuffledTiles
    );
    return new KingdominoState(
      {
        previousOffers: undefined,
        nextOffers: firstOffer,
        remainingTiles: shuffledTiles,
        playerState: protoPlayers,
      },
      new Map(players.players.map((player) => [player.id, player]))
    );
  }
}
