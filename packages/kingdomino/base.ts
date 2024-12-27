import { GameConfiguration, JsonSerializable, Player } from "game";
import {
  BoardTransformation,
  Direction,
  Vector2,
  vector2Json,
} from "./util.js";
import { LocationProperties, Terrain, Tile } from "./tile.js";
import { List, Map, ValueObject, hash, Range } from "immutable";
import _ from "lodash";
import {
  combineHashes,
  decodeOrThrow,
  requireDefined,
  valueObjectsEqual,
} from "studio-util";
import * as io from "io-ts";
import { tiles } from "./tile.js";

/** Maximum height or width of a player's kingdom */
export const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
export const playAreaSize = 1 + 2 * (maxKingdomSize - 1);

/**
 * Distance from the center of the board to the furthest playable
 * location in any cardinal direction
 */
export const playAreaRadius = Math.floor(playAreaSize / 2);

/** The range of valid board indices in either axis */
export const boardIndices = _.range(-playAreaRadius, playAreaRadius + 1);

export const centerX = 0;
export const centerY = centerX;

export const locationStateCodec = io.type({
  tileNumber: io.number,
  tileLocationIndex: io.number,
});

type LocationStateMessage = io.TypeOf<typeof locationStateCodec>;

export class LocationState implements ValueObject, JsonSerializable {
  static cache = Array<Array<LocationState>>();

  static {
    for (const tileNumber of Range(
      tiles[0].number,
      tiles[tiles.length - 1].number + 1
    )) {
      this.cache[tileNumber] = [
        new LocationState(tileNumber, 0),
        new LocationState(tileNumber, 1),
      ];
    }
  }

  static instance(tileNumber: number, tileLocationIndex: number) {
    return this.cache[tileNumber][tileLocationIndex];
  }

  private constructor(
    readonly tileNumber: number,
    readonly tileLocationIndex: number
  ) {}

  static decode(message: unknown): LocationState {
    const decoded = decodeOrThrow(locationStateCodec, message);
    return this.instance(decoded.tileNumber, decoded.tileLocationIndex);
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
  encode(): LocationStateMessage {
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

export const configurationCodec = io.type({
  playerCount: io.number,
  scriptedTileNumbers: io.union([io.array(io.number), io.undefined]),
});

type ConfigurationMessage = io.TypeOf<typeof configurationCodec>;

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
    const decoded = decodeOrThrow(configurationCodec, json);
    return new KingdominoConfiguration(
      decoded.playerCount,
      decoded.scriptedTileNumbers
    );
  }
  get turnsPerRound(): number {
    return this.firstRoundTurnOrder.length;
  }
  encode(): ConfigurationMessage {
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

const tileOfferCodec = io.type({
  tileNumber: io.union([io.number, io.undefined]),
  claim: io.union([io.string, io.undefined]),
});

type TileOfferMessage = io.TypeOf<typeof tileOfferCodec>;

export class TileOffer implements JsonSerializable, ValueObject {
  static readonly EMPTY = new TileOffer();

  constructor(readonly tileNumber?: number, readonly claim?: TileClaim) {}
  static fromJson(json: unknown): TileOffer {
    const decoded = decodeOrThrow(tileOfferCodec, json);
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

  encode(): TileOfferMessage {
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

export const tileOffersCodec = io.type({ offers: io.array(tileOfferCodec) });

type TileOffersMessage = io.TypeOf<typeof tileOffersCodec>;

export class TileOffers implements JsonSerializable, ValueObject {
  constructor(readonly offers: List<TileOffer>) {}
  static decode(message: unknown): TileOffers {
    const decoded = decodeOrThrow(tileOffersCodec, message);
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

  firstOfferWithTile(): TileOffer | undefined {
    return this.offers.find((it) => it.hasTile());
  }

  encode(): TileOffersMessage {
    return { offers: this.offers.map((offer) => offer.encode()).toArray() };
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

/** Returns the square index that's not {@link squareIndex} */
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

export const claimCodec = io.type({
  offerIndex: io.number,
});

type ClaimMessage = io.TypeOf<typeof claimCodec>;

export class ClaimTile implements JsonSerializable {
  constructor(readonly offerIndex: number) {}
  static decode(json: unknown): ClaimTile {
    const parsed = decodeOrThrow(claimCodec, json);
    return new ClaimTile(parsed.offerIndex);
  }
  encode(): ClaimMessage {
    return { offerIndex: this.offerIndex };
  }
}

export const placeCodec = io.type({
  location: vector2Json,
  direction: io.number,
});

type PlaceMessage = io.TypeOf<typeof placeCodec>;

export class PlaceTile implements ValueObject, JsonSerializable {
  constructor(readonly location: Vector2, readonly direction: Direction) {}
  static fromJson(json: unknown) {
    const parsed = decodeOrThrow(placeCodec, json);
    return new PlaceTile(
      KingdominoVectors.fromJson(parsed.location),
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
    return KingdominoVectors.plus(this.location, this.direction.offset);
  }

  /**
   * Returns a new placement with the tile flipped to cover the same locations in the other orientation
   */
  flip() {
    return new PlaceTile(this.squareLocation(1), this.direction.opposite());
  }
  transform(transformation: BoardTransformation) {
    var location = KingdominoVectors.transform(this.location, transformation);
    var direction = this.direction.transform(transformation);
    return new PlaceTile(location, direction);
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
  encode(): PlaceMessage {
    return {
      location: this.location.encode(),
      direction: this.direction.index,
    };
  }
}

export class KingdominoVectors {
  private static vectorCache = Array<Array<Vector2>>();
  // Cache instances up to two steps out of bounds since those vectors
  // may be created before they are found to be out of bounds
  private static radius = playAreaRadius + 2;

  static {
    for (const x of Range(-this.radius, this.radius + 1)) {
      const row = new Array<Vector2>();
      this.vectorCache[this.naturalToCacheIndex(x)] = row;
      for (const y of Range(-this.radius, this.radius + 1)) {
        row[this.naturalToCacheIndex(y)] = new Vector2(x, y);
      }
    }
  }

  private static naturalToCacheIndex(index: number) {
    return index + this.radius;
  }

  static instance(x: number, y: number) {
    const cacheX = this.naturalToCacheIndex(x);
    if (cacheX < 0 || cacheX > this.vectorCache.length - 1) {
      throw new Error(`x out of range: ${x}`);
    }
    // console.log(`Cache is ${this.vectorCache}`);
    const cacheRow = this.vectorCache[cacheX];
    const cacheY = this.naturalToCacheIndex(y);
    if (cacheY < 0 || cacheY > cacheRow.length) {
      throw new Error(`y out of range: ${y}`);
    }
    return cacheRow[cacheY];
  }

  static plus(a: Vector2, b: Vector2) {
    return this.instance(a.x + b.x, a.y + b.y);
  }

  static transform(
    vector: Vector2,
    transformation: BoardTransformation
  ): Vector2 {
    var x = vector.x;
    var y = vector.y;
    if (transformation.mirror) {
      x = -x;
    }
    for (let i = 0; i < (transformation.quarterTurns || 0); i++) {
      const temp = x;
      x = y;
      y = -temp;
    }
    return this.instance(x, y);
  }

  static fromJson(json: unknown): Vector2 {
    const parsed = decodeOrThrow(vector2Json, json);
    return this.instance(parsed.x, parsed.y);
  }
}

export function* neighbors(location: Vector2): Generator<Vector2> {
  yield KingdominoVectors.plus(location, Direction.LEFT.offset);
  yield KingdominoVectors.plus(location, Direction.UP.offset);
  yield KingdominoVectors.plus(location, Direction.RIGHT.offset);
  yield KingdominoVectors.plus(location, Direction.DOWN.offset);
}
