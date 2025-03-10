import {
  ChanceKey,
  combineHashes,
  decodeOrThrow,
  drawN,
  EpisodeConfiguration,
  GameState,
  NO_CHANCE,
  Player,
  PlayerValues,
  requireDefined,
  scoresToPlayerValues,
} from "game";
import { LocationProperties, Tile, tileNumbersSet } from "./tile.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
  tileOffersCodec,
} from "./base.js";
import { Direction } from "./util.js";
import { List, Map, Seq, Set, ValueObject, hash } from "immutable";
import _ from "lodash";
import { PlayerBoard, playerBoardCodec } from "./board.js";
import * as io from "io-ts";
import { KingdominoAction } from "./action.js";
import { Vector2 } from "game";

const playerStateCodec = io.type({
  board: playerBoardCodec,
  bonusPoints: io.number,
  /**
   * For historical reasons this value is the sum of board score and bonus points.
   * It should be changed to only reflect board score when it's a good time to
   * break JSON compatibility.
   *
   * Board score can be derived from the board itself but doing so is expensive
   * compared to storing this integer.
   */
  score: io.number,
});

type PlayerStateMessage = io.TypeOf<typeof playerStateCodec>;

export class KingdominoPlayerState implements ValueObject {
  constructor(
    readonly board: PlayerBoard,
    private readonly boardScore: number,
    private readonly bonusPoints: number
  ) {}
  get score(): number {
    return this.boardScore + this.bonusPoints;
  }
  withBoard(board: PlayerBoard): KingdominoPlayerState {
    return new KingdominoPlayerState(board, board.score(), this.bonusPoints);
  }
  withBonusPoints(bonusPoints: number): KingdominoPlayerState {
    return new KingdominoPlayerState(this.board, this.boardScore, bonusPoints);
  }
  encode(): PlayerStateMessage {
    return {
      board: this.board.encode(),
      bonusPoints: this.bonusPoints,
      score: this.boardScore + this.bonusPoints,
    };
  }
  static decode(encoded: any): KingdominoPlayerState {
    const decoded = decodeOrThrow(playerStateCodec, encoded);
    return new KingdominoPlayerState(
      PlayerBoard.decode(decoded.board),
      decoded.score - decoded.bonusPoints,
      decoded.bonusPoints
    );
  }
  equals(other: unknown): boolean {
    if (!(other instanceof KingdominoPlayerState)) {
      return false;
    }
    return (
      this.board.equals(other.board) &&
      this.boardScore == other.boardScore &&
      this.bonusPoints == other.bonusPoints
    );
  }
  hashCode(): number {
    return combineHashes(this.board.hashCode(), hash(this.bonusPoints));
  }
}

export enum NextAction {
  CLAIM_OFFER = "CLAIM_OFFER",
  RESOLVE_OFFER = "RESOLVE_OFFER",
}

