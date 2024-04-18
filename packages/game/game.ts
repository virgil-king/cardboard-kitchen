export interface Serializable {
  serialize(): Uint8Array;
}

export class Player {
  constructor(
    /** Game-unique or globally-unique string ID */ readonly id: string,
    readonly name: string
  ) {}
}

export class Players {
  constructor(readonly players: Player[]) {}
}

export class PlayerResult {
  constructor(readonly player: Player, readonly score: number) {}
}

/** A unary function from some type to the same type */
export interface Endomorphism<T> {
  apply(value: T): T;
}

export interface Action<StateT extends GameState<any>>
  extends Serializable,
    Endomorphism<StateT> {}

export interface GameState<StateT extends GameState<StateT>>
  extends Serializable {
  result(): PlayerResult[] | undefined;
  currentPlayer(): Player;
  possibleActions(): Action<StateT>[];
}

export interface Game<StateT extends GameState<StateT>> {
  playerCounts(): number[];
  newGame(players: Players): GameState<StateT>;
}

export function unroll<T>(initialState: T, actions: Array<Endomorphism<T>>): T {
  return actions.reduce(
    (newState: T, newAction: Endomorphism<T>) => newAction.apply(newState),
    initialState
  );
}
