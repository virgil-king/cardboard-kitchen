
import { Action, Game, GameState, Player, PlayerResult, Serializable } from "game"
import * as Proto from "kingdomino-proto";

class Tile {
    constructor(readonly properties: Proto.LocationState[]) { }

    static create(terrain0: Proto.Terrain, crowns0: number, terrain1: Proto.Terrain, crowns1: number) {
        return new Tile([{ terrain: terrain0, crowns: crowns0 }, { terrain: terrain1, crowns: crowns1 }])
    }
}

let tiles = [
    Tile.create(Proto.Terrain.TERRAIN_FOREST, 0, Proto.Terrain.TERRAIN_FOREST, 0),
]

abstract class KingdominoAction implements Serializable {
    serialize(): Uint8Array {
        throw new Error("Method not implemented.");
    }
}

class KingdominoState implements GameState<KingdominoState> {
    constructor(readonly proto: Proto.State) {}
     
    result(): PlayerResult[] | undefined {
        throw new Error("Method not implemented.");
    }
    currentPlayer(): Player {
        throw new Error("Method not implemented.");
    }
    possibleActions(): Action<KingdominoState>[] {
        throw new Error("Method not implemented.");
    }
    serialize(): Uint8Array {
        throw new Error("Method not implemented.");
    }
}

export class Kingdomino implements Game<KingdominoState> {
    playerCounts(): Number[] {
        return [2, 3, 4]
    }

    load(bytes: Uint8Array): KingdominoState {
        throw new Error("Method not implemented.");
    }

    newGame(playerCount: Number): KingdominoState {
        return new KingdominoState(
            Proto.State.create()
        )
    }
}
