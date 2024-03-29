/* eslint-disable */
import _m0 from "protobufjs/minimal.js";
export const protobufPackage = "";
export var Terrain;
(function (Terrain) {
    Terrain[Terrain["TERRAIN_UNKNOWN"] = 0] = "TERRAIN_UNKNOWN";
    Terrain[Terrain["TERRAIN_EMPTY"] = 1] = "TERRAIN_EMPTY";
    Terrain[Terrain["TERRAIN_FOREST"] = 2] = "TERRAIN_FOREST";
    Terrain[Terrain["TERRAIN_WATER"] = 3] = "TERRAIN_WATER";
    Terrain[Terrain["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
})(Terrain || (Terrain = {}));
export function terrainFromJSON(object) {
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
export function terrainToJSON(object) {
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
export var TileOrientation;
(function (TileOrientation) {
    TileOrientation[TileOrientation["UNKNOWN"] = 0] = "UNKNOWN";
    TileOrientation[TileOrientation["RIGHT"] = 1] = "RIGHT";
    TileOrientation[TileOrientation["DOWN"] = 2] = "DOWN";
    TileOrientation[TileOrientation["LEFT"] = 3] = "LEFT";
    TileOrientation[TileOrientation["UP"] = 4] = "UP";
    TileOrientation[TileOrientation["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
})(TileOrientation || (TileOrientation = {}));
export function tileOrientationFromJSON(object) {
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
export function tileOrientationToJSON(object) {
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
function createBaseState() {
    return { previousOffers: undefined, nextOffers: undefined, remainingTiles: [], playerState: [] };
}
export const State = {
    encode(message, writer = _m0.Writer.create()) {
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
            PlayerState.encode(v, writer.uint32(42).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return {
            previousOffers: isSet(object.previousOffers) ? TileOffers.fromJSON(object.previousOffers) : undefined,
            nextOffers: isSet(object.nextOffers) ? TileOffers.fromJSON(object.nextOffers) : undefined,
            remainingTiles: globalThis.Array.isArray(object === null || object === void 0 ? void 0 : object.remainingTiles)
                ? object.remainingTiles.map((e) => globalThis.Number(e))
                : [],
            playerState: globalThis.Array.isArray(object === null || object === void 0 ? void 0 : object.playerState)
                ? object.playerState.map((e) => PlayerState.fromJSON(e))
                : [],
        };
    },
    toJSON(message) {
        var _a, _b;
        const obj = {};
        if (message.previousOffers !== undefined) {
            obj.previousOffers = TileOffers.toJSON(message.previousOffers);
        }
        if (message.nextOffers !== undefined) {
            obj.nextOffers = TileOffers.toJSON(message.nextOffers);
        }
        if ((_a = message.remainingTiles) === null || _a === void 0 ? void 0 : _a.length) {
            obj.remainingTiles = message.remainingTiles.map((e) => Math.round(e));
        }
        if ((_b = message.playerState) === null || _b === void 0 ? void 0 : _b.length) {
            obj.playerState = message.playerState.map((e) => PlayerState.toJSON(e));
        }
        return obj;
    },
    create(base) {
        return State.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a, _b;
        const message = createBaseState();
        message.previousOffers = (object.previousOffers !== undefined && object.previousOffers !== null)
            ? TileOffers.fromPartial(object.previousOffers)
            : undefined;
        message.nextOffers = (object.nextOffers !== undefined && object.nextOffers !== null)
            ? TileOffers.fromPartial(object.nextOffers)
            : undefined;
        message.remainingTiles = ((_a = object.remainingTiles) === null || _a === void 0 ? void 0 : _a.map((e) => e)) || [];
        message.playerState = ((_b = object.playerState) === null || _b === void 0 ? void 0 : _b.map((e) => PlayerState.fromPartial(e))) || [];
        return message;
    },
};
function createBaseTileOffer() {
    return { tileNumber: undefined, claim: undefined };
}
export const TileOffer = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.tileNumber !== undefined) {
            writer.uint32(8).int32(message.tileNumber);
        }
        if (message.claim !== undefined) {
            TileClaim.encode(message.claim, writer.uint32(18).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return {
            tileNumber: isSet(object.tileNumber) ? globalThis.Number(object.tileNumber) : undefined,
            claim: isSet(object.claim) ? TileClaim.fromJSON(object.claim) : undefined,
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.tileNumber !== undefined) {
            obj.tileNumber = Math.round(message.tileNumber);
        }
        if (message.claim !== undefined) {
            obj.claim = TileClaim.toJSON(message.claim);
        }
        return obj;
    },
    create(base) {
        return TileOffer.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a;
        const message = createBaseTileOffer();
        message.tileNumber = (_a = object.tileNumber) !== null && _a !== void 0 ? _a : undefined;
        message.claim = (object.claim !== undefined && object.claim !== null)
            ? TileClaim.fromPartial(object.claim)
            : undefined;
        return message;
    },
};
function createBaseTileClaim() {
    return { playerNumber: undefined };
}
export const TileClaim = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.playerNumber !== undefined) {
            writer.uint32(8).int32(message.playerNumber);
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return { playerNumber: isSet(object.playerNumber) ? globalThis.Number(object.playerNumber) : undefined };
    },
    toJSON(message) {
        const obj = {};
        if (message.playerNumber !== undefined) {
            obj.playerNumber = Math.round(message.playerNumber);
        }
        return obj;
    },
    create(base) {
        return TileClaim.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a;
        const message = createBaseTileClaim();
        message.playerNumber = (_a = object.playerNumber) !== null && _a !== void 0 ? _a : undefined;
        return message;
    },
};
function createBaseTileOffers() {
    return { offer: [] };
}
export const TileOffers = {
    encode(message, writer = _m0.Writer.create()) {
        for (const v of message.offer) {
            TileOffer.encode(v, writer.uint32(10).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return {
            offer: globalThis.Array.isArray(object === null || object === void 0 ? void 0 : object.offer) ? object.offer.map((e) => TileOffer.fromJSON(e)) : [],
        };
    },
    toJSON(message) {
        var _a;
        const obj = {};
        if ((_a = message.offer) === null || _a === void 0 ? void 0 : _a.length) {
            obj.offer = message.offer.map((e) => TileOffer.toJSON(e));
        }
        return obj;
    },
    create(base) {
        return TileOffers.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a;
        const message = createBaseTileOffers();
        message.offer = ((_a = object.offer) === null || _a === void 0 ? void 0 : _a.map((e) => TileOffer.fromPartial(e))) || [];
        return message;
    },
};
function createBasePlayerState() {
    return { name: undefined, locationState: [] };
}
export const PlayerState = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.name !== undefined) {
            writer.uint32(10).string(message.name);
        }
        for (const v of message.locationState) {
            LocationState.encode(v, writer.uint32(18).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return {
            name: isSet(object.name) ? globalThis.String(object.name) : undefined,
            locationState: globalThis.Array.isArray(object === null || object === void 0 ? void 0 : object.locationState)
                ? object.locationState.map((e) => LocationState.fromJSON(e))
                : [],
        };
    },
    toJSON(message) {
        var _a;
        const obj = {};
        if (message.name !== undefined) {
            obj.name = message.name;
        }
        if ((_a = message.locationState) === null || _a === void 0 ? void 0 : _a.length) {
            obj.locationState = message.locationState.map((e) => LocationState.toJSON(e));
        }
        return obj;
    },
    create(base) {
        return PlayerState.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a, _b;
        const message = createBasePlayerState();
        message.name = (_a = object.name) !== null && _a !== void 0 ? _a : undefined;
        message.locationState = ((_b = object.locationState) === null || _b === void 0 ? void 0 : _b.map((e) => LocationState.fromPartial(e))) || [];
        return message;
    },
};
function createBaseLocationState() {
    return { terrain: undefined, crowns: undefined };
}
export const LocationState = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.terrain !== undefined) {
            writer.uint32(16).int32(message.terrain);
        }
        if (message.crowns !== undefined) {
            writer.uint32(24).int32(message.crowns);
        }
        return writer;
    },
    decode(input, length) {
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
                    message.terrain = reader.int32();
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
    fromJSON(object) {
        return {
            terrain: isSet(object.terrain) ? terrainFromJSON(object.terrain) : undefined,
            crowns: isSet(object.crowns) ? globalThis.Number(object.crowns) : undefined,
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.terrain !== undefined) {
            obj.terrain = terrainToJSON(message.terrain);
        }
        if (message.crowns !== undefined) {
            obj.crowns = Math.round(message.crowns);
        }
        return obj;
    },
    create(base) {
        return LocationState.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a, _b;
        const message = createBaseLocationState();
        message.terrain = (_a = object.terrain) !== null && _a !== void 0 ? _a : undefined;
        message.crowns = (_b = object.crowns) !== null && _b !== void 0 ? _b : undefined;
        return message;
    },
};
function createBaseAction() {
    return { claimTile: undefined, placeTile: undefined };
}
export const Action = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.claimTile !== undefined) {
            Action_ClaimTile.encode(message.claimTile, writer.uint32(10).fork()).ldelim();
        }
        if (message.placeTile !== undefined) {
            Action_PlaceTile.encode(message.placeTile, writer.uint32(18).fork()).ldelim();
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return {
            claimTile: isSet(object.claimTile) ? Action_ClaimTile.fromJSON(object.claimTile) : undefined,
            placeTile: isSet(object.placeTile) ? Action_PlaceTile.fromJSON(object.placeTile) : undefined,
        };
    },
    toJSON(message) {
        const obj = {};
        if (message.claimTile !== undefined) {
            obj.claimTile = Action_ClaimTile.toJSON(message.claimTile);
        }
        if (message.placeTile !== undefined) {
            obj.placeTile = Action_PlaceTile.toJSON(message.placeTile);
        }
        return obj;
    },
    create(base) {
        return Action.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
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
function createBaseAction_ClaimTile() {
    return { offerNumber: undefined };
}
export const Action_ClaimTile = {
    encode(message, writer = _m0.Writer.create()) {
        if (message.offerNumber !== undefined) {
            writer.uint32(8).int32(message.offerNumber);
        }
        return writer;
    },
    decode(input, length) {
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
    fromJSON(object) {
        return { offerNumber: isSet(object.offerNumber) ? globalThis.Number(object.offerNumber) : undefined };
    },
    toJSON(message) {
        const obj = {};
        if (message.offerNumber !== undefined) {
            obj.offerNumber = Math.round(message.offerNumber);
        }
        return obj;
    },
    create(base) {
        return Action_ClaimTile.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a;
        const message = createBaseAction_ClaimTile();
        message.offerNumber = (_a = object.offerNumber) !== null && _a !== void 0 ? _a : undefined;
        return message;
    },
};
function createBaseAction_PlaceTile() {
    return { tileNumber: undefined, x: undefined, y: undefined, orientation: undefined };
}
export const Action_PlaceTile = {
    encode(message, writer = _m0.Writer.create()) {
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
    decode(input, length) {
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
                    message.orientation = reader.int32();
                    continue;
            }
            if ((tag & 7) === 4 || tag === 0) {
                break;
            }
            reader.skipType(tag & 7);
        }
        return message;
    },
    fromJSON(object) {
        return {
            tileNumber: isSet(object.tileNumber) ? globalThis.Number(object.tileNumber) : undefined,
            x: isSet(object.x) ? globalThis.Number(object.x) : undefined,
            y: isSet(object.y) ? globalThis.Number(object.y) : undefined,
            orientation: isSet(object.orientation) ? tileOrientationFromJSON(object.orientation) : undefined,
        };
    },
    toJSON(message) {
        const obj = {};
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
    create(base) {
        return Action_PlaceTile.fromPartial(base !== null && base !== void 0 ? base : {});
    },
    fromPartial(object) {
        var _a, _b, _c, _d;
        const message = createBaseAction_PlaceTile();
        message.tileNumber = (_a = object.tileNumber) !== null && _a !== void 0 ? _a : undefined;
        message.x = (_b = object.x) !== null && _b !== void 0 ? _b : undefined;
        message.y = (_c = object.y) !== null && _c !== void 0 ? _c : undefined;
        message.orientation = (_d = object.orientation) !== null && _d !== void 0 ? _d : undefined;
        return message;
    },
};
function isSet(value) {
    return value !== null && value !== undefined;
}
//# sourceMappingURL=kingdomino-proto.js.map