import { Game, Players } from "game";
import { KingdominoState, NextAction, PlayerState } from "./state.js";
import _ from "lodash";
import { PlayerBoard, dealOffer, getConfiguration, playerCountToConfiguration } from "./base.js";
import { tiles } from "./tile.js";

import { List, Map } from "immutable";

export class Kingdomino implements Game<KingdominoState> {
  playerCounts(): number[] {
    return [2, 3, 4];
  }

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  newGame(players: Players): KingdominoState {
    const playerCount = players.players.length;
    const config = getConfiguration(playerCount);
    const allTileNumbers = _.range(1, tiles.length + 1);
    const shuffledTiles = _.shuffle(allTileNumbers).slice(0, config.tileCount);
    const [firstOffer, remainingTiles] = dealOffer(
      config.firstRoundTurnOrder.length,
      List(shuffledTiles)
    );
    return new KingdominoState({
      configuration: config,
      players: players,
      playerIdToState: Map(
        players.players.map((player) => [
          player.id,
          new PlayerState(player, new PlayerBoard(Map())),
        ])
      ),
      currentPlayer: players.players[0],
      nextAction: NextAction.CLAIM,
      nextOffers: firstOffer,
      remainingTiles: remainingTiles,
    });
  }
}
