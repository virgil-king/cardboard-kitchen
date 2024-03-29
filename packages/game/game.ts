
export interface Serializable {
    serialize(): Uint8Array
}

export class Player {
    constructor(readonly name: String) { }
}

export class Players {
    constructor(readonly players: Player[]) { }
}

export class PlayerResult {
    constructor(readonly player: Player, readonly score: Number) { }
}

export interface Action<StateT extends GameState<any>> extends Serializable {
    apply(state: StateT): StateT
}

export interface GameState<StateT extends GameState<StateT>> extends Serializable {
    result(): PlayerResult[] | undefined
    currentPlayer(): Player
    possibleActions(): Action<StateT>[]
}

export interface Game<StateT extends GameState<StateT>> {
    playerCounts(): Number[]
    newGame(playerCount: Number): GameState<StateT>
}

// interface GameRenderer<StateT extends GameState<StateT, any>> {
//     render(state: StateT): void
// }

// class GameConfig<StateT extends GameState<StateT, any>> {
//     constructor(readonly game: Game<StateT>, readonly renderer: GameRenderer<StateT>) { }
// }