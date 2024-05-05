import { GameState, Player, PlayerResult, Players } from "game";
import { LocationProperties, Tile, tiles } from "./tile.js";
import {
  ClaimTile,
  Configuration,
  PlaceTile,
  PlayerBoard,
  TileOffer,
  TileOffers,
  getConfiguration,
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

export type Props = {
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
 * This class provides convenience methods for inspecting and updating game state.
 *
 * It is not responsible for maintaining state invariants.
 */
export class KingdominoState implements GameState {
  static newGame(
    players: Players,
    shuffledTileNumbers?: Array<number>
  ): KingdominoState {
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
    if (this.props.nextAction != undefined) {
      return undefined;
    }
    return new Array<PlayerResult>();
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

  requirePlayer(playerId: string): Player {
    return requireDefined(this.props.playerIdToState.get(playerId)).player;
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return this.requirePlayerState(player).board.getLocationState(location);
  }

  withCurrentPlayer(player: Player): KingdominoState {
    return new KingdominoState({ ...this.props, currentPlayer: player });
  }

  withNextAction(nextAction: NextAction | undefined): KingdominoState {
    return new KingdominoState({ ...this.props, nextAction: nextAction });
  }

  withClaim(claimTile: ClaimTile): KingdominoState {
    return new KingdominoState({
      ...this.props,
      nextOffers: requireDefined(this.props.nextOffers)?.withTileClaimed(
        claimTile.offerIndex,
        requireDefined(this.props.currentPlayer)
      ),
    });
  }

  /**
   * Returns {@link props} updated by removing the placed tile from previous offers and
   * applying it to the current player's board state
   */
  withPlacement(placement: PlaceTile, offerIndex: number): KingdominoState {
    let previousOffers = requireDefined(this.props.previousOffers);
    const tileNumber = requireDefined(
      previousOffers.offers.get(offerIndex)?.tileNumber
    );
    const tile = Tile.withNumber(tileNumber);
    const currentPlayer = requireDefined(this.props.currentPlayer);
    const currentPlayerState = requireDefined(
      this.props.playerIdToState.get(currentPlayer.id)
    );
    const currentPlayerBoard = currentPlayerState.board;

    // Check placement legality
    if (!currentPlayerBoard.isPlacementAllowed(placement, tile)) {
      throw Error(`Invalid placement: ${placement}`);
    }

    // Successful placement! Remove the tile from the next unplaced offer.
    previousOffers = previousOffers.withTileRemoved(offerIndex);

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

  withPreviousOffers(offers: TileOffers): KingdominoState {
    return new KingdominoState({ ...this.props, previousOffers: offers });
  }

  /**
   * Returns a copy with a new set of offers removed from
   */
  withNewNextOffers(): KingdominoState {
    const turnCount = this.configuration().turnCount();
    let [offers, remainingTiles] = dealOffer(
      turnCount,
      this.props.remainingTiles
    );
    return new KingdominoState({
      ...this.props,
      nextOffers: offers,
      remainingTiles: remainingTiles,
    });
  }
}

/**
 * Returns an offer consisting of `turnCount` tiles from the end of
 * `tileNumbers` and the new set of remaining tiles.
 */
export function dealOffer(
  turnCount: number,
  remainingTiles: List<number>
): [TileOffers, List<number>] {
  let offers = List<TileOffer>();
  for (let i = 0; i < turnCount; i++) {
    const tileNumber = remainingTiles.get(remainingTiles.size - 1 - i);
    offers = offers.push(new TileOffer(tileNumber));
  }
  return [
    new TileOffers(offers),
    remainingTiles.slice(0, remainingTiles.size - turnCount),
  ];
}
