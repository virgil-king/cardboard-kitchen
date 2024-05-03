import { Episode, Game, PlayerResult, Players, Transcript } from "game";
import { KingdominoState, NextAction, PlayerState, Props } from "./state.js";
import _ from "lodash";
import { PlayerBoard, dealOffer, getConfiguration } from "./base.js";
import { tiles } from "./tile.js";

import { List, Map } from "immutable";
import { KingdominoAction } from "./action.js";
import { requireDefined } from "./util.js";

export class Kingdomino implements Game<KingdominoState, KingdominoAction> {
  playerCounts = [2, 3, 4];

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  /**
   * @param shuffledTileNumbers shuffled tiles to use instead of a random shuffle of all tiles
   */
  newGame(
    players: Players,
    shuffledTileNumbers?: Array<number>
  ): KingdominoEpisode {
    const initialState = new KingdominoState(
      this.setupGame(players, shuffledTileNumbers)
    );
    return new KingdominoEpisode(initialState);
    // const generator = this.play(players, shuffledTileNumbers);
    // return generator.next().value;
  }

  // *play(
  //   players: Players,
  //   shuffledTileNumbers?: Array<number>
  // ): Episode<KingdominoState, KingdominoAction> {
  //   let props = this.setupGame(players, shuffledTileNumbers);

  //   // First round
  //   for (const [index, player] of players.players.entries()) {
  //     props = { ...props, currentPlayer: player };
  //     const action = yield new KingdominoState(props);
  //     if (action.player.id != player.id) {
  //       throw new Error(
  //         `Expected move from ${player} but got ${action.player}`
  //       );
  //     }
  //     if (action.props.placeTile) {
  //       throw new Error(`Can't place tiles in the first round`);
  //     }
  //     const claim = action.props.claimTile;
  //     if (!claim) {
  //       throw new Error("Must claim tile in the first round");
  //     }
  //     props = {
  //       ...props,
  //       nextOffers: requireDefined(props.nextOffers)?.withTileClaimed(
  //         claim.offerIndex,
  //         player
  //       ),
  //     };
  //   }

  //   return new KingdominoState(props);
  //   // Non-final rounds
  //   // while (props.remainingTiles.count() > 0) {
  //   //   const claimPlayerIds = requireDefined(props.previousOffers).offers
  //   //     .m;
  //   // }

  //   // // Final round

  //   // return state;
  //   // let state = this.newGame(players, shuffledTileNumbers);
  //   // while (state.result() == undefined) {
  //   //   // console.log(`Yielding`);
  //   //   const action = yield state;
  //   //   // console.log(`Received action ${action}`);
  //   //   state = action.apply(state);
  //   // }
  //   // return state;
  // }

  setupGame(players: Players, shuffledTileNumbers?: Array<number>): Props {
    const playerCount = players.players.length;
    const config = getConfiguration(playerCount);
    let shuffledTiles: Array<number>;
    if (shuffledTileNumbers) {
      shuffledTiles = shuffledTileNumbers;
    } else {
      const allTileNumbers = _.range(1, tiles.length + 1);
      shuffledTiles = _.shuffle(allTileNumbers);
    }
    const [firstOffer, remainingTiles] = dealOffer(
      config.firstRoundTurnOrder.length,
      List(shuffledTiles)
    );
    return {
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
    };
  }
}

class KingdominoEpisode implements Episode<KingdominoState, KingdominoAction> {
  transcript: Transcript<KingdominoState, KingdominoAction>;
  currentState: KingdominoState;
  constructor(readonly initialState: KingdominoState) {
    this.currentState = initialState;
    this.transcript = new Transcript(initialState);
  }
  apply(action: KingdominoAction): KingdominoState {
    const newState = action.apply(this.currentState);
    this.currentState = newState;
    this.transcript.steps.push([action, newState]);
    return newState;
  }
}
