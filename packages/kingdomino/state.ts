import {
  ChanceKey,
  EpisodeConfiguration,
  GameState,
  NO_CHANCE,
  Player,
  // PlayerState,
  PlayerValues,
  scoresToPlayerValues,
} from "game";
import { LocationProperties, Tile, tileNumbersSet } from "./tile.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
  tileOffersJson,
} from "./base.js";
import { Vector2 } from "./util.js";

import { List, Map, Set } from "immutable";
import _ from "lodash";
import { PlayerBoard, playerBoardJson } from "./board.js";
import { Rank, Tensor } from "@tensorflow/tfjs-node-gpu";
import { requireDefined, drawN } from "studio-util";
import * as io from "io-ts";

export class KingdominoPlayerState {
  readonly score: number;
  constructor(readonly board: PlayerBoard) {
    this.score = board.score();
  }
  withBoard(board: PlayerBoard): KingdominoPlayerState {
    return new KingdominoPlayerState(board);
  }
}

export enum NextAction {
  CLAIM_OFFER,
  RESOLVE_OFFER,
}

export const nextActions: ReadonlyArray<NextAction> = [
  NextAction.CLAIM_OFFER,
  NextAction.RESOLVE_OFFER,
];

export type Props = {
  readonly playerIdToState: Map<string, KingdominoPlayerState>;
  readonly currentPlayerId?: string;
  readonly nextAction?: NextAction;
  /** Tiles that have been drawn from the tile supply */
  readonly drawnTileNumbers: Set<number>;
  readonly previousOffers?: TileOffers;
  readonly nextOffers?: TileOffers;
  /** Only for scripted test games */
  readonly offsetInScriptedTileNumbers?: number;
};

export const propsJson = io.type({
  playerIdToState: io.array(io.tuple([io.string, playerBoardJson])),
  currentPlayerId: io.union([io.string, io.undefined]),
  nextAction: io.union([io.string, io.undefined]),
  drawnTileNumbers: io.array(io.number),
  previousOffers: io.union([tileOffersJson, io.undefined]),
  nextOffers: io.union([tileOffersJson, io.undefined]),
  offsetInScriptedTileNumbers: io.union([io.number, io.undefined]),
});

