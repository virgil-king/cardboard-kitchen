/* eslint-disable */
import _m0 from "protobufjs/minimal.js";

export const protobufPackage = "";

export enum Terrain {
  TERRAIN_UNKNOWN = 0,
  TERRAIN_EMPTY = 1,
  TERRAIN_FOREST = 2,
  TERRAIN_WATER = 3,
  UNRECOGNIZED = -1,
}

export function terrainFromJSON(object: any): Terrain {
  switch (object) {
    case 0:
    case "TERRAIN_UNKNOWN":
      return Terrain.TERRAIN_UNKNOWN;
    case 1:
    case "TERRAIN_EMPTY":
      return Terrain.TERRAIN_EMPTY;
    case 2:
    case "TERRAIN_FOREST":
      return Terrain.TERRAIN_FOREST;
    case 3:
    case "TERRAIN_WATER":
      return Terrain.TERRAIN_WATER;
    case -1:
    case "UNRECOGNIZED":
    default:
      return Terrain.UNRECOGNIZED;
  }
}

export function terrainToJSON(object: Terrain): string {
  switch (object) {
    case Terrain.TERRAIN_UNKNOWN:
      return "TERRAIN_UNKNOWN";
    case Terrain.TERRAIN_EMPTY:
      return "TERRAIN_EMPTY";
    case Terrain.TERRAIN_FOREST:
      return "TERRAIN_FOREST";
    case Terrain.TERRAIN_WATER:
      return "TERRAIN_WATER";
    case Terrain.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

/** The direction of a tile with respect to its zeroth square */
export enum TileOrientation {
  UNKNOWN = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3,
  UP = 4,
  UNRECOGNIZED = -1,
}

export function tileOrientationFromJSON(object: any): TileOrientation {
  switch (object) {
    case 0:
    case "UNKNOWN":
      return TileOrientation.UNKNOWN;
    case 1:
    case "RIGHT":
      return TileOrientation.RIGHT;
    case 2:
    case "DOWN":
      return TileOrientation.DOWN;
    case 3:
    case "LEFT":
      return TileOrientation.LEFT;
    case 4:
    case "UP":
      return TileOrientation.UP;
    case -1:
    case "UNRECOGNIZED":
    default:
      return TileOrientation.UNRECOGNIZED;
  }
}

export function tileOrientationToJSON(object: TileOrientation): string {
  switch (object) {
    case TileOrientation.UNKNOWN:
      return "UNKNOWN";
    case TileOrientation.RIGHT:
      return "RIGHT";
    case TileOrientation.DOWN:
      return "DOWN";
    case TileOrientation.LEFT:
      return "LEFT";
    case TileOrientation.UP:
      return "UP";
    case TileOrientation.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface State {
  previousOffers?: TileOffers | undefined;
  nextOffers?:
    | TileOffers
    | undefined;
  /** Tiles are in random order */
  remainingTiles: number[];
  /** Ordered by turn order in the first round */
  playerState: PlayerState[];
}

export interface TileOffer {
  tileNumber?: number | undefined;
  claim?: TileClaim | undefined;
}

export interface TileClaim {
  playerNumber?: number | undefined;
}

export interface TileOffers {
  offer: TileOffer[];
}

export interface PlayerState {
  name?:
    | string
    | undefined;
  /**
   * Contains a LocationState (often the default instance) for every location
   * that can possibly be occupied during a game. The region is a square whose
   * sides have length 1 + 2 * (max kingdom size - 1) since the player could
   * build out to (max kingdom size - 1) from the center in any direction.
   */
  locationState: LocationState[];
}

export interface LocationState {
  terrain?: Terrain | undefined;
  crowns?: number | undefined;
}

export interface Action {
  /**
   * Either one or both of the following properties may be present. The first
   * turn of the game is only a claim; the last turn of the game is only a
   * place.
   */
  claimTile: Action_ClaimTile | undefined;
  placeTile: Action_PlaceTile | undefined;
}

export interface Action_ClaimTile {
  offerNumber?: number | undefined;
}

export interface Action_PlaceTile {
  tileNumber?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  orientation?: TileOrientation | undefined;
}

function createBaseState(): State {
  return { previousOffers: undefined, nextOffers: undefined, remainingTiles: [], playerState: [] };
}

export const State = {
  encode(message: State, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.previousOffers !== undefined) {
      TileOffers.encode(message.previousOffers, writer.uint32(18).fork()).ldelim();
    }
    if (message.nextOffers !== undefined) {
      TileOffers.encode(message.nextOffers, writer.uint32(26).fork()).ldelim();
    }
    writer.uint32(34).fork();
    for (const v of message.remainingTiles) {
      writer.int32(v);
    }
    writer.ldelim();
    for (const v of message.playerState) {
      PlayerState.encode(v!, writer.uint32(42).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): State {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseState();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 2:
          if (tag !== 18) {
            break;
          }

          message.previousOffers = TileOffers.decode(reader, reader.uint32());
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.nextOffers = TileOffers.decode(reader, reader.uint32());
          continue;
        case 4:
          if (tag === 32) {
            message.remainingTiles.push(reader.int32());

            continue;
          }

          if (tag === 34) {
            const end2 = reader.uint32() + reader.pos;
            while (reader.pos < end2) {
              message.remainingTiles.push(reader.int32());
            }

            continue;
          }

          break;
        case 5:
          if (tag !== 42) {
            break;
          }

          message.playerState.push(PlayerState.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): State {
    return {
      previousOffers: isSet(object.previousOffers) ? TileOffers.fromJSON(object.previousOffers) : undefined,
      nextOffers: isSet(object.nextOffers) ? TileOffers.fromJSON(object.nextOffers) : undefined,
      remainingTiles: globalThis.Array.isArray(object?.remainingTiles)
        ? object.remainingTiles.map((e: any) => globalThis.Number(e))
        : [],
      playerState: globalThis.Array.isArray(object?.playerState)
        ? object.playerState.map((e: any) => PlayerState.fromJSON(e))
        : [],
    };
  },

  toJSON(message: State): unknown {
    const obj: any = {};
    if (message.previousOffers !== undefined) {
      obj.previousOffers = TileOffers.toJSON(message.previousOffers);
    }
    if (message.nextOffers !== undefined) {
      obj.nextOffers = TileOffers.toJSON(message.nextOffers);
    }
    if (message.remainingTiles?.length) {
      obj.remainingTiles = message.remainingTiles.map((e) => Math.round(e));
    }
    if (message.playerState?.length) {
      obj.playerState = message.playerState.map((e) => PlayerState.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<State>, I>>(base?: I): State {
    return State.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<State>, I>>(object: I): State {
    const message = createBaseState();
    message.previousOffers = (object.previousOffers !== undefined && object.previousOffers !== null)
      ? TileOffers.fromPartial(object.previousOffers)
      : undefined;
    message.nextOffers = (object.nextOffers !== undefined && object.nextOffers !== null)
      ? TileOffers.fromPartial(object.nextOffers)
      : undefined;
    message.remainingTiles = object.remainingTiles?.map((e) => e) || [];
    message.playerState = object.playerState?.map((e) => PlayerState.fromPartial(e)) || [];
    return message;
  },
};

function createBaseTileOffer(): TileOffer {
  return { tileNumber: undefined, claim: undefined };
}

export const TileOffer = {
  encode(message: TileOffer, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.tileNumber !== undefined) {
      writer.uint32(8).int32(message.tileNumber);
    }
    if (message.claim !== undefined) {
      TileClaim.encode(message.claim, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TileOffer {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTileOffer();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.tileNumber = reader.int32();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.claim = TileClaim.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): TileOffer {
    return {
      tileNumber: isSet(object.tileNumber) ? globalThis.Number(object.tileNumber) : undefined,
      claim: isSet(object.claim) ? TileClaim.fromJSON(object.claim) : undefined,
    };
  },

  toJSON(message: TileOffer): unknown {
    const obj: any = {};
    if (message.tileNumber !== undefined) {
      obj.tileNumber = Math.round(message.tileNumber);
    }
    if (message.claim !== undefined) {
      obj.claim = TileClaim.toJSON(message.claim);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<TileOffer>, I>>(base?: I): TileOffer {
    return TileOffer.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<TileOffer>, I>>(object: I): TileOffer {
    const message = createBaseTileOffer();
    message.tileNumber = object.tileNumber ?? undefined;
    message.claim = (object.claim !== undefined && object.claim !== null)
      ? TileClaim.fromPartial(object.claim)
      : undefined;
    return message;
  },
};

function createBaseTileClaim(): TileClaim {
  return { playerNumber: undefined };
}

export const TileClaim = {
  encode(message: TileClaim, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.playerNumber !== undefined) {
      writer.uint32(8).int32(message.playerNumber);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TileClaim {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTileClaim();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.playerNumber = reader.int32();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): TileClaim {
    return { playerNumber: isSet(object.playerNumber) ? globalThis.Number(object.playerNumber) : undefined };
  },

  toJSON(message: TileClaim): unknown {
    const obj: any = {};
    if (message.playerNumber !== undefined) {
      obj.playerNumber = Math.round(message.playerNumber);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<TileClaim>, I>>(base?: I): TileClaim {
    return TileClaim.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<TileClaim>, I>>(object: I): TileClaim {
    const message = createBaseTileClaim();
    message.playerNumber = object.playerNumber ?? undefined;
    return message;
  },
};

function createBaseTileOffers(): TileOffers {
  return { offer: [] };
}

export const TileOffers = {
  encode(message: TileOffers, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.offer) {
      TileOffer.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TileOffers {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTileOffers();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.offer.push(TileOffer.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): TileOffers {
    return {
      offer: globalThis.Array.isArray(object?.offer) ? object.offer.map((e: any) => TileOffer.fromJSON(e)) : [],
    };
  },

  toJSON(message: TileOffers): unknown {
    const obj: any = {};
    if (message.offer?.length) {
      obj.offer = message.offer.map((e) => TileOffer.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<TileOffers>, I>>(base?: I): TileOffers {
    return TileOffers.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<TileOffers>, I>>(object: I): TileOffers {
    const message = createBaseTileOffers();
    message.offer = object.offer?.map((e) => TileOffer.fromPartial(e)) || [];
    return message;
  },
};

function createBasePlayerState(): PlayerState {
  return { name: undefined, locationState: [] };
}

export const PlayerState = {
  encode(message: PlayerState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.name !== undefined) {
      writer.uint32(10).string(message.name);
    }
    for (const v of message.locationState) {
      LocationState.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): PlayerState {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBasePlayerState();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.name = reader.string();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.locationState.push(LocationState.decode(reader, reader.uint32()));
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): PlayerState {
    return {
      name: isSet(object.name) ? globalThis.String(object.name) : undefined,
      locationState: globalThis.Array.isArray(object?.locationState)
        ? object.locationState.map((e: any) => LocationState.fromJSON(e))
        : [],
    };
  },

  toJSON(message: PlayerState): unknown {
    const obj: any = {};
    if (message.name !== undefined) {
      obj.name = message.name;
    }
    if (message.locationState?.length) {
      obj.locationState = message.locationState.map((e) => LocationState.toJSON(e));
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<PlayerState>, I>>(base?: I): PlayerState {
    return PlayerState.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<PlayerState>, I>>(object: I): PlayerState {
    const message = createBasePlayerState();
    message.name = object.name ?? undefined;
    message.locationState = object.locationState?.map((e) => LocationState.fromPartial(e)) || [];
    return message;
  },
};

function createBaseLocationState(): LocationState {
  return { terrain: undefined, crowns: undefined };
}

export const LocationState = {
  encode(message: LocationState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.terrain !== undefined) {
      writer.uint32(16).int32(message.terrain);
    }
    if (message.crowns !== undefined) {
      writer.uint32(24).int32(message.crowns);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): LocationState {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseLocationState();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 2:
          if (tag !== 16) {
            break;
          }

          message.terrain = reader.int32() as any;
          continue;
        case 3:
          if (tag !== 24) {
            break;
          }

          message.crowns = reader.int32();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): LocationState {
    return {
      terrain: isSet(object.terrain) ? terrainFromJSON(object.terrain) : undefined,
      crowns: isSet(object.crowns) ? globalThis.Number(object.crowns) : undefined,
    };
  },

  toJSON(message: LocationState): unknown {
    const obj: any = {};
    if (message.terrain !== undefined) {
      obj.terrain = terrainToJSON(message.terrain);
    }
    if (message.crowns !== undefined) {
      obj.crowns = Math.round(message.crowns);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<LocationState>, I>>(base?: I): LocationState {
    return LocationState.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<LocationState>, I>>(object: I): LocationState {
    const message = createBaseLocationState();
    message.terrain = object.terrain ?? undefined;
    message.crowns = object.crowns ?? undefined;
    return message;
  },
};

function createBaseAction(): Action {
  return { claimTile: undefined, placeTile: undefined };
}

export const Action = {
  encode(message: Action, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.claimTile !== undefined) {
      Action_ClaimTile.encode(message.claimTile, writer.uint32(10).fork()).ldelim();
    }
    if (message.placeTile !== undefined) {
      Action_PlaceTile.encode(message.placeTile, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Action {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseAction();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.claimTile = Action_ClaimTile.decode(reader, reader.uint32());
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.placeTile = Action_PlaceTile.decode(reader, reader.uint32());
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Action {
    return {
      claimTile: isSet(object.claimTile) ? Action_ClaimTile.fromJSON(object.claimTile) : undefined,
      placeTile: isSet(object.placeTile) ? Action_PlaceTile.fromJSON(object.placeTile) : undefined,
    };
  },

  toJSON(message: Action): unknown {
    const obj: any = {};
    if (message.claimTile !== undefined) {
      obj.claimTile = Action_ClaimTile.toJSON(message.claimTile);
    }
    if (message.placeTile !== undefined) {
      obj.placeTile = Action_PlaceTile.toJSON(message.placeTile);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Action>, I>>(base?: I): Action {
    return Action.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Action>, I>>(object: I): Action {
    const message = createBaseAction();
    message.claimTile = (object.claimTile !== undefined && object.claimTile !== null)
      ? Action_ClaimTile.fromPartial(object.claimTile)
      : undefined;
    message.placeTile = (object.placeTile !== undefined && object.placeTile !== null)
      ? Action_PlaceTile.fromPartial(object.placeTile)
      : undefined;
    return message;
  },
};

function createBaseAction_ClaimTile(): Action_ClaimTile {
  return { offerNumber: undefined };
}

export const Action_ClaimTile = {
  encode(message: Action_ClaimTile, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.offerNumber !== undefined) {
      writer.uint32(8).int32(message.offerNumber);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Action_ClaimTile {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseAction_ClaimTile();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.offerNumber = reader.int32();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Action_ClaimTile {
    return { offerNumber: isSet(object.offerNumber) ? globalThis.Number(object.offerNumber) : undefined };
  },

  toJSON(message: Action_ClaimTile): unknown {
    const obj: any = {};
    if (message.offerNumber !== undefined) {
      obj.offerNumber = Math.round(message.offerNumber);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Action_ClaimTile>, I>>(base?: I): Action_ClaimTile {
    return Action_ClaimTile.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Action_ClaimTile>, I>>(object: I): Action_ClaimTile {
    const message = createBaseAction_ClaimTile();
    message.offerNumber = object.offerNumber ?? undefined;
    return message;
  },
};

function createBaseAction_PlaceTile(): Action_PlaceTile {
  return { tileNumber: undefined, x: undefined, y: undefined, orientation: undefined };
}

export const Action_PlaceTile = {
  encode(message: Action_PlaceTile, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.tileNumber !== undefined) {
      writer.uint32(8).int32(message.tileNumber);
    }
    if (message.x !== undefined) {
      writer.uint32(16).int32(message.x);
    }
    if (message.y !== undefined) {
      writer.uint32(24).int32(message.y);
    }
    if (message.orientation !== undefined) {
      writer.uint32(32).int32(message.orientation);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Action_PlaceTile {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseAction_PlaceTile();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.tileNumber = reader.int32();
          continue;
        case 2:
          if (tag !== 16) {
            break;
          }

          message.x = reader.int32();
          continue;
        case 3:
          if (tag !== 24) {
            break;
          }

          message.y = reader.int32();
          continue;
        case 4:
          if (tag !== 32) {
            break;
          }

          message.orientation = reader.int32() as any;
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Action_PlaceTile {
    return {
      tileNumber: isSet(object.tileNumber) ? globalThis.Number(object.tileNumber) : undefined,
      x: isSet(object.x) ? globalThis.Number(object.x) : undefined,
      y: isSet(object.y) ? globalThis.Number(object.y) : undefined,
      orientation: isSet(object.orientation) ? tileOrientationFromJSON(object.orientation) : undefined,
    };
  },

  toJSON(message: Action_PlaceTile): unknown {
    const obj: any = {};
    if (message.tileNumber !== undefined) {
      obj.tileNumber = Math.round(message.tileNumber);
    }
    if (message.x !== undefined) {
      obj.x = Math.round(message.x);
    }
    if (message.y !== undefined) {
      obj.y = Math.round(message.y);
    }
    if (message.orientation !== undefined) {
      obj.orientation = tileOrientationToJSON(message.orientation);
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Action_PlaceTile>, I>>(base?: I): Action_PlaceTile {
    return Action_PlaceTile.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Action_PlaceTile>, I>>(object: I): Action_PlaceTile {
    const message = createBaseAction_PlaceTile();
    message.tileNumber = object.tileNumber ?? undefined;
    message.x = object.x ?? undefined;
    message.y = object.y ?? undefined;
    message.orientation = object.orientation ?? undefined;
    return message;
  },
};

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
