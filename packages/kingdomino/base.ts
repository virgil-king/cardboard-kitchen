import { Player } from "game";
import { Direction, Rectangle, Vector2, neighbors } from "./util.js";
import { LocationProperties, Terrain, Tile } from "./tile.js";

import { List, Map, Range, Seq, ValueObject } from "immutable";
import _ from "lodash";
import { combineHashes } from "studio-util";

/** Maximum height or width of a player's kingdom */
export const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
export const playAreaSize = 1 + 2 * (maxKingdomSize - 1);
/** Distance from the center of the board to the furthest playable location in any cardinal direction */
export const playAreaRadius = Math.floor(playAreaSize / 2);

export const centerX = 0;
export const centerY = centerX;

export class LocationState {
  constructor(
    readonly tileNumber: number,
    readonly tileLocationIndex: number
  ) {}
  properties(): LocationProperties {
    return Tile.withNumber(this.tileNumber).properties[this.tileLocationIndex];
  }
}

export class PlayerBoard {
  constructor(readonly locationStates: Map<Vector2, LocationState>) {}

  getLocationState(location: Vector2): LocationProperties {
    if (location.x == centerX && location.y == centerY) {
      return centerLocationProperties;
    }
    const locationState = this.locationStates.get(location);
    if (locationState == undefined) {
      return defaultLocationProperties;
    }
    return locationState.properties();
  }

  static center: Vector2 = new Vector2(centerX, centerY);

  withLocationStateFromTile(
    placement: PlaceTile,
    tileNumber: number,
    tileLocationIndex: number
  ): PlayerBoard {
    const location = placement.squareLocation(tileLocationIndex);
    const state = new LocationState(tileNumber, tileLocationIndex);
    return this.withLocationState(location, state);
  }

  withLocationState(location: Vector2, value: LocationState): PlayerBoard {
    return new PlayerBoard(this.locationStates.set(location, value));
  }

  occupiedRectangle(): Rectangle {
    const isEmpty = (x: number, y: number) => {
      return (
        this.getLocationState(new Vector2(x, y)).terrain ==
        Terrain.TERRAIN_EMPTY
      );
    };
    const left = this.lastOccupiedLine(centerX - 1, 0, -1, (a, b) =>
      isEmpty(a, b)
    );
    const top = this.lastOccupiedLine(centerY + 1, playAreaSize, 1, (a, b) =>
      isEmpty(b, a)
    );
    const right = this.lastOccupiedLine(centerX + 1, playAreaSize, 1, (a, b) =>
      isEmpty(a, b)
    );
    const bottom = this.lastOccupiedLine(centerY - 1, 0, -1, (a, b) =>
      isEmpty(b, a)
    );
    return new Rectangle(left, top, right, bottom);
  }

  /**
   * Returns the last occupied row or column between start (inclusive) and end (exclusive).
   */
  lastOccupiedLine(
    start: number,
    end: number,
    increment: number,
    isEmpty: (a: number, b: number) => boolean
  ) {
    const result = Seq(Range(start, end, increment)).find((a) =>
      Seq(Range(0, playAreaSize)).every((b) => isEmpty(a, b))
    );
    if (result != undefined) {
      return result - increment;
    }
    return end - increment;
  }

