import { GameState, Player, PlayerResult, Players } from "game";
import { LocationProperties, Terrain, Tile } from "./tile.js";
import {
  Configuration,
  PlaceTile,
  PlayerBoard,
  TileOffers,
  adjacentExternalLocations,
  dealOffer,
  getConfiguration,
  maxKingdomSize,
  run,
  squareLocation,
} from "./base.js";
import { Direction, Vector2, assertDefined, requireDefined } from "./util.js";

import { List, Map } from "immutable";
import _ from "lodash";

export class PlayerState {
  constructor(readonly player: Player, readonly board: PlayerBoard) {}
  withBoard(board: PlayerBoard): PlayerState {
    return new PlayerState(this.player, board);
  }
}

export enum NextAction {
  CLAIM,
  PLACE,
  DONE,
}

type Props = {
  readonly configuration: Configuration;
  readonly players: Players;
  readonly playerIdToState: Map<string, PlayerState>;
  readonly currentPlayer?: Player;
  readonly nextAction: NextAction;
  readonly remainingTiles: List<number>;
  readonly previousOffers?: TileOffers;
  readonly nextOffers?: TileOffers;
};

/**
 * Invariant: every instance of this class is a valid game state resulting from a sequence of public method calls.
 */
export class KingdominoState implements GameState<KingdominoState> {
  constructor(readonly props: Props) {}

  private playerCount(): number {
    return this.props.playerIdToState.size;
  }

  configuration(): Configuration {
    return getConfiguration(this.playerCount());
  }

  turnCount(): number {
    return this.configuration().firstRoundTurnOrder.length;
  }

  result(): PlayerResult[] | undefined {
    throw new Error("Method not implemented.");
  }

  currentPlayer(): Player | undefined {
    return this.props.currentPlayer;
  }

  requireCurrentPlayer(): Player {
    const result = this.currentPlayer();
    if (result == undefined) {
      throw new Error(`Current player was undefined`);
    }
    return result;
  }

  requirePlayerState(player: Player): PlayerState {
    const result = this.props.playerIdToState.get(player.id);
    if (result == undefined) {
      throw new Error(`Player state not found`);
    }
    return result;
  }

  requireCurrentPlayerState(): PlayerState {
    return this.requirePlayerState(this.requireCurrentPlayer());
  }

  /**
   * Returns a new state where {@link tileIndex} is claimed by the current player
   */
  claimTile(tileIndex: number): KingdominoState {
    if (this.props.nextOffers == undefined) {
      throw new Error("Invalid action: can't claim a tile in the last round");
    }
    if (this.props.nextAction != NextAction.CLAIM) {
      throw new Error(
        `Invalid action: next action should be ${this.props.nextAction}`
      );
    }

    const currentPlayer = this.requireCurrentPlayer();

    const nextOffers = this.props.nextOffers.withTileClaimed(
      tileIndex,
      currentPlayer
    );
    // If there's another previous offer to place, place it; otherwise it's
    // the first round and the next player will claim their first tile
    const nextAction = run(() => {
      if (this.props.previousOffers == undefined) {
        // First round: can only claim
        return NextAction.CLAIM;
      } else if (
        this.props.previousOffers.offers.some((offer) => offer.hasTile())
      ) {
        // Place the next previously claimed tile
        return NextAction.PLACE;
      } else {
        // It's the end of the round. The next round will start with a claim.
        return NextAction.CLAIM;
      }
    });
    return new KingdominoState(
      handleEndOfTurn({
        ...this.props,
        nextAction: nextAction,
        nextOffers: nextOffers,
      })
    );
  }

  placeTile(placement: PlaceTile) {
    if (this.props.previousOffers == undefined) {
      throw new Error("Invalid action: can't place a tile in the first round");
    }
    if (this.props.nextAction != NextAction.PLACE) {
      throw new Error(
        `Invalid action: next action should be ${this.props.nextAction}`
      );
    }
    const firstUnplacedOfferIndex = requireDefined(
      this.props.previousOffers.offers.findIndex(
        (offer) => offer.tileNumber != undefined
      ),
      "Invalid action: no tile to place"
    );
    const tileNumber = requireDefined(
      this.props.previousOffers.offers.get(firstUnplacedOfferIndex)?.tileNumber,
      `Previous offer `
    );
    const tile = Tile.withNumber(tileNumber);
    const currentPlayer = this.requireCurrentPlayer();
    const currentPlayerState = this.requireCurrentPlayerState();
    const currentPlayerBoard = currentPlayerState.board;

    // Check placement legality
    // const placement = new PlaceTile(location, direction);
    if (!this.isPlacementAllowed(placement, tile, currentPlayerBoard)) {
      throw Error(`Invalid placement: ${placement}`);
    }

    // Successful placement! Remove the tile from the next unplaced offer.
    const previousOffers = this.props.previousOffers.withTileRemoved(
      firstUnplacedOfferIndex
    );

    // Update the two board locations
    let board = currentPlayerBoard.withLocationStateFromTile(
      placement,
      tileNumber,
      0
    );
    board = board.withLocationStateFromTile(placement, tileNumber, 1);
    const playerIdToState = this.props.playerIdToState.set(
      currentPlayer.id,
      currentPlayerState.withBoard(board)
    );
    return new KingdominoState({
      ...this.props,
      previousOffers: previousOffers,
      playerIdToState: playerIdToState,
    });
  }

