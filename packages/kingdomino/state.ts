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
} from "./base.js";
import { Vector2, assertDefined, requireDefined } from "./util.js";

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
}

type Props = {
  readonly configuration: Configuration;
  readonly players: Players;
  readonly playerIdToState: Map<string, PlayerState>;
  readonly currentPlayer?: Player;
  readonly nextAction?: NextAction;
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

  get nextAction(): NextAction | undefined {
    return this.props.nextAction;
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
        `Invalid action: next action should be ${NextAction.CLAIM}`
      );
    }

    let currentPlayer = this.requireCurrentPlayer();

    const nextOffers = this.props.nextOffers.withTileClaimed(
      tileIndex,
      currentPlayer
    );
    let props: Props = {
      ...this.props,
      nextOffers: nextOffers,
    };
    // if (props.previousOffers == undefined) {
    // First round: claim is end of turn so handle end of turn
    // Claiming is always the end of the player's turn
    props = handleEndOfTurn(props);
    // }
    return new KingdominoState(props);
  }

  placeTile(placement: PlaceTile) {
    if (this.props.previousOffers == undefined) {
      throw new Error("Invalid action: can't place a tile in the first round");
    }
    if (this.props.nextAction != NextAction.PLACE) {
      throw new Error(
        `Invalid action: next action should be ${NextAction.PLACE}`
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
    if (!currentPlayerBoard.isPlacementAllowed(placement, tile)) {
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
    let props: Props = {
      ...this.props,
      previousOffers: previousOffers,
      playerIdToState: playerIdToState,
    };
    if (props.nextOffers == undefined) {
      // Place is the end of the player's turn in the last round
      props = handleEndOfTurn(props);
    } else {
      // In non-last rounds the current player claims after placing
      props = { ...props, nextAction: NextAction.CLAIM };
    }
    return new KingdominoState(props);
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return this.requirePlayerState(player).board.getLocationState(location);
  }
}

/**
 * Call after the last action in a player's turn.
 *
 * @param props props that already reflect the last action in the current player's turn
 * @returns a copy of {@link props} modified by transitioning to the next round or end
 * of game if appropriate and selecting the new current player and action
 */
function handleEndOfTurn(props: Props): Props {
  let {
    currentPlayer,
    previousOffers,
    nextOffers,
    remainingTiles,
    nextAction,
    configuration,
  } = props;
  if (isEndOfGame(previousOffers, nextOffers)) {
    console.log("End of game");
    currentPlayer = undefined;
    nextAction = undefined;
    previousOffers = undefined;
    // TODO compute player results here
  } else {
    if (isEndOfRound(previousOffers, nextOffers)) {
      console.log("End of round");
      // Update offers if it's the end of a round
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
    } else {
      if (previousOffers == undefined) {
        // First round: only action is claim
        nextAction = NextAction.CLAIM;
      } else {
        // Otherwise first action is place
        nextAction = NextAction.PLACE;
      }
    }
    currentPlayer = nextPlayer(previousOffers, nextOffers, props.players);
  }
  return {
    ...props,
    currentPlayer: currentPlayer,
    previousOffers: previousOffers,
    nextOffers: nextOffers,
    remainingTiles: remainingTiles,
    nextAction: nextAction,
  };
}

function isEndOfGame(
  previousOffers: TileOffers | undefined,
  nextOffers: TileOffers | undefined
) {
  if (nextOffers != undefined) {
    return false;
  }
  return previousOffers?.offers.every((offer) => !offer.hasTile());
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
    // console.log("Using starting turn order");
    return players.players[playerIndex];
  }
  // Non-first round: return the player with the first offer that still has a
  // tile. This logic assumes that it runs at the end of a player's turn; if
  // it could run in the middle of a turn (between claim and placement) it
  // wouldn't work as written.
  for (const offer of previousOffers.offers) {
    if (offer.hasTile()) {
      console.log("Using next claim");
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