type PropsJson = io.TypeOf<typeof propsJson>;

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
    episodeConfiguration: EpisodeConfiguration,
    kingdominoConfig: KingdominoConfiguration
  ): KingdominoState {
    const playerCount = episodeConfiguration.players.players.count();
    // Ignore chance key from initial offer deal
    const [state] = new KingdominoState({
      playerIdToState: Map(
        episodeConfiguration.players.players.map((player) => [
          player.id,
          new KingdominoPlayerState(new PlayerBoard(Map())),
        ])
      ),
      currentPlayerId: episodeConfiguration.players.players.get(0)?.id,
      nextAction: NextAction.CLAIM_OFFER,
      drawnTileNumbers: Set(),
      offsetInScriptedTileNumbers:
        kingdominoConfig.scriptedTileNumbers == undefined ? undefined : 0,
    }).withNewNextOffers(kingdominoConfig);
    return state;
  }

  constructor(readonly props: Props) {}

  get gameOver(): boolean {
    return this.nextAction == undefined;
  }

  get result(): PlayerValues | undefined {
    if (!this.gameOver) {
      return undefined;
    }
    return scoresToPlayerValues(
      this.props.playerIdToState.map((state) => state.score)
    );
  }

  // private playerCount(): number {
  //   return this.props.playerIdToState.size;
  // }

  get currentPlayerId(): string | undefined {
    return this.props.currentPlayerId;
  }

  get nextAction(): NextAction | undefined {
    return this.props.nextAction;
  }

  requireCurrentPlayerId(): string {
    const result = this.currentPlayerId;
    if (result == undefined) {
      throw new Error(`Current player was undefined`);
    }
    return result;
  }

  requirePlayerState(playerId: string): KingdominoPlayerState {
    const result = this.props.playerIdToState.get(playerId);
    if (result == undefined) {
      throw new Error(`Player state not found`);
    }
    return result;
  }

  requireCurrentPlayerState(): KingdominoPlayerState {
    return this.requirePlayerState(this.requireCurrentPlayerId());
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return this.requirePlayerState(player.id).board.getLocationState(location);
  }

  isFirstRound(): boolean {
    return !this.gameOver && this.props.previousOffers == undefined;
  }

  isLastRound(): boolean {
    return !this.gameOver && this.props.nextOffers == undefined;
  }

  // State updating methods

  withCurrentPlayer(player: Player): KingdominoState {
    return new KingdominoState({ ...this.props, currentPlayerId: player.id });
  }

  withNextAction(nextAction: NextAction | undefined): KingdominoState {
    return new KingdominoState({ ...this.props, nextAction: nextAction });
  }

  /**
   * Returns `this` updated by setting a claim on an offer
   */
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
    previousOffers = previousOffers.withTileAndClaimRemoved(offerIndex);
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
   * Returns a copy with new next offers
   */
  withNewNextOffers(
    config: KingdominoConfiguration
    // scriptedTileNumbers: Array<number> | undefined
  ): [KingdominoState, ChanceKey] {
    const scriptedTileNumbers = config.scriptedTileNumbers;
    if (scriptedTileNumbers != undefined) {
      const offset = requireDefined(this.props.offsetInScriptedTileNumbers);
      const remainingScriptedTileCount = scriptedTileNumbers.length - offset;
      if (remainingScriptedTileCount == 0) {
        return [this.withNoNextOffers(), NO_CHANCE];
      } else if (remainingScriptedTileCount < config.turnsPerRound) {
        throw new Error(
          "Number of scripted tiles didn't equal turns per round"
        );
      } else {
        const newOffset = offset + config.turnsPerRound;
        return [
          this.withNextOfferTileNumbers(
            scriptedTileNumbers.slice(offset, newOffset),
            newOffset
          ),
          NO_CHANCE,
        ];
      }
    } else {
      const remainingTileCount =
        config.tileCount - this.props.drawnTileNumbers.count();
      // console.log(`remainingTileCount is ${remainingTileCount}`);
      if (remainingTileCount == 0) {
        // End of game
        return [this.withNoNextOffers(), NO_CHANCE];
      } else if (remainingTileCount < config.turnsPerRound) {
        throw new Error("Tile count was not a multiple of turns per round");
      } else {
        const remainingTiles = tileNumbersSet
          .subtract(this.props.drawnTileNumbers)
          .toArray();
        // console.log(`remainingTiles is ${JSON.stringify(remainingTiles)}`);
        const tileNumbers = drawN(remainingTiles, config.turnsPerRound);
        // The tile numbers themselves are a minimal representation of the
        // chance involved in this transition
        return [this.withNextOfferTileNumbers(tileNumbers), tileNumbers];
      }
    }
  }

  withNoNextOffers(): KingdominoState {
    // console.log(`No next offers`);
    return new KingdominoState({ ...this.props, nextOffers: undefined });
  }

  withNextOfferTileNumbers(
    tileNumbers: Array<number>,
    offsetInScriptedTileNumbers: number | undefined = undefined
  ): KingdominoState {
    // console.log(`tileNumbers=${JSON.stringify(tileNumbers)}`);
    let nextOffers = new TileOffers(
      List(tileNumbers.map((tileNumber) => new TileOffer(tileNumber)))
    );
    let drawnTileNumbers = this.props.drawnTileNumbers.union(tileNumbers);
    return new KingdominoState({
      ...this.props,
      nextOffers: nextOffers,
      drawnTileNumbers: drawnTileNumbers,
      offsetInScriptedTileNumbers: offsetInScriptedTileNumbers,
    });
  }
}