  isPlacementAllowed(
    placement: PlaceTile,
    tile: Tile,
    board: PlayerBoard
  ): boolean {
    const occupied = board.occupiedRectangle();
    // Each square of the tile must be:
    for (let i = 0; i < 2; i++) {
      const location = squareLocation(placement, i);
      // Not already occupied:
      if (board.getLocationState(location).terrain != Terrain.TERRAIN_EMPTY) {
        return false;
      }
      // Not make the kingdom too tall or wide:
      const updatedRectangle = occupied.extend(location);
      if (
        updatedRectangle.width > maxKingdomSize ||
        updatedRectangle.height > maxKingdomSize
      ) {
        return false;
      }
    }

    // At least one adjacent square must have matching terrain or be the center
    // square:
    for (let i = 0; i < 2; i++) {
      const tileSquareTerrain = Tile.withNumber(tile.number).properties[i]
        .terrain;
      for (let location of adjacentExternalLocations(placement, i)) {
        const adjacentTerrain = board.getLocationState(location).terrain;
        if (
          adjacentTerrain == tileSquareTerrain ||
          adjacentTerrain == Terrain.TERRAIN_CENTER
        ) {
          return true;
        }
      }
    }

    // No terrain matches found
    return false;
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return this.requirePlayerState(player).board.getLocationState(location);
  }
}

/**
 * Returns a copy of {@link props} modified by transitioning to the next round if appropriate
 */
function handleEndOfTurn(props: Props): Props {
  let {
    previousOffers,
    nextOffers,
    remainingTiles,
    nextAction,
    configuration,
  } = props;
  // Update offers if it's the end of a round. Check both round-end conditions to handle first,
  // middle, and last round cases.
  if (isEndOfRound(previousOffers, nextOffers)) {
    previousOffers = nextOffers;
    if (props.remainingTiles.size == 0) {
      // Starting last round
      nextOffers = undefined;
    } else {
      [nextOffers, remainingTiles] = dealOffer(
        configuration.turnCount(),
        remainingTiles
      );
    }
    // The first action in a new non-first round is always place
    nextAction = NextAction.PLACE;
  }
  // Update current player
  const currentPlayer = nextPlayer(previousOffers, nextOffers, props.players);
  return {
    ...props,
    currentPlayer: currentPlayer,
    previousOffers: previousOffers,
    nextOffers: nextOffers,
    remainingTiles: remainingTiles,
  };
}

function nextPlayer(
  previousOffers: TileOffers | undefined,
  nextOffers: TileOffers | undefined,
  players: Players
): Player {
  if (previousOffers == undefined) {
    assertDefined(nextOffers);
    // First round: the number of existing claims is the number of players who
    // have gone already, so return the next player after that in player order
    const claimCount = nextOffers.offers.count((offer) => offer.isClaimed());
    if (claimCount == nextOffers.offers.size) {
      throw Error("Invalid state: all new offer tiles are claimed");
    }
    const playerIndex = getConfiguration(players.players.length)
      .firstRoundTurnOrder[claimCount];
    return players.players[playerIndex];
  }
  // Non-first round: return the player with the first offer that still has a
  // tile. This logic assumes that it runs at the end of a player's turn; if
  // it could run in the middle of a turn (between claim and placement) it
  // wouldn't work as written.
  for (const offer of previousOffers.offers) {
    if (offer.tileNumber != undefined) {
      return requireDefined(
        players.players.find(
          (player) =>
            player.id ==
            requireDefined(offer.claim, "Previous offer was not claimed")
              .playerId
        ),
        "Claim player ID was unknown"
      );
    }
  }
  throw new Error("No cases matched");
}

function isEndOfRound(
  previousOffers: TileOffers | undefined,
  nextOffers: TileOffers | undefined
) {
  // If there are new offers and they're all claimed, the round is over
  if (nextOffers != undefined) {
    return nextOffers.offers.every((offer) => offer.isClaimed());
  }
  // Otherwise it's the last round which is over when all previous offers are placed
  return requireDefined(
    previousOffers,
    `No previous offers in the last round`
  ).offers.every((offer) => !offer.hasTile());
}
