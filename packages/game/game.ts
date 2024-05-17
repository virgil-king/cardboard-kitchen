import { combineHashes, requireDefined } from "studio-util";

import { hash, List, Map, ValueObject } from "immutable";
import _ from "lodash";
import tf from "@tensorflow/tfjs-node-gpu";
import exp from "constants";

export class Player implements ValueObject {
  constructor(readonly id: string, readonly name: string) {}
  equals(other: unknown): boolean {
    if (!(other instanceof Player)) {
      return false;
    }
    return this.id == other.id && this.name == other.name;
  }
  hashCode(): number {
    return combineHashes(hash(this.id), hash(this.name));
  }
}

export class Players implements ValueObject {
  players: List<Player>;
  constructor(...playerArray: Array<Player>) {
    this.players = List(playerArray);
  }
  equals(other: unknown): boolean {
    if (!(other instanceof Players)) {
      return false;
    }
    return this.players.equals(other.players);
  }
  hashCode(): number {
    return this.players.hashCode();
  }
}

export class PlayerState implements ValueObject {
  constructor(readonly score: number) {}

  withScore(score: number): PlayerState {
    return new PlayerState(score);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof PlayerState)) {
      return false;
    }
    return this.score == other.score;
  }
  hashCode(): number {
    return hash(this.score);
  }
}

export class GameResult {
  playerIdOrder: Array<string>;
  constructor(playerIdToState: Map<string, PlayerState>) {
    this.playerIdOrder = playerIdToState
      .entrySeq()
      .sort(([, state0], [, state1]) => state1.score - state0.score)
      .map(([id, _]) => id)
      .toArray();
  }
  position(playerId: string) {
    const result = this.playerIdOrder.indexOf(playerId);
    if (result == undefined) {
      throw new Error(`Unknown player ID ${playerId}`);
    }
    return result;
  }
  /**
   * Returns the number of players who {@link playerId} defeated
   */
  value(playerId: string) {
    return this.playerIdOrder.length - 1 - this.position(playerId);
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
export interface Action extends JsonSerializable, ValueObject {
  asTensor(): tf.Tensor;
}

export interface Agent<StateT extends GameState, ActionT extends Action> {
  act(state: StateT): ActionT;
}

// TODO add vector-able
export interface GameState extends JsonSerializable {
  /** Returns whether the game is over */
  gameOver: boolean;
  /** Returns the state for {@link playerId} if it's a valid player ID or else throws an error */
  playerState(playerId: String): PlayerState;
  // result: GameResult | undefined;
  /** Returns the current player or undefined if the game is over */
  currentPlayer: Player | undefined;
  asTensor(): tf.Tensor;
}

export class Transcript<StateT extends GameState, ActionT extends Action> {
  readonly steps: Array<[ActionT, StateT]> = new Array();
  constructor(readonly initialState: StateT) {}
}

/**
 * A token uniquely identifying a game state whose derivation from the previous
 * state and action was non-deterministic.
 *
 * Values are compared using {@link Immutable.is}. Values for equal game states
 * must be equal and values for unequal states must be equal.
 */
export type ChanceKey = any;

export class EpisodeConfiguration<GameConfigurationT> {
  constructor(
    readonly players: Players,
    readonly randomSeed: string,
    readonly gameConfiguration: GameConfigurationT
  ) {}
}

export interface Episode<
  GameConfigurationT,
  StateT extends GameState,
  ActionT extends Action
> {
  configuration: EpisodeConfiguration<GameConfigurationT>;
  transcript: Transcript<StateT, ActionT>;
  /** Equals the last state in {@link transcript} */
  currentState: StateT;
  /**
   * Returns the state resulting from applying {@link action} to
   * {@link currentState} and a {@link ChanceKey} capturing the
   * non-deterministic portion of the new state
   */
  apply(action: ActionT): [StateT, ChanceKey];
}

export function finalScores(
  episode: Episode<any, any, any>
): PlayerValues | undefined {
  const state = episode.currentState;
  if (!state.gameOver) {
    return undefined;
  }
  return new PlayerValues(
    Map(
      episode.configuration.players.players.map((player) => [
        player.id,
        state.playerState(player.id).score,
      ])
    )
  );
}

export interface Game<
  GameConfigurationT,
  StateT extends GameState,
  ActionT extends Action
> {
  playerCounts: number[];
  newEpisode(
    config: EpisodeConfiguration<GameConfigurationT>
  ): Episode<GameConfigurationT, StateT, ActionT>;
  tensorToAction(tensor: tf.Tensor): ActionT;
}

/** Map from player ID to expected value at {@link state} */
export class PlayerValues {
  playerIdToValue: Map<string, number>;
  constructor(playerIdToValue: Map<string, number> = Map()) {
    this.playerIdToValue = playerIdToValue;
  }
  add(other: PlayerValues, scale: number = 1) {
    if (this.playerIdToValue.isEmpty()) {
      this.playerIdToValue = other.playerIdToValue.map(
        (value) => value * scale
      );
    } else {
      this.playerIdToValue = this.playerIdToValue.map(
        (value, playerId) =>
          value + scale * requireDefined(other.playerIdToValue.get(playerId))
      );
    }
  }
  get(playerId: string): number {
    return requireDefined(this.playerIdToValue.get(playerId));
  }
}

export interface Model<StateT extends GameState, ActionT extends Action> {
  /** Map from action to expected value */
  policy(state: StateT): Map<ActionT, number>;
  value(state: StateT): PlayerValues;
}

export function unroll<StateT extends GameState, ActionT extends Action>(
  episode: Episode<any, StateT, ActionT>,
  actions: ReadonlyArray<ActionT>
): Episode<any, StateT, ActionT> {
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
// export function runEpisode<StateT extends GameState, ActionT extends Action>(
//   game: Game<StateT, ActionT>,
//   players: Players,
//   playerIdToAgent: Map<string, Agent<StateT, ActionT>>
// ) {
//   const episode = game.newEpisode(players);
//   let state = episode.currentState;
//   while (!state.gameOver) {
//     const currentPlayer = state.currentPlayer;
//     if (currentPlayer == undefined) {
//       throw new Error(`Current player is undefined but game isn't over`);
//     }
//     const agent = playerIdToAgent.get(currentPlayer.id);
//     if (agent == undefined) {
//       throw new Error(`No agent for ${currentPlayer.id}`);
//     }
//     const action = agent.act(state);
//     [state, ] = episode.apply(action);
//   }
//   return episode;
// }

export function* generateEpisode<
  GameConfigurationT,
  StateT extends GameState,
  ActionT extends Action
>(
  game: Game<GameConfigurationT, StateT, ActionT>,
  config: EpisodeConfiguration<GameConfigurationT>,
  playerIdToAgent: Map<string, Agent<StateT, ActionT>>
) {
  const episode = game.newEpisode(config);
  let state = episode.currentState;
  yield state;
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
    [state] = episode.apply(action);
    yield state;
  }
  return episode.currentState;
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