  isPlacementAllowed(placement: PlaceTile, tile: Tile): boolean {
    const occupied = this.occupiedRectangle();
    // Each square of the tile must be:
    for (let i = 0; i < 2; i++) {
      const location = placement.squareLocation(i);
      // Not already occupied:
      if (this.getLocationState(location).terrain != Terrain.TERRAIN_EMPTY) {
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
        const adjacentTerrain = this.getLocationState(location).terrain;
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
}

export const defaultLocationProperties: LocationProperties = {
  terrain: Terrain.TERRAIN_EMPTY,
  crowns: 0,
};

export const centerLocationProperties: LocationProperties = {
  terrain: Terrain.TERRAIN_CENTER,
  crowns: 0,
};

export class Configuration {
  constructor(
    readonly tileCount: number,
    readonly firstRoundTurnOrder: number[]
  ) {}

  turnCount(): number {
    return this.firstRoundTurnOrder.length;
  }
}

export const playerCountToConfiguration = Map([
  [2, new Configuration(24, [0, 1, 0, 1])],
  [3, new Configuration(36, [0, 1, 2])],
  [4, new Configuration(48, [0, 1, 2, 3])],
]);

export function getConfiguration(playerCount: number): Configuration {
  const result = playerCountToConfiguration.get(playerCount);
  if (result == undefined) {
    throw new Error(`Invalid player count ${playerCount}`);
  }
  return result;
}

export class TileClaim {
  constructor(readonly playerId: string) {}
}

export class TileOffer {
  constructor(readonly tileNumber?: number, readonly claim?: TileClaim) {}

  isClaimed() {
    return this.claim != undefined;
  }

  hasTile() {
    return this.tileNumber != undefined;
  }

  withClaim(player: Player): TileOffer {
    return new TileOffer(this.tileNumber, new TileClaim(player.id));
  }

  withTileRemoved(): TileOffer {
    return new TileOffer();
  }
}

export class TileOffers {
  constructor(readonly offers: List<TileOffer>) {}

  withTileClaimed(offerIndex: number, player: Player): TileOffers {
    const offer = this.offers.get(offerIndex)?.withClaim(player);
    if (offer == undefined) {
      throw new Error(`Offer index out of bounds: ${offerIndex}`);
    }
    return new TileOffers(this.offers.set(offerIndex, offer));
  }

  withTileRemoved(offerIndex: number) {
    const offer = this.offers.get(offerIndex)?.withTileRemoved();
    if (offer == undefined) {
      throw new Error(`Offer index out of bounds: ${offerIndex}`);
    }
    return new TileOffers(this.offers.set(offerIndex, offer));
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

/** Returns the  */
export function otherSquareIndex(squareIndex: number) {
  switch (squareIndex) {
    case 0:
      return 1;
    case 1:
      return 0;
    default:
      throw Error(`Invalid square index ${squareIndex}`);
  }
}

/**
 * Returns the locations adjacent to one square of a tile, not including the
 * other square of the tile.
 *
 * @param tileLocation location of the first square of the tile
 * @param tileOrientation orientation of the tile
 * @param squareIndex square index on the tile
 */
export function* adjacentExternalLocations(
  placement: PlaceTile,
  squareIndex: number
) {
  const location = placement.squareLocation(squareIndex);
  const otherSquareLocation = placement.squareLocation(
    otherSquareIndex(squareIndex)
  );
  for (const adjacentLocation of neighbors(location)) {
    if (
      !_.isEqual(adjacentLocation, otherSquareLocation) &&
      isInBounds(adjacentLocation)
    ) {
      yield adjacentLocation;
    }
  }
}

export function isInBounds(location: Vector2): boolean {
  return (
    location.x >= 0 &&
    location.x < playAreaSize &&
    location.y >= 0 &&
    location.y < playAreaSize
  );
}

export function run<T>(f: () => T) {
  return f();
}

export class ClaimTile {
  constructor(readonly offerIndex: number) {}
}

export class PlaceTile implements ValueObject {
  constructor(readonly location: Vector2, readonly direction: Direction) {}
  /**
   * Returns the location of {@link squareIndex} when performing {@link placement}
   */
  squareLocation(squareIndex: number): Vector2 {
    if (squareIndex == 0) {
      return this.location;
    }
    if (squareIndex != 1) {
      throw Error("Invalid tile square index");
    }
    return this.location.plus(this.direction.offset);
  }

  /**
   * Returns a new placement with the tile flipped to cover the same locations in the other orientation
   */
  flip() {
    return new PlaceTile(
      this.location.plus(this.direction.offset),
      this.direction.opposite()
    );
  }
  equals(other: unknown): boolean {
    if (!(other instanceof PlaceTile)) {
      return false;
    }
    return (
      this.location.equals(other.location) && this.direction == other.direction
    );
  }
  hashCode(): number {
    return combineHashes([
      this.location.hashCode(),
      this.direction.offset.hashCode(),
    ]);
  }
}
