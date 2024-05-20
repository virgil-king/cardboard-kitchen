import { EpisodeConfiguration, GameState, Player, PlayerState } from "game";
import { LocationProperties, Tile, tileNumbersSet } from "./tile.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
} from "./base.js";
import { Vector2 } from "./util.js";

import { List, Map, Set } from "immutable";
import _, { shuffle } from "lodash";
import { PlayerBoard } from "./board.js";
import { Rank, Tensor } from "@tensorflow/tfjs-node-gpu";
import { requireDefined } from "studio-util";

export class KingdominoPlayerState {
  constructor(
    // readonly player: Player,
    readonly gameState: PlayerState,
    readonly board: PlayerBoard
  ) {}
  withBoard(board: PlayerBoard): KingdominoPlayerState {
    return new KingdominoPlayerState(
      // this.player,
      this.gameState.withScore(board.score()),
      board
    );
  }
}

export enum NextAction {
  CLAIM,
  PLACE,
}

export type Props = {
  readonly playerIdToState: Map<string, KingdominoPlayerState>;
  readonly currentPlayer?: Player;
  readonly nextAction?: NextAction;
  /** Tiles that have been drawn from the tile supply */
  readonly drawnTileNumbers: Set<number>;
  readonly previousOffers?: TileOffers;
  readonly nextOffers?: TileOffers;
};

/**
 * This class provides convenience methods for inspecting and updating game state.
 *
 * It is not responsible for maintaining state invariants.
 */
export class KingdominoState implements GameState {
  /**
   * Returns initial state for an episode with the given configuration.
   * 
   * Does not populate the initial offers.
   */
  static newGame(
    episodeConfiguration: EpisodeConfiguration
  ): KingdominoState {
    const playerCount = episodeConfiguration.players.players.count();
    return new KingdominoState({
      playerIdToState: Map(
        episodeConfiguration.players.players.map((player) => [
          player.id,
          new KingdominoPlayerState(
            new PlayerState(0),
            new PlayerBoard(Map())
          ),
        ])
      ),
      currentPlayer: episodeConfiguration.players.players.get(0),
      nextAction: NextAction.CLAIM,
      drawnTileNumbers: Set(),
    });
  }

  constructor(readonly props: Props) {}

  asTensor(): Tensor<Rank> {
    throw new Error("Method not implemented.");
  }

  get gameOver(): boolean {
    return this.nextAction == undefined;
  }

  playerState(playerId: string): PlayerState {
    return requireDefined(this.props.playerIdToState.get(playerId)).gameState;
  }

  private playerCount(): number {
    return this.props.playerIdToState.size;
  }

  get currentPlayer(): Player | undefined {
    return this.props.currentPlayer;
  }

  get nextAction(): NextAction | undefined {
    return this.props.nextAction;
  }

  requireCurrentPlayer(): Player {
    const result = this.currentPlayer;
    if (result == undefined) {
      throw new Error(`Current player was undefined`);
    }
    return result;
  }

  requirePlayerState(player: Player): KingdominoPlayerState {
    const result = this.props.playerIdToState.get(player.id);
    if (result == undefined) {
      throw new Error(`Player state not found`);
    }
    return result;
  }

  requireCurrentPlayerState(): KingdominoPlayerState {
    return this.requirePlayerState(this.requireCurrentPlayer());
  }

  // requirePlayer(playerId: string): Player {
  //   return requireDefined(this.props.playerIdToState.get(playerId)).player;
  // }

  toJson(): string {
    throw new Error("Method not implemented.");
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return this.requirePlayerState(player).board.getLocationState(location);
  }

  isFirstRound(): boolean {
    return !this.gameOver && this.props.previousOffers == undefined;
  }

  isLastRound(): boolean {
    return !this.gameOver && this.props.nextOffers == undefined;
  }

  canDealNewOffer(tileCount: number, turnsPerRound: number): boolean {
    const remainingTileCount = tileCount - this.props.drawnTileNumbers.size;
    return remainingTileCount >= turnsPerRound;
  }

  // State updating methods

  withCurrentPlayer(player: Player): KingdominoState {
    return new KingdominoState({ ...this.props, currentPlayer: player });
  }

  withNextAction(nextAction: NextAction | undefined): KingdominoState {
    return new KingdominoState({ ...this.props, nextAction: nextAction });
  }

  withClaim(player: Player, claimTile: ClaimTile): KingdominoState {
    const nextOffers = requireDefined(this.props.nextOffers);
    if (nextOffers.offers.get(claimTile.offerIndex)?.isClaimed()) {
      throw new Error(
        `Tried to claim already claimed offer ${claimTile.offerIndex}`
      );
    }
    return new KingdominoState({
      ...this.props,
      nextOffers: nextOffers.withTileClaimed(claimTile.offerIndex, player),
    });
  }

  /**
   * Returns `this` updated by removing the previous offer with index {@link offerIndex}
   */
  withPreviousOfferRemoved(offerIndex: number) {
    let previousOffers = requireDefined(this.props.previousOffers);
    previousOffers = previousOffers.withTileRemoved(offerIndex);
    return new KingdominoState({
      ...this.props,
      previousOffers: previousOffers,
    });
  }

  /**
   * Returns `this` updated by removing the placed tile from previous offers and
   * applying it to the current player's board state
   */
  withPlacement(
    player: Player,
    placement: PlaceTile,
    tileNumber: number
  ): KingdominoState {
    const tile = Tile.withNumber(tileNumber);
    const playerState = requireDefined(
      this.props.playerIdToState.get(player.id)
    );
    const currentPlayerBoard = playerState.board;

    // Check placement legality
    if (!currentPlayerBoard.isPlacementAllowed(placement, tile)) {
      throw Error(`Invalid placement: ${placement}`);
    }

    // Update the board
    let board = currentPlayerBoard.withTile(placement, tileNumber);
    const playerIdToState = this.props.playerIdToState.set(
      player.id,
      playerState.withBoard(board)
    );
    return new KingdominoState({
      ...this.props,
      playerIdToState: playerIdToState,
    });
  }

  withPreviousOffers(offers: TileOffers): KingdominoState {
    return new KingdominoState({ ...this.props, previousOffers: offers });
  }

  /**
   * Returns a copy with new offers
   */
  withNewNextOffers(
    turnCount: number,
    tileNumbers: Array<number> | undefined = undefined
  ): KingdominoState {
    // const turnCount = this.configuration().turnsPerRound;
    if (tileNumbers == undefined) {
      const remainingTiles = shuffle(
        tileNumbersSet.subtract(this.props.drawnTileNumbers).toArray()
      );
      tileNumbers = remainingTiles.slice(0, turnCount);
    }
    const offers = new TileOffers(
      List(tileNumbers.map((tileNumber) => new TileOffer(tileNumber)))
    );
    return new KingdominoState({
      ...this.props,
      nextOffers: offers,
      drawnTileNumbers: this.props.drawnTileNumbers.union(tileNumbers),
    });
  }
}

/**
 * Returns an offer consisting of `turnCount` tiles from the end of
 * `tileNumbers` and the new set of remaining tiles.
 */
// export function dealOffer(
//   turnCount: number,
//   remainingTiles: List<number>
// ): [TileOffers, List<number>] {
//   let offers = List<TileOffer>();
//   for (let i = 0; i < turnCount; i++) {
//     const tileNumber = remainingTiles.get(remainingTiles.size - 1 - i);
//     offers = offers.push(new TileOffer(tileNumber));
//   }
//   return [new TileOffers(offers), remainingTiles.slice(0, -turnCount)];
// }
  