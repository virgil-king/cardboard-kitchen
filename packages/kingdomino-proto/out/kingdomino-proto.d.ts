import _m0 from "protobufjs/minimal.js";
export declare const protobufPackage = "";
export declare enum Terrain {
    TERRAIN_UNKNOWN = 0,
    TERRAIN_EMPTY = 1,
    TERRAIN_FOREST = 2,
    TERRAIN_WATER = 3,
    UNRECOGNIZED = -1
}
export declare function terrainFromJSON(object: any): Terrain;
export declare function terrainToJSON(object: Terrain): string;
/** The direction of a tile with respect to its zeroth square */
export declare enum TileOrientation {
    UNKNOWN = 0,
    RIGHT = 1,
    DOWN = 2,
    LEFT = 3,
    UP = 4,
    UNRECOGNIZED = -1
}
export declare function tileOrientationFromJSON(object: any): TileOrientation;
export declare function tileOrientationToJSON(object: TileOrientation): string;
export interface State {
    previousOffers?: TileOffers | undefined;
    nextOffers?: TileOffers | undefined;
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
    name?: string | undefined;
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
export declare const State: {
    encode(message: State, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): State;
    fromJSON(object: any): State;
    toJSON(message: State): unknown;
    create<I extends {
        previousOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        };
        nextOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        };
        remainingTiles?: number[];
        playerState?: {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[];
    } & {
        previousOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        } & {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[] & ({
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            } & {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                } & {
                    playerNumber?: number | undefined;
                } & { [K in Exclude<keyof I["previousOffers"]["offer"][number]["claim"], "playerNumber">]: never; };
            } & { [K_1 in Exclude<keyof I["previousOffers"]["offer"][number], keyof TileOffer>]: never; })[] & { [K_2 in Exclude<keyof I["previousOffers"]["offer"], keyof {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[]>]: never; };
        } & { [K_3 in Exclude<keyof I["previousOffers"], "offer">]: never; };
        nextOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        } & {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[] & ({
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            } & {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                } & {
                    playerNumber?: number | undefined;
                } & { [K_4 in Exclude<keyof I["nextOffers"]["offer"][number]["claim"], "playerNumber">]: never; };
            } & { [K_5 in Exclude<keyof I["nextOffers"]["offer"][number], keyof TileOffer>]: never; })[] & { [K_6 in Exclude<keyof I["nextOffers"]["offer"], keyof {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[]>]: never; };
        } & { [K_7 in Exclude<keyof I["nextOffers"], "offer">]: never; };
        remainingTiles?: number[] & number[] & { [K_8 in Exclude<keyof I["remainingTiles"], keyof number[]>]: never; };
        playerState?: {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[] & ({
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        } & {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[] & ({
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            } & {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            } & { [K_9 in Exclude<keyof I["playerState"][number]["locationState"][number], keyof LocationState>]: never; })[] & { [K_10 in Exclude<keyof I["playerState"][number]["locationState"], keyof {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[]>]: never; };
        } & { [K_11 in Exclude<keyof I["playerState"][number], keyof PlayerState>]: never; })[] & { [K_12 in Exclude<keyof I["playerState"], keyof {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[]>]: never; };
    } & { [K_13 in Exclude<keyof I, keyof State>]: never; }>(base?: I): State;
    fromPartial<I_1 extends {
        previousOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        };
        nextOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        };
        remainingTiles?: number[];
        playerState?: {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[];
    } & {
        previousOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        } & {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[] & ({
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            } & {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                } & {
                    playerNumber?: number | undefined;
                } & { [K_14 in Exclude<keyof I_1["previousOffers"]["offer"][number]["claim"], "playerNumber">]: never; };
            } & { [K_15 in Exclude<keyof I_1["previousOffers"]["offer"][number], keyof TileOffer>]: never; })[] & { [K_16 in Exclude<keyof I_1["previousOffers"]["offer"], keyof {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[]>]: never; };
        } & { [K_17 in Exclude<keyof I_1["previousOffers"], "offer">]: never; };
        nextOffers?: {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[];
        } & {
            offer?: {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[] & ({
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            } & {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                } & {
                    playerNumber?: number | undefined;
                } & { [K_18 in Exclude<keyof I_1["nextOffers"]["offer"][number]["claim"], "playerNumber">]: never; };
            } & { [K_19 in Exclude<keyof I_1["nextOffers"]["offer"][number], keyof TileOffer>]: never; })[] & { [K_20 in Exclude<keyof I_1["nextOffers"]["offer"], keyof {
                tileNumber?: number | undefined;
                claim?: {
                    playerNumber?: number | undefined;
                };
            }[]>]: never; };
        } & { [K_21 in Exclude<keyof I_1["nextOffers"], "offer">]: never; };
        remainingTiles?: number[] & number[] & { [K_22 in Exclude<keyof I_1["remainingTiles"], keyof number[]>]: never; };
        playerState?: {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[] & ({
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        } & {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[] & ({
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            } & {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            } & { [K_23 in Exclude<keyof I_1["playerState"][number]["locationState"][number], keyof LocationState>]: never; })[] & { [K_24 in Exclude<keyof I_1["playerState"][number]["locationState"], keyof {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[]>]: never; };
        } & { [K_25 in Exclude<keyof I_1["playerState"][number], keyof PlayerState>]: never; })[] & { [K_26 in Exclude<keyof I_1["playerState"], keyof {
            name?: string | undefined;
            locationState?: {
                terrain?: Terrain | undefined;
                crowns?: number | undefined;
            }[];
        }[]>]: never; };
    } & { [K_27 in Exclude<keyof I_1, keyof State>]: never; }>(object: I_1): State;
};
export declare const TileOffer: {
    encode(message: TileOffer, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): TileOffer;
    fromJSON(object: any): TileOffer;
    toJSON(message: TileOffer): unknown;
    create<I extends {
        tileNumber?: number | undefined;
        claim?: {
            playerNumber?: number | undefined;
        };
    } & {
        tileNumber?: number | undefined;
        claim?: {
            playerNumber?: number | undefined;
        } & {
            playerNumber?: number | undefined;
        } & { [K in Exclude<keyof I["claim"], "playerNumber">]: never; };
    } & { [K_1 in Exclude<keyof I, keyof TileOffer>]: never; }>(base?: I): TileOffer;
    fromPartial<I_1 extends {
        tileNumber?: number | undefined;
        claim?: {
            playerNumber?: number | undefined;
        };
    } & {
        tileNumber?: number | undefined;
        claim?: {
            playerNumber?: number | undefined;
        } & {
            playerNumber?: number | undefined;
        } & { [K_2 in Exclude<keyof I_1["claim"], "playerNumber">]: never; };
    } & { [K_3 in Exclude<keyof I_1, keyof TileOffer>]: never; }>(object: I_1): TileOffer;
};
export declare const TileClaim: {
    encode(message: TileClaim, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): TileClaim;
    fromJSON(object: any): TileClaim;
    toJSON(message: TileClaim): unknown;
    create<I extends {
        playerNumber?: number | undefined;
    } & {
        playerNumber?: number | undefined;
    } & { [K in Exclude<keyof I, "playerNumber">]: never; }>(base?: I): TileClaim;
    fromPartial<I_1 extends {
        playerNumber?: number | undefined;
    } & {
        playerNumber?: number | undefined;
    } & { [K_1 in Exclude<keyof I_1, "playerNumber">]: never; }>(object: I_1): TileClaim;
};
export declare const TileOffers: {
    encode(message: TileOffers, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): TileOffers;
    fromJSON(object: any): TileOffers;
    toJSON(message: TileOffers): unknown;
    create<I extends {
        offer?: {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[];
    } & {
        offer?: {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[] & ({
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        } & {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            } & {
                playerNumber?: number | undefined;
            } & { [K in Exclude<keyof I["offer"][number]["claim"], "playerNumber">]: never; };
        } & { [K_1 in Exclude<keyof I["offer"][number], keyof TileOffer>]: never; })[] & { [K_2 in Exclude<keyof I["offer"], keyof {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[]>]: never; };
    } & { [K_3 in Exclude<keyof I, "offer">]: never; }>(base?: I): TileOffers;
    fromPartial<I_1 extends {
        offer?: {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[];
    } & {
        offer?: {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[] & ({
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        } & {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            } & {
                playerNumber?: number | undefined;
            } & { [K_4 in Exclude<keyof I_1["offer"][number]["claim"], "playerNumber">]: never; };
        } & { [K_5 in Exclude<keyof I_1["offer"][number], keyof TileOffer>]: never; })[] & { [K_6 in Exclude<keyof I_1["offer"], keyof {
            tileNumber?: number | undefined;
            claim?: {
                playerNumber?: number | undefined;
            };
        }[]>]: never; };
    } & { [K_7 in Exclude<keyof I_1, "offer">]: never; }>(object: I_1): TileOffers;
};
export declare const PlayerState: {
    encode(message: PlayerState, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): PlayerState;
    fromJSON(object: any): PlayerState;
    toJSON(message: PlayerState): unknown;
    create<I extends {
        name?: string | undefined;
        locationState?: {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[];
    } & {
        name?: string | undefined;
        locationState?: {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[] & ({
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        } & {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        } & { [K in Exclude<keyof I["locationState"][number], keyof LocationState>]: never; })[] & { [K_1 in Exclude<keyof I["locationState"], keyof {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[]>]: never; };
    } & { [K_2 in Exclude<keyof I, keyof PlayerState>]: never; }>(base?: I): PlayerState;
    fromPartial<I_1 extends {
        name?: string | undefined;
        locationState?: {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[];
    } & {
        name?: string | undefined;
        locationState?: {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[] & ({
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        } & {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        } & { [K_3 in Exclude<keyof I_1["locationState"][number], keyof LocationState>]: never; })[] & { [K_4 in Exclude<keyof I_1["locationState"], keyof {
            terrain?: Terrain | undefined;
            crowns?: number | undefined;
        }[]>]: never; };
    } & { [K_5 in Exclude<keyof I_1, keyof PlayerState>]: never; }>(object: I_1): PlayerState;
};
export declare const LocationState: {
    encode(message: LocationState, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): LocationState;
    fromJSON(object: any): LocationState;
    toJSON(message: LocationState): unknown;
    create<I extends {
        terrain?: Terrain | undefined;
        crowns?: number | undefined;
    } & {
        terrain?: Terrain | undefined;
        crowns?: number | undefined;
    } & { [K in Exclude<keyof I, keyof LocationState>]: never; }>(base?: I): LocationState;
    fromPartial<I_1 extends {
        terrain?: Terrain | undefined;
        crowns?: number | undefined;
    } & {
        terrain?: Terrain | undefined;
        crowns?: number | undefined;
    } & { [K_1 in Exclude<keyof I_1, keyof LocationState>]: never; }>(object: I_1): LocationState;
};
export declare const Action: {
    encode(message: Action, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): Action;
    fromJSON(object: any): Action;
    toJSON(message: Action): unknown;
    create<I extends {
        claimTile?: {
            offerNumber?: number | undefined;
        };
        placeTile?: {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        };
    } & {
        claimTile?: {
            offerNumber?: number | undefined;
        } & {
            offerNumber?: number | undefined;
        } & { [K in Exclude<keyof I["claimTile"], "offerNumber">]: never; };
        placeTile?: {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        } & {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        } & { [K_1 in Exclude<keyof I["placeTile"], keyof Action_PlaceTile>]: never; };
    } & { [K_2 in Exclude<keyof I, keyof Action>]: never; }>(base?: I): Action;
    fromPartial<I_1 extends {
        claimTile?: {
            offerNumber?: number | undefined;
        };
        placeTile?: {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        };
    } & {
        claimTile?: {
            offerNumber?: number | undefined;
        } & {
            offerNumber?: number | undefined;
        } & { [K_3 in Exclude<keyof I_1["claimTile"], "offerNumber">]: never; };
        placeTile?: {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        } & {
            tileNumber?: number | undefined;
            x?: number | undefined;
            y?: number | undefined;
            orientation?: TileOrientation | undefined;
        } & { [K_4 in Exclude<keyof I_1["placeTile"], keyof Action_PlaceTile>]: never; };
    } & { [K_5 in Exclude<keyof I_1, keyof Action>]: never; }>(object: I_1): Action;
};
export declare const Action_ClaimTile: {
    encode(message: Action_ClaimTile, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): Action_ClaimTile;
    fromJSON(object: any): Action_ClaimTile;
    toJSON(message: Action_ClaimTile): unknown;
    create<I extends {
        offerNumber?: number | undefined;
    } & {
        offerNumber?: number | undefined;
    } & { [K in Exclude<keyof I, "offerNumber">]: never; }>(base?: I): Action_ClaimTile;
    fromPartial<I_1 extends {
        offerNumber?: number | undefined;
    } & {
        offerNumber?: number | undefined;
    } & { [K_1 in Exclude<keyof I_1, "offerNumber">]: never; }>(object: I_1): Action_ClaimTile;
};
export declare const Action_PlaceTile: {
    encode(message: Action_PlaceTile, writer?: _m0.Writer): _m0.Writer;
    decode(input: _m0.Reader | Uint8Array, length?: number): Action_PlaceTile;
    fromJSON(object: any): Action_PlaceTile;
    toJSON(message: Action_PlaceTile): unknown;
    create<I extends {
        tileNumber?: number | undefined;
        x?: number | undefined;
        y?: number | undefined;
        orientation?: TileOrientation | undefined;
    } & {
        tileNumber?: number | undefined;
        x?: number | undefined;
        y?: number | undefined;
        orientation?: TileOrientation | undefined;
    } & { [K in Exclude<keyof I, keyof Action_PlaceTile>]: never; }>(base?: I): Action_PlaceTile;
    fromPartial<I_1 extends {
        tileNumber?: number | undefined;
        x?: number | undefined;
        y?: number | undefined;
        orientation?: TileOrientation | undefined;
    } & {
        tileNumber?: number | undefined;
        x?: number | undefined;
        y?: number | undefined;
        orientation?: TileOrientation | undefined;
    } & { [K_1 in Exclude<keyof I_1, keyof Action_PlaceTile>]: never; }>(object: I_1): Action_PlaceTile;
};
type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;
export type DeepPartial<T> = T extends Builtin ? T : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>> : T extends {} ? {
    [K in keyof T]?: DeepPartial<T[K]>;
} : Partial<T>;
type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P : P & {
    [K in keyof P]: Exact<P[K], I[K]>;
} & {
    [K in Exclude<keyof I, KeysOfUnion<P>>]: never;
};
export {};
