import { GameConfiguration, JsonSerializable, Player } from "game";
import { Direction, Vector2, neighbors, vector2Json } from "./util.js";
import { LocationProperties, Terrain, Tile } from "./tile.js";

import { List, Map, ValueObject, hash } from "immutable";
import _ from "lodash";
import {
  combineHashes,
  decodeOrThrow,
  requireDefined,
  valueObjectsEqual,
} from "studio-util";
import * as io from "io-ts";

/** Maximum height or width of a player's kingdom */
export const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
export const playAreaSize = 1 + 2 * (maxKingdomSize - 1);
/** Distance from the center of the board to the furthest playable location in any cardinal direction */
export const playAreaRadius = Math.floor(playAreaSize / 2);

/** The range of valid board indices in either axis */
export const boardIndices = _.range(-playAreaRadius, playAreaRadius + 1);

export const centerX = 0;
export const centerY = centerX;

export const locationStateJson = io.type({
  tileNumber: io.number,
  tileLocationIndex: io.number,
});

type LocationStateJson = io.TypeOf<typeof locationStateJson>;

export class LocationState implements ValueObject {
  constructor(
    readonly tileNumber: number,
    readonly tileLocationIndex: number
  ) {}
  static fromJson(json: unknown): LocationState {
    const decoded = decodeOrThrow(locationStateJson, json);
    return new LocationState(decoded.tileNumber, decoded.tileLocationIndex);
  }
  properties(): LocationProperties {
    return Tile.withNumber(this.tileNumber).properties[this.tileLocationIndex];
  }
  equals(other: unknown): boolean {
    if (!(other instanceof LocationState)) {
      return false;
    }
    return (
      this.tileNumber == other.tileNumber &&
      this.tileLocationIndex == other.tileLocationIndex
    );
  }
  hashCode(): number {
    return combineHashes(this.tileNumber, this.tileLocationIndex);
  }
  toJson(): LocationStateJson {
    return {
      tileNumber: this.tileNumber,
      tileLocationIndex: this.tileLocationIndex,
    };
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

export const configurationJson = io.type({
  playerCount: io.number,
  scriptedTileNumbers: io.union([io.array(io.number), io.undefined]),
});

type ConfigurationJson = io.TypeOf<typeof configurationJson>;

export class KingdominoConfiguration implements GameConfiguration {
  /** The total number of tiles that will be dealt during the game */
  readonly tileCount: number;
  /** Indexes are turn indexes and values are player indexes */
  readonly firstRoundTurnOrder: Array<number>;
  constructor(
    readonly playerCount: number,
    readonly scriptedTileNumbers: Array<number> | undefined = undefined
  ) {
    ({
      tileCount: this.tileCount,
      firstRoundTurnOrder: this.firstRoundTurnOrder,
    } = requireDefined(playerCountToConfiguration.get(playerCount)));
  }
  static fromJson(json: unknown): KingdominoConfiguration {
    const decoded = decodeOrThrow(configurationJson, json);
    return new KingdominoConfiguration(
      decoded.playerCount,
      decoded.scriptedTileNumbers
    );
  }
  get turnsPerRound(): number {
    return this.firstRoundTurnOrder.length;
  }
  toJson(): ConfigurationJson {
    return {
      playerCount: this.playerCount,
      scriptedTileNumbers: this.scriptedTileNumbers,
    };
  }
}

type PlayerDependentConfiguration = {
  tileCount: number;
  firstRoundTurnOrder: Array<number>;
};

export const playerCountToConfiguration = Map<
  number,
  PlayerDependentConfiguration
>([
  [2, { tileCount: 24, firstRoundTurnOrder: [0, 1, 0, 1] }],
  [3, { tileCount: 36, firstRoundTurnOrder: [0, 1, 2] }],
  [4, { tileCount: 48, firstRoundTurnOrder: [0, 1, 2, 3] }],
]);

export class TileClaim implements ValueObject {
  constructor(readonly playerId: string) {}
  equals(other: unknown): boolean {
    if (!(other instanceof TileClaim)) {
      return false;
    }
    return this.playerId == other.playerId;
  }
  hashCode(): number {
    return hash(this.playerId);
  }
}

const tileOfferJson = io.type({
  tileNumber: io.union([io.number, io.undefined]),
  claim: io.union([io.string, io.undefined]),
});

type TileOfferJson = io.TypeOf<typeof tileOfferJson>;

export class TileOffer implements JsonSerializable, ValueObject {
  static readonly EMPTY = new TileOffer();

  constructor(readonly tileNumber?: number, readonly claim?: TileClaim) {}
  static fromJson(json: unknown): TileOffer {
    const decoded = decodeOrThrow(tileOfferJson, json);
    const claim =
      decoded.claim == undefined ? undefined : new TileClaim(decoded.claim);
    return new TileOffer(decoded.tileNumber, claim);
  }

  isClaimed() {
    return this.claim != undefined;
  }

  hasTile() {
    return this.tileNumber != undefined;
  }

  withClaim(player: Player): TileOffer {
    return new TileOffer(this.tileNumber, new TileClaim(player.id));
  }

  withTileAndClaimRemoved(): TileOffer {
    return TileOffer.EMPTY;
  }

  toJson(): TileOfferJson {
    return { tileNumber: this.tileNumber, claim: this.claim?.playerId };
  }

  equals(other: unknown): boolean {
    if (!(other instanceof TileOffer)) {
      return false;
    }
    return (
      this.tileNumber == other.tileNumber &&
      valueObjectsEqual(this.claim, other.claim)
    );
  }
  hashCode(): number {
    return combineHashes(hash(this.tileNumber), hash(this.claim));
  }
}

export const tileOffersJson = io.type({ offers: io.array(tileOfferJson) });

type TileOffersJson = io.TypeOf<typeof tileOffersJson>;

export class TileOffers implements JsonSerializable, ValueObject {
  constructor(readonly offers: List<TileOffer>) {}
  static fromJson(json: unknown): TileOffers {
    const decoded = decodeOrThrow(tileOffersJson, json);
    return new TileOffers(
      List(decoded.offers.map((offer) => TileOffer.fromJson(offer)))
    );
  }

  withTileClaimed(offerIndex: number, player: Player): TileOffers {
    const offer = this.offers.get(offerIndex)?.withClaim(player);
    if (offer == undefined) {
      throw new Error(`Offer index out of bounds: ${offerIndex}`);
    }
    return new TileOffers(this.offers.set(offerIndex, offer));
  }

  withTileAndClaimRemoved(offerIndex: number): TileOffers {
    const offer = this.offers.get(offerIndex)?.withTileAndClaimRemoved();
    if (offer == undefined) {
      throw new Error(`Offer index out of bounds: ${offerIndex}`);
    }
    return new TileOffers(this.offers.set(offerIndex, offer));
  }

  toJson(): TileOffersJson {
    return { offers: this.offers.map((offer) => offer.toJson()).toArray() };
  }

  equals(other: unknown): boolean {
    if (!(other instanceof TileOffers)) {
      return false;
    }
    return this.offers.equals(other.offers);
  }
  hashCode(): number {
    return hash(this.offers);
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
    if (!adjacentLocation.equals(otherSquareLocation)) {
      yield adjacentLocation;
    }
  }
}

export function run<T>(f: () => T) {
  return f();
}

export const claimJson = io.type({
  offerIndex: io.number,
});

type ClaimJson = io.TypeOf<typeof claimJson>;

export class ClaimTile implements JsonSerializable {
  constructor(readonly offerIndex: number) {}
  static fromJson(json: unknown): ClaimTile {
    const parsed = decodeOrThrow(claimJson, json);
    return new ClaimTile(parsed.offerIndex);
  }
  toJson(): ClaimJson {
    return { offerIndex: this.offerIndex };
  }
}

export const placeJson = io.type({
  location: vector2Json,
  direction: io.number,
});

type PlaceJson = io.TypeOf<typeof placeJson>;

export class PlaceTile implements ValueObject, JsonSerializable {
  constructor(readonly location: Vector2, readonly direction: Direction) {}
  static fromJson(json: unknown) {
    const parsed = decodeOrThrow(placeJson, json);
    return new PlaceTile(
      Vector2.fromJson(parsed.location),
      Direction.fromIndex(parsed.direction)
    );
  }
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
    return combineHashes(
      this.location.hashCode(),
      this.direction.offset.hashCode()
    );
  }
  toJson(): PlaceJson {
    return {
      location: this.location.toJson(),
      direction: this.direction.index(),
    };
  }
}
