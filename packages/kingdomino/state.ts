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
import { requireDefined, drawN } from "studio-util";

export class KingdominoPlayerState {
  constructor(
    readonly gameState: PlayerState,
    readonly board: PlayerBoard
  ) {}
  withBoard(board: PlayerBoard): KingdominoPlayerState {
    return new KingdominoPlayerState(
      this.gameState.withScore(board.score()),
      board
    );
  }
}

export enum NextAction {
  CLAIM_OFFER,
  RESOLVE_OFFER,
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
  static newGame(episodeConfiguration: EpisodeConfiguration): KingdominoState {
    const playerCount = episodeConfiguration.players.players.count();
    return new KingdominoState({
      playerIdToState: Map(
        episodeConfiguration.players.players.map((player) => [
          player.id,
          new KingdominoPlayerState(new PlayerState(0), new PlayerBoard(Map())),
        ])
      ),
      currentPlayer: episodeConfiguration.players.players.get(0),
      nextAction: NextAction.CLAIM_OFFER,
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
      throw Error(`Invalid placement: ${JSON.stringify(placement)}`);
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
   *
   * @param tileNumbers scripted tile numbers for the new offer or undefined if
   * tiles are not scripted
   */
  withNewNextOffers(
    config: KingdominoConfiguration,
    tileNumbers: Array<number> | undefined
  ): KingdominoState {
    if (tileNumbers != undefined) {
      if (tileNumbers.length == 0) {
        return this.withNoNextOffers();
      } else if (tileNumbers.length != config.turnsPerRound) {
        throw new Error(
          "Number of scripted tiles didn't equal turns per round"
        );
      } else {
        return this.withNextOfferTileNumbers(tileNumbers);
      }
    } else {
      const remainingTileCount =
        config.tileCount - this.props.drawnTileNumbers.count();
      if (remainingTileCount == 0) {
        // End of game
        return this.withNoNextOffers();
      } else if (remainingTileCount < config.turnsPerRound) {
        throw new Error("Tile count was not a multiple of turns per round");
      } else {
        const remainingTiles = tileNumbersSet
          .subtract(this.props.drawnTileNumbers)
          .toArray();
        tileNumbers = drawN(remainingTiles, config.turnsPerRound);
        return this.withNextOfferTileNumbers(tileNumbers);
      }
    }
  }

  withNoNextOffers(): KingdominoState {
    // console.log(`No next offers`);
    return new KingdominoState({ ...this.props, nextOffers: undefined });
  }

  withNextOfferTileNumbers(tileNumbers: Array<number>): KingdominoState {
    // console.log(`tileNumbers=${JSON.stringify(tileNumbers)}`);
    let nextOffers = new TileOffers(
      List(tileNumbers.map((tileNumber) => new TileOffer(tileNumber)))
    );
    let drawnTileNumbers = this.props.drawnTileNumbers.union(tileNumbers);
    return new KingdominoState({
      ...this.props,
      nextOffers: nextOffers,
      drawnTileNumbers: drawnTileNumbers,
    });
  }
}