const nextActionJson = io.union([
  io.literal(NextAction.CLAIM_OFFER),
  io.literal(NextAction.RESOLVE_OFFER),
]);

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
  playerIdToState: io.array(io.tuple([io.string, playerStateCodec])),
  currentPlayerId: io.union([io.string, io.undefined]),
  nextAction: io.union([nextActionJson, io.undefined]),
  drawnTileNumbers: io.array(io.number),
  previousOffers: io.union([tileOffersCodec, io.undefined]),
  nextOffers: io.union([tileOffersCodec, io.undefined]),
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
          new KingdominoPlayerState(new PlayerBoard(Map()), 0, 0),
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

  encode(): PropsJson {
    return {
      playerIdToState: this.props.playerIdToState
        .entrySeq()
        .map<[string, PlayerStateMessage]>(([key, value]) => [
          key,
          value.encode(),
        ])
        .toArray(),
      currentPlayerId: this.props.currentPlayerId,
      nextAction: this.props.nextAction,
      drawnTileNumbers: this.props.drawnTileNumbers.toArray(),
      previousOffers:
        this.props.previousOffers == undefined
          ? undefined
          : this.props.previousOffers.encode(),
      nextOffers:
        this.props.nextOffers == undefined
          ? undefined
          : this.props.nextOffers.encode(),
      offsetInScriptedTileNumbers: this.props.offsetInScriptedTileNumbers,
    };
  }

  static decode(encoded: any): KingdominoState {
    const decoded = decodeOrThrow(propsJson, encoded);
    return new KingdominoState({
      playerIdToState: Map(
        decoded.playerIdToState.map(([playerId, state]) => [
          playerId,
          KingdominoPlayerState.decode(state),
        ])
      ),
      currentPlayerId: decoded.currentPlayerId,
      nextAction:
        decoded.nextAction == undefined
          ? undefined
          : NextAction[decoded.nextAction],
      drawnTileNumbers: Set(decoded.drawnTileNumbers),
      previousOffers:
        decoded.previousOffers == undefined
          ? undefined
          : TileOffers.decode(decoded.previousOffers),
      nextOffers:
        decoded.nextOffers == undefined
          ? undefined
          : TileOffers.decode(decoded.nextOffers),
      offsetInScriptedTileNumbers: decoded.offsetInScriptedTileNumbers,
    });
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

  withCurrentPlayer(player: Player | undefined): KingdominoState {
    return new KingdominoState({ ...this.props, currentPlayerId: player?.id });
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
      if (remainingTileCount == 0) {
        // End of game
        return [this.withNoNextOffers(), NO_CHANCE];
      } else if (remainingTileCount < config.turnsPerRound) {
        throw new Error("Tile count was not a multiple of turns per round");
      } else {
        const remainingTiles = tileNumbersSet
          .subtract(this.props.drawnTileNumbers)
          .toArray();
        const tileNumbers = drawN(remainingTiles, config.turnsPerRound);
        tileNumbers.sort((a, b) => a - b);

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

  withBonusPoints(playerId: string, points: number): KingdominoState {
    const newPlayerState =
      this.requirePlayerState(playerId).withBonusPoints(points);
    return new KingdominoState({
      ...this.props,
      playerIdToState: this.props.playerIdToState.set(playerId, newPlayerState),
    });
  }

  *possibleActions(): Generator<KingdominoAction> {
    const nextAction = this.nextAction;
    switch (nextAction) {
      case undefined:
        throw new Error(`No next action`);
      case NextAction.CLAIM_OFFER: {
        yield* this.possibleClaims();
        break;
      }
      case NextAction.RESOLVE_OFFER: {
        yield KingdominoAction.discardTile();
        for (const placement of this.possiblePlacements()) {
          yield KingdominoAction.placeTile(placement);
        }
        break;
      }
      default:
        throw new Error(
          `Unexpected case ${nextAction}; state is ${JSON.stringify(this)}`
        );
    }
  }

  private *possibleClaims(): Generator<KingdominoAction> {
    for (const [index, offer] of requireDefined(
      this.props.nextOffers?.offers?.entries()
    )) {
      if (!offer.isClaimed()) {
        yield KingdominoAction.claimTile(new ClaimTile(index));
      }
    }
  }

  /**
   * Returns all of the legal placements available from {@link state}
   */
  // Visible for testing
  *possiblePlacements(): Generator<PlaceTile> {
    const currentPlayerBoard = this.requireCurrentPlayerState().board;
    const previousOffers = this.props.previousOffers;
    if (previousOffers == undefined) {
      // First round; can't place anything
      return;
    }
    const firstUnplacedOfferTileNumber = Seq(previousOffers.offers)
      .map((offer) => offer.tileNumber)
      .find((tileNumber) => tileNumber != undefined);
    if (firstUnplacedOfferTileNumber == undefined) {
      // All tiles already placed
      return;
    }
    const tile = Tile.withNumber(firstUnplacedOfferTileNumber);
    for (const adjacentLocation of currentPlayerBoard.adjacentEmptyLocations()) {
      for (const direction of Direction.values()) {
        const square0Placement = new PlaceTile(adjacentLocation, direction);
        if (currentPlayerBoard.isPlacementAllowed(square0Placement, tile)) {
          yield square0Placement;
        }
        const square1Placement = square0Placement.flip();
        if (currentPlayerBoard.isPlacementAllowed(square1Placement, tile)) {
          yield square1Placement;
        }
      }
    }
  }
}
