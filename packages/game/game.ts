import { combineHashes } from "studio-util";

import { hash, ValueObject } from "immutable";
import _ from "lodash";

export class Player implements ValueObject {
  constructor(readonly id: string, readonly name: string) {}
  equals(other: unknown): boolean {
    if (!(other instanceof Player)) {
      return false;
    }
    return this.id == other.id && this.name == other.name;
  }
  hashCode(): number {
    return combineHashes([hash(this.id), hash(this.name)]);
  }
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
  extends Endomorphism<StateT> {}

export interface GameState<StateT extends GameState<StateT>> {
  result(): PlayerResult[] | undefined;
  currentPlayer(): Player | undefined;
  // possibleActions(): Action<StateT>[];
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
