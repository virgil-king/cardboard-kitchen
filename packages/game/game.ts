import { combineHashes } from "studio-util";

import { hash, List, Map, ValueObject } from "immutable";
import _ from "lodash";
import tf from "@tensorflow/tfjs-node-gpu";

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
  constructor(
    /**
     * "Victory points". Consider removing since not all games have this
     * concept.
     */
    readonly score: number
  ) {}

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

/**
 * Map from player to "value" which is defined by the player's position with
 * respect to the other players in the game.
 *
 * Instances may be actual final game results or predicted results from
 * non-final game states.
 */
export interface PlayerValues {
  readonly playerIdToValue: Map<string, number>;
}

export function playerValuesToString(values: PlayerValues): string {
  return JSON.stringify(
    values.playerIdToValue.mapEntries(([key, value]) => [key.toString(), value])
  );
}

/** Returns a {@link PlayerValues} with values defined by position in the provided tiers. */
export function tiersToPlayerValues(
  /** Tiers of player IDs. Tiers are ordered by finishing position (earlier is
   * better). Players in the same tier are tied */
  playerIds: Array<Array<string>>
) {
  let playerIdToValue = Map<string, number>();
  let laterTiersSize = 0;
  for (let tierIndex = playerIds.length - 1; tierIndex >= 0; tierIndex--) {
    const tier = playerIds[tierIndex];
    const thisTierSize = tier.length;
    // Value in this tier is one for all players in lower tiers plus half for
    // other players in this tier
    const thisTierValue = laterTiersSize + (thisTierSize - 1) * 0.5;
    for (const playerId of tier) {
      playerIdToValue = playerIdToValue.set(playerId, thisTierValue);
    }
    laterTiersSize += thisTierSize;
  }
  return { playerIdToValue: playerIdToValue };
}

/** Returns a {@link PlayerValues} defined by a mapping from player to victory
 * points. Applicable for games where victory points are the only criteria in
 * finishing position (i.e. there are no tiebreak conditions).*/
export function scoresToPlayerValues(
  playerIdToScore: Map<string, number>
): PlayerValues {
  if (playerIdToScore.count() == 0) {
    return { playerIdToValue: Map() };
  }
  const entryArray = playerIdToScore.toArray();
  // Sort high to low
  entryArray.sort(([, leftScore], [, rightScore]) => rightScore - leftScore);
  const tiers = new Array<Array<string>>();
  let currentTier = new Array<string>();
  let currentScore = entryArray[0][1];
  for (const [playerId, score] of entryArray) {
    if (score == currentScore) {
      currentTier.push(playerId);
    } else {
      tiers.push(currentTier);
      currentTier = [playerId];
      currentScore = score;
    }
  }
  tiers.push(currentTier);
  return tiersToPlayerValues(tiers);
}
// }

/** A unary function from some type to the same type */
// export interface Endomorphism<T> {
//   apply(value: T): T;
// }

export interface JsonSerializable {
  toJson(): string;
}

export interface ToTensor {
  asTensor(): tf.Tensor;
}

export interface Action extends JsonSerializable, ValueObject, ToTensor {}

export interface Agent<StateT extends GameState, ActionT extends Action> {
  act(state: StateT): ActionT;
}

