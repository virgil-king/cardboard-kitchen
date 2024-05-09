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

export class PlayerState {
  constructor(
    readonly score: number
  ) {}

  withScore(score: number): PlayerState {
    return new PlayerState(score);
  }
}

/** A unary function from some type to the same type */
// export interface Endomorphism<T> {
//   apply(value: T): T;
// }

export interface JsonSerializable {
  toJson(): string;
}

// TODO add vector-able
export interface Action extends JsonSerializable {}

export interface Agent<StateT extends GameState, ActionT extends Action> {
  act(state: StateT): ActionT;
}

// TODO add vector-able
export interface GameState extends JsonSerializable {
  /** Returns whether the game is over */
  gameOver: boolean;
  /** Returns the state for {@link playerId} if it's a valid player ID or else throws an error */
  playerState(playerId: String): PlayerState;
  /** Returns the current player or undefined if the game is over */
  currentPlayer: Player | undefined;
}

export class Transcript<StateT extends GameState, ActionT extends Action> {
  readonly steps: Array<[ActionT, StateT]> = new Array();
  constructor(readonly initialState: StateT) {}
}

export interface Episode<StateT extends GameState, ActionT extends Action> {
  transcript: Transcript<StateT, ActionT>;
  /** Equals the last state in {@link transcript} */
  currentState: StateT;
  apply(action: ActionT): StateT;
}

export interface Game<StateT extends GameState, ActionT extends Action> {
  playerCounts: number[];
  newEpisode(players: Players): Episode<StateT, ActionT>;
}

export function unroll<StateT extends GameState, ActionT extends Action>(
  episode: Episode<StateT, ActionT>,
  actions: ReadonlyArray<ActionT>
): Episode<StateT, ActionT> {
  let result = episode.apply(actions[0]);
  for (const action of actions.slice(1)) {
    result = episode.apply(action);
  }
  return episode;
}

/**
 * Runs a new episode to completion using {@link playerIdToAgent} to act for {@link players}.
 * 
 * @returns the episode in completed state
 */
export function runEpisode<StateT extends GameState, ActionT extends Action>(
  game: Game<StateT, ActionT>,
  players: Players,
  playerIdToAgent: Map<string, Agent<StateT, ActionT>>
) {
  const episode = game.newEpisode(players);
  let state = episode.currentState;
  while (!state.gameOver) {
    const currentPlayer = state.currentPlayer;
    if (currentPlayer == undefined) {
      throw new Error(`Current player is undefined but game isn't over`);
    }
    const agent = playerIdToAgent.get(currentPlayer.id);
    if (agent == undefined) {
      throw new Error(`No agent for ${currentPlayer.id}`);
    }
    const action = agent.act(state);
    state = episode.apply(action);
  }
  return episode;
}

// export function unroll<T>(initialState: T, actions: Array<Endomorphism<T>>): T {
//   return actions.reduce(
//     (newState: T, newAction: Endomorphism<T>) => newAction.apply(newState),
//     initialState
//   );
// }

/**
 * Generator version of game logic: a generator that yields game states, consumes actions,
 * and returns game results.
 */
// export interface GameGenerator<StateT extends GameState<any>, ActionT extends Action<StateT>> {
//   play(): Generator<StateT, Array<PlayerResult>, ActionT>
// }
