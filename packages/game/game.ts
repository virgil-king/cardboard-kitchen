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
    /** "Victory points". Consider removing since not all gaves have this
     * concept. */
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

export interface PlayerValues {
  readonly playerIdToValue: Map<string, number>;
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
export function scoresToPlayerValues(playerIdToScore: Map<string, number>): PlayerValues {
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
  result: PlayerValues | undefined;
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

export class EpisodeConfiguration {
  constructor(
    readonly players: Players // readonly randomSeed: string, // readonly gameConfiguration: GameConfigurationT
  ) {}
}

export interface Episode<StateT extends GameState, ActionT extends Action> {
  configuration: EpisodeConfiguration;
  // transcript: Transcript<StateT, ActionT>;
  /** Equals the last state in {@link transcript} */
  currentState: StateT;
  /**
   * Returns the state resulting from applying {@link action} to
   * {@link currentState} and a {@link ChanceKey} capturing the
   * non-deterministic portion of the new state
   */
  apply(action: ActionT): [StateT, ChanceKey];
}

export interface Game<
  // GameConfigurationT,
  StateT extends GameState,
  ActionT extends Action
> {
  playerCounts: number[];
  newEpisode(config: EpisodeConfiguration): Episode<StateT, ActionT>;
  tensorToAction(tensor: tf.Tensor): ActionT;
}

export interface Model<StateT extends GameState, ActionT extends Action> {
  /** Map from action to expected value */
  policy(state: StateT): Map<ActionT, number>;
  value(state: StateT): PlayerValues;
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
//   game: Game<StateT, ActionT>,
//   config: EpisodeConfiguration,
//   playerIdToAgent: Map<string, Agent<StateT, ActionT>>
// ) {
//   const episode = game.newEpisode(config);
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
