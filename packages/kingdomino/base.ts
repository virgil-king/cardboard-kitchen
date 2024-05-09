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

  withTileRemoved(offerIndex: number): TileOffers {
    const offer = this.offers.get(offerIndex)?.withTileRemoved();
    if (offer == undefined) {
      throw new Error(`Offer index out of bounds: ${offerIndex}`);
    }
    return new TileOffers(this.offers.set(offerIndex, offer));
  }
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
      !_.isEqual(adjacentLocation, otherSquareLocation) // &&
      // isInBounds(adjacentLocation)
    ) {
      yield adjacentLocation;
    }
  }
}

// export function isInBounds(location: Vector2): boolean {
//   return (
//     location.x >= 0 &&
//     location.x < playAreaSize &&
//     location.y >= 0 &&
//     location.y < playAreaSize
//   );
// }

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

// export class DiscardTile {
//   static instance = new DiscardTile();
// }
