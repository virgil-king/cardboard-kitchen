import { Action, Game, GameState, Player, Players, PlayerResult } from "game";
import * as Proto from "kingdomino-proto";
import { LocationProperties, Tile, tiles } from "./tiles.js";
import { Direction, Rectangle, Vector2 } from "./util.js";

import { Range, Seq } from "immutable";
import _ from "lodash";
import { produce } from "immer";

/** Maximum height or width of a player's kingdom */
const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
const playAreaSize = 1 + 2 * (maxKingdomSize - 1);

const centerX = Math.floor(playAreaSize / 2);
const centerY = centerX;

const defaultLocationState: Proto.LocationState = {
  tile: undefined,
  tileLocationIndex: undefined,
};

class Configuration {
  constructor(
    readonly tileCount: number,
    readonly firstRoundTurnOrder: number[]
  ) {}
}

const playerCountToConfiguration = new Map([
  [2, new Configuration(24, [0, 1, 0, 1])],
  [3, new Configuration(36, [0, 1, 2])],
  [4, new Configuration(48, [0, 1, 2, 3])],
]);

const defaultLocationProperties = new LocationProperties(
  Proto.Terrain.TERRAIN_EMPTY,
  0
);

const centerLocationProperties = new LocationProperties(
  Proto.Terrain.TERRAIN_CENTER,
  0
);

function orientationToDirection(orientation: Proto.TileOrientation) {
  switch (orientation) {
    case Proto.TileOrientation.LEFT:
      return Direction.LEFT;
    case Proto.TileOrientation.UP:
      return Direction.UP;
    case Proto.TileOrientation.RIGHT:
      return Direction.RIGHT;
    case Proto.TileOrientation.DOWN:
      return Direction.DOWN;
  }
}

export class KingdominoAction implements Action<KingdominoState> {
  constructor(readonly proto: Proto.Action) {}
  apply(state: KingdominoState): KingdominoState {
    const currentPlayer = state.currentPlayer();
    const newProto = produce(state.proto, (draft) => {
      if (this.proto.placeTile) {
        this.applyPlace(this.proto.placeTile, draft, currentPlayer);
      }
      if (this.proto.claimTile) {
        this.applyClaim(this.proto.claimTile, currentPlayer, draft);
      }
      // Check both round-end conditions to handle first, middle, and last round
      // cases
      if (
        // All new offers claimed
        (draft.nextOffers != undefined &&
          !_.some(
            draft.nextOffers.offer,
            (offer) => offer.claim == undefined
          )) ||
        // All previous offers placed
        (draft.previousOffers != undefined &&
          !_.some(
            draft.previousOffers.offer,
            (offer) => offer.tile == undefined
          ))
      ) {
        // console.log("dealing new offer");
        draft.previousOffers = draft.nextOffers;
        if (draft.remainingTiles.length == 0) {
          // Starting last round
          draft.nextOffers = undefined;
        } else {
          draft.nextOffers = dealOffer(state.turnCount(), draft.remainingTiles);
        }
      }
      // return draft;
    });
    return new KingdominoState(newProto, state.playerIdToPlayer);
  }

  applyPlace(
    placement: Proto.Action_PlaceTile,
    draft: Proto.State,
    currentPlayer: Player
  ) {
    if (draft.previousOffers == undefined) {
      throw new Error("Invalid action: can't place a tile in the first round");
    }

    // Remove the tile from the next unplaced offer
    const firstUnplacedOffer = draft.previousOffers.offer.find(
      (offer) => offer.tile != undefined
    );
    const tileNumber = firstUnplacedOffer.tile.tileNumber;
    const tile = Tile.withNumber(tileNumber);
    firstUnplacedOffer.tile = undefined;

    // Check placement legality
    if (!this.isPlacementAllowed(placement, tile, draft, currentPlayer)) {
      throw Error(`Invalid placement: ${placement}`);
    }
  }