// TODO add vector-able
export interface GameState extends JsonSerializable, ToTensor {
  /** Returns whether the game is over */
  // gameOver: boolean;
  // result: PlayerValues | undefined;
  // /** Returns the state for {@link playerId} if it's a valid player ID or else throws an error */
  // playerState(playerId: string): PlayerState;
  // // result: GameResult | undefined;
  // /** Returns the current player or undefined if the game is over */
  // currentPlayer: Player | undefined;
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

/**
 * Configuration info shared by all games
 */
export class EpisodeConfiguration {
  constructor(readonly players: Players) {}
}

/**
 * Game-specific configuration
 */
export interface GameConfiguration extends JsonSerializable {}

// export interface Episode<
//   GameConfigurationT extends GameConfiguration,
//   StateT extends GameState,
//   ActionT extends Action
// > {
//   episodeConfiguration: EpisodeConfiguration;
//   gameConfiguration: GameConfigurationT;
//   // transcript: Transcript<StateT, ActionT>;
//   /** Equals the last state in {@link transcript} */
//   currentState: StateT;
//   /**
//    * Returns the state resulting from applying {@link action} to
//    * {@link currentState} and a {@link ChanceKey} capturing the
//    * non-deterministic portion of the new state
//    */
//   apply(action: ActionT): [StateT, ChanceKey];
// }

export class EpisodeSnapshot<C extends GameConfiguration, S extends GameState> {
  constructor(
    readonly episodeConfiguration: EpisodeConfiguration,
    readonly gameConfiguration: C,
    readonly state: S
  ) {}
  /**
   * Returns a new snapshot with state {@link state} and the same configuration
   * as `this`
   */
  derive(state: S): EpisodeSnapshot<C, S> {
    return new EpisodeSnapshot(
      this.episodeConfiguration,
      this.gameConfiguration,
      state
    );
  }
}

export interface Game<
  GameConfigurationT extends GameConfiguration,
  StateT extends GameState,
  ActionT extends Action
> {
  playerCounts: number[];
  // newEpisode(config: EpisodeConfiguration): Episode<any, StateT, ActionT>;
  /**
   * Returns a new episode using a default game configuration
   */
  newEpisode(
    config: EpisodeConfiguration
  ): EpisodeSnapshot<GameConfigurationT, StateT>;

  apply(
    snapshot: EpisodeSnapshot<GameConfigurationT, StateT>,
    action: ActionT
  ): [StateT, ChanceKey];

  tensorToAction(tensor: tf.Tensor): ActionT;

  // gameOver(snapshot: EpisodeSnapshot<GameConfigurationT, StateT>): boolean;
  result(
    snapshot: EpisodeSnapshot<GameConfigurationT, StateT>
  ): PlayerValues | undefined;
  /** Returns the state for {@link playerId} if it's a valid player ID or else throws an error */
  // playerState(playerId: string): PlayerState;
  // result: GameResult | undefined;

  /** Returns the current player or undefined if the game is over */
  currentPlayer(
    snapshot: EpisodeSnapshot<GameConfigurationT, StateT>
  ): Player | undefined;
}

export function gameOver<
  GameConfigurationT extends GameConfiguration,
  StateT extends GameState
>(
  game: Game<GameConfigurationT, StateT, any>,
  snapshot: EpisodeSnapshot<GameConfigurationT, StateT>
): boolean {
  return game.result(snapshot) != undefined;
}

/**
 * Convenience class for driving a single episode
 */
export class Episode<
  GameConfigurationT extends GameConfiguration,
  StateT extends GameState,
  ActionT extends Action
> {
  currentSnapshot: EpisodeSnapshot<GameConfigurationT, StateT>;

  constructor(
    readonly game: Game<GameConfigurationT, StateT, ActionT>,
    readonly episodeConfig: EpisodeConfiguration,
    readonly gameConfig: GameConfigurationT,
    state: StateT
  ) {
    this.currentSnapshot = new EpisodeSnapshot(
      episodeConfig,
      gameConfig,
      state
    );
  }

  apply(action: ActionT): [StateT, any] {
    const [newState, chanceKey] = this.game.apply(this.currentSnapshot, action);
    this.currentSnapshot = new EpisodeSnapshot(
      this.episodeConfig,
      this.gameConfig,
      newState
    );
    return [newState, chanceKey];
  }
}

export interface Model<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  /**
   * Map from possible actions from {@link snapshot} to their expected value for
   * the acting player
   */
  policy(snapshot: EpisodeSnapshot<C, S>): Map<A, number>;
  /**
   * Predicted final player values for the game starting from {@link snapshot}
   */
  value(snapshot: EpisodeSnapshot<C, S>): PlayerValues;
}

export function unroll<StateT extends GameState, ActionT extends Action>(
  episode: Episode<any, StateT, ActionT>,
  actions: ReadonlyArray<ActionT>
) {
  let result = episode.apply(actions[0]);
  for (const action of actions.slice(1)) {
    result = episode.apply(action);
  }
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

// export function* generateEpisode<
//   StateT extends GameState,
//   ActionT extends Action
// >(
//   game: Game<any, StateT, ActionT>,
//   config: EpisodeConfiguration,
//   playerIdToAgent: Map<string, Agent<StateT, ActionT>>
// ) {
//   let episode = game.newEpisode(config);
//   let state = episode.currentState;
//   yield state;
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
//     [state] = episode.apply(action);
//     yield state;
//   }
//   return episode.currentState;
// }