  isPlacementAllowed(
    placement: Proto.Action_PlaceTile,
    tile: Tile,
    draft: Proto.State,
    currentPlayer: Player
  ): boolean {
    const firstSquareLocation = new Vector2(placement.x, placement.y);
    const currentPlayerBoard = draft.playerState.find(
      (player) => player.id == currentPlayer.id
    ).locationState;
    const occupiedRectangle = this.occupiedRectangle(currentPlayerBoard);
    // Each square of the tile must be:
    for (let i = 0; i < 2; i++) {
      const squareLocation = this.squareLocation(
        firstSquareLocation,
        placement.orientation,
        i
      );
      // Not already occupied:
      if (
        getLocationState(currentPlayerBoard, squareLocation).terrain !=
        Proto.Terrain.TERRAIN_EMPTY
      ) {
        return false;
      }
      // Not make the kingdom too tall or wide:
      const updatedRectangle = occupiedRectangle.extend(squareLocation);
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
      for (let location of this.adjacentExternalLocations(
        firstSquareLocation,
        placement.orientation,
        i
      )) {
        if (
          getLocationState(currentPlayerBoard, location).terrain ==
          tileSquareTerrain
        ) {
          return true;
        }
      }
    }
  }

  private squareLocation(
    tileLocation: Vector2,
    tileOrientation: Proto.TileOrientation,
    squareIndex: number
  ): Vector2 {
    if (squareIndex == 0) {
      return tileLocation;
    }
    if (squareIndex != 1) {
      throw Error("Invalid tile square index");
    }
    return tileLocation.plus(orientationToDirection(tileOrientation).offset);
  }

  /**
   * Returns the locations adjacent to one square of a tile, not including the
   * other square of the tile.
   *
   * @param tileLocation location of the first square of the tile
   * @param tileOrientation orientation of the tile
   * @param squareIndex square index on the tile
   */
  private *adjacentExternalLocations(
    tileLocation: Vector2,
    tileOrientation: Proto.TileOrientation,
    squareIndex: number
  ) {
    const squareLocation = this.squareLocation(
      tileLocation,
      tileOrientation,
      squareIndex
    );
    const otherSquareLocation = this.squareLocation(
      tileLocation,
      tileOrientation,
      this.otherSquareIndex(squareIndex)
    );
    for (const location of this.adjacentLocations(squareLocation)) {
      if (
        !_.isEqual(location, otherSquareLocation) &&
        this.isInBounds(location)
      ) {
        yield location;
      }
    }
  }

  private *adjacentLocations(location: Vector2): Generator<Vector2> {
    yield location.plus(Direction.LEFT.offset);
    yield location.plus(Direction.UP.offset);
    yield location.plus(Direction.RIGHT.offset);
    yield location.plus(Direction.DOWN.offset);
  }

  private otherSquareIndex(squareIndex: number) {
    switch (squareIndex) {
      case 0:
        return 1;
      case 1:
        return 0;
      default:
        throw Error(`Invalid square index ${squareIndex}`);
    }
  }

  private isInBounds(location: Vector2): boolean {
    return (
      location.x >= 0 &&
      location.x < playAreaSize &&
      location.y >= 0 &&
      location.y < playAreaSize
    );
  }

  private occupiedRectangle(board: Proto.LocationState[]): Rectangle {
    function isEmpty(x: number, y: number) {
      return (
        getLocationState(board, new Vector2(x, y)).terrain ==
        Proto.Terrain.TERRAIN_EMPTY
      );
    }
    // Scan out in all four directions from the center tile, choosing the last
    // row or column before the first row or column that's completely empty
    const left =
      Seq(Range(centerX - 1, 0, -1)).find((x) =>
        Seq(Range(0, playAreaSize)).every((y) => isEmpty(x, y))
      ) + 1;
    const top =
      Seq(Range(centerY + 1, playAreaSize)).find((y) =>
        Seq(Range(0, playAreaSize)).every((x) => isEmpty(x, y))
      ) - 1;
    const right =
      Seq(Range(centerX + 1, playAreaSize)).find((x) =>
        Seq(Range(0, playAreaSize)).every((y) => isEmpty(x, y))
      ) - 1;
    const bottom =
      Seq(Range(centerY - 1, 0, -1)).find((y) =>
        Seq(Range(0, playAreaSize)).every((x) => isEmpty(x, y))
      ) + 1;
    return new Rectangle(left, top, right, bottom);
  }

  applyClaim(
    claim: Proto.Action_ClaimTile,
    currentPlayer: Player,
    draft: Proto.State
  ) {
    if (draft.nextOffers == undefined) {
      throw new Error("Invalid action: can't claim a tile in the last round");
    }
    draft.nextOffers.offer[claim.offerIndex].claim = {
      playerId: currentPlayer.id,
    };
  }

  serialize(): Uint8Array {
    throw new Error("Method not implemented.");
  }
}

class KingdominoState implements GameState<KingdominoState> {
  constructor(
    readonly proto: Proto.State,
    /** Convenience cache of `Player` found in `proto` */ readonly playerIdToPlayer: Map<
      string,
      Player
    >
  ) {}

  private playerCount(): number {
    return this.playerIdToPlayer.size;
  }

  configuration(): Configuration {
    return playerCountToConfiguration.get(this.playerCount());
  }

  turnCount(): number {
    return this.configuration().firstRoundTurnOrder.length;
  }

  result(): PlayerResult[] | undefined {
    throw new Error("Method not implemented.");
  }

  currentPlayer(): Player {
    if (this.proto.previousOffers == undefined) {
      // First round: the number of existing claims is the number of players who
      // have gone already, so return the next player after that in player order
      const claimCount = Seq(this.proto.nextOffers.offer).count(
        (offer) => offer.claim != undefined
      );
      // console.log(
      //   `claimCount=${claimCount}, offer count = ${this.proto.nextOffers.offer.length}`
      // );
      if (claimCount == this.proto.nextOffers.offer.length) {
        throw Error("Invalid state: all new offer tiles are claimed");
      }
      const playerIndex = playerCountToConfiguration.get(this.playerCount())
        .firstRoundTurnOrder[claimCount];
      // console.log(playerIndex);
      return this.playerIdToPlayer.get(this.proto.playerState[playerIndex].id);
    }
    // Non-first round: return the player with the first offer that still has a
    // tile. This logic assumes that a single action atomically removes the
    // claimed tile, places it, and claims a new offered tile. If that weren't
    // the case those states would need to be checked separately.
    const newClaimIndices = new Set<number>();
    for (const offer of this.proto.previousOffers.offer) {
      if (offer.tile != undefined) {
        return this.playerIdToPlayer.get(offer.claim.playerId);
      }
    }
    throw new Error("No cases matched");
  }

  possibleActions(): Action<KingdominoState>[] {
    throw new Error("Method not implemented.");
  }

  serialize(): Uint8Array {
    throw new Error("Method not implemented.");
  }

  locationState(playerIndex: number, location: Vector2): LocationProperties {
    return getLocationState(
      this.proto.playerState[playerIndex].locationState,
      location
    );
  }
}

export class Kingdomino implements Game<KingdominoState> {
  playerCounts(): number[] {
    return [2, 3, 4];
  }

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  private createStartingBoard(): Array<Proto.LocationState> {
    const result = new Array<Proto.LocationState>(playAreaSize * playAreaSize);
    for (let x = 0; x < playAreaSize; x++) {
      for (let y = 0; y < playAreaSize; y++) {
        setLocationState(result, new Vector2(x, y), defaultLocationState);
      }
    }
    return result;
  }

  newGame(players: Players): KingdominoState {
    const protoPlayers: Proto.PlayerState[] = players.players.map((player) => {
      return {
        id: player.id,
        name: player.name,
        locationState: this.createStartingBoard(),
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

/**
 * Returns an offer consistinng of `turnCount` tiles from the end of
 * `tileNumbers` and removes those tiles from `tileNumbers`
 */
function dealOffer(turnCount: number, tileNumbers: number[]): Proto.TileOffers {
  // console.log(`dealOffer: tileNumbers=${tileNumbers}`);
  const offers = new Array<Proto.TileOffer>();
  for (let i = 0; i < turnCount; i++) {
    const tileNumber = tileNumbers.pop();
    offers.push({ tile: { tileNumber: tileNumber } });
  }
  return { offer: offers };
}

function getLocationState(
  board: Proto.LocationState[],
  location: Vector2
): LocationProperties {
  if (location.x == centerX && location.y == centerY) {
    return centerLocationProperties;
  }
  const locationState = board[location.x * playAreaSize + location.y];
  const tile = locationState.tile;
  if (tile == undefined) {
    return defaultLocationProperties;
  }
  return tiles[tile.tileNumber].properties[locationState.tileLocationIndex];
}

function setLocationState(
  board: Proto.LocationState[],
  location: Vector2,
  value: Proto.LocationState
) {
  board[location.x * playAreaSize + location.y] = value;
}
