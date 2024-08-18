import { combineHashes, decodeOrThrow, requireDefined } from "studio-util";

import { hash, List, Map, ValueObject } from "immutable";
import _ from "lodash";
import * as io from "io-ts";
// import tf from "@tensorflow/tfjs-node-gpu";

export const playerJson = io.type({ id: io.string, name: io.string });

type EncodedPlayer = io.TypeOf<typeof playerJson>;

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
  toJson(): EncodedPlayer {
    return this;
  }
  static decode(encoded: any): Player {
    const decoded = decodeOrThrow(playerJson, encoded);
    return new Player(decoded.id, decoded.name);
  }
}

export const playersJson = io.type({
  players: io.array(playerJson),
});

type EncodedPlayers = io.TypeOf<typeof playersJson>;

export class Players implements ValueObject {
  players: List<Player>;
  playerIdToPlayer: Map<string, Player>;
  constructor(...playerArray: Array<Player>) {
    this.players = List(playerArray);
    this.playerIdToPlayer = Map(
      playerArray.map((player) => [player.id, player])
    );
  }
  requirePlayer(id: string): Player {
    return requireDefined(this.playerIdToPlayer.get(id));
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
  toJson(): EncodedPlayers {
    return { players: this.players.toArray().map((it) => it.toJson()) };
  }
  static decode(encoded: any): Players {
    const decoded = decodeOrThrow(playersJson, encoded);
    return new Players(
      ...decoded.players.map((encoded) => Player.decode(encoded))
    );
  }
}

// export class PlayerState implements ValueObject {
//   constructor(
//     /**
//      * "Victory points". Consider removing since not all games have this
//      * concept.
//      */
//     readonly score: number
//   ) {}

//   withScore(score: number): PlayerState {
//     return new PlayerState(score);
//   }

//   equals(other: unknown): boolean {
//     if (!(other instanceof PlayerState)) {
//       return false;
//     }
//     return this.score == other.score;
//   }
//   hashCode(): number {
//     return hash(this.score);
//   }
// }

export const playerValuesJson = io.type({
  playerIdToValue: io.array(io.tuple([io.string, io.number])),
});

type EncodedPlayerValues = io.TypeOf<typeof playerValuesJson>;

/**
 * Map from player to "value" which is defined by the player's position with
 * respect to the other players in the game.
 *
 * Instances may be actual final game results or predicted results from
 * non-final game states.
 */
export class PlayerValues implements JsonSerializable {
  constructor(readonly playerIdToValue: Map<string, number>) {}
  toJson(): EncodedPlayerValues {
    return {
      playerIdToValue: this.playerIdToValue.entrySeq().toArray(),
    };
  }
  static decode(encoded: any): PlayerValues {
    const decoded = decodeOrThrow(playerValuesJson, encoded);
    return new PlayerValues(Map(decoded.playerIdToValue));
  }
}

export function playerValuesToString(
  playerIdToValue: Map<string, number>
): string {
  return JSON.stringify(
    playerIdToValue.mapEntries(([key, value]) => [key.toString(), value])
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
  return new PlayerValues(playerIdToValue);
}

/**
 * Returns a {@link PlayerValues} defined by a mapping from player to victory
 * points. Applicable for games where victory points are the only criteria in
 * finishing position (i.e. there are no tiebreak conditions).
 */
export function scoresToPlayerValues(
  playerIdToScore: Map<string, number>
): PlayerValues {
  if (playerIdToScore.count() == 0) {
    return new PlayerValues(Map());
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

/**
 * Interface for classes that can encode as plain JS values that can survive
 * structured cloning and JSON string encoding
 */
export interface JsonSerializable {
  toJson(): any;
}

export interface Action extends JsonSerializable, ValueObject {}

export interface Agent<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  act(snapshot: EpisodeSnapshot<C, S>): A;
}

// TODO add vector-able
export interface GameState extends JsonSerializable {
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
 * Convenience {@link ChanceKey} for deterministic transitions
 */
export const NO_CHANCE = [];

export const episodeConfigurationJson = io.type({ players: playersJson });

type EncodedEpisodeConfiguration = io.TypeOf<typeof episodeConfigurationJson>;

/**
 * Configuration info shared by all games
 */
export class EpisodeConfiguration implements JsonSerializable {
  constructor(readonly players: Players) {}
  toJson(): EncodedEpisodeConfiguration {
    return { players: this.players.toJson() };
  }
  static decode(encoded: any): EpisodeConfiguration {
    const decoded = decodeOrThrow(episodeConfigurationJson, encoded);
    return new EpisodeConfiguration(Players.decode(decoded.players));
  }
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
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  playerCounts: number[];
  // newEpisode(config: EpisodeConfiguration): Episode<any, StateT, ActionT>;
  /**
   * Returns a new episode using a default game configuration
   */
  newEpisode(config: EpisodeConfiguration): EpisodeSnapshot<C, S>;

  isLegalAction(snapshot: EpisodeSnapshot<C, S>, action: A): boolean;

  apply(snapshot: EpisodeSnapshot<C, S>, action: A): [S, ChanceKey];

  // tensorToAction(tensor: tf.Tensor): ActionT;

  // gameOver(snapshot: EpisodeSnapshot<GameConfigurationT, StateT>): boolean;
  result(snapshot: EpisodeSnapshot<C, S>): PlayerValues | undefined;
  /** Returns the state for {@link playerId} if it's a valid player ID or else throws an error */
  // playerState(playerId: string): PlayerState;
  // result: GameResult | undefined;

  /** Returns the current player or undefined if the game is over */
  currentPlayer(snapshot: EpisodeSnapshot<C, S>): Player | undefined;

  decodeConfiguration(json: any): C;

  decodeState(json: any): S;

  decodeAction(json: any): A;
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
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  currentSnapshot: EpisodeSnapshot<C, S>;

  constructor(
    readonly game: Game<C, S, A>,
    readonly snapshot: EpisodeSnapshot<C, S> // readonly episodeConfig: EpisodeConfiguration, // readonly gameConfig: C, // state: S
  ) {
    this.currentSnapshot = snapshot;
    // this.currentSnapshot = new EpisodeSnapshot(
    //   episodeConfig,
    //   gameConfig,
    //   state
    // );
  }

  apply(...actions: Array<A>): Episode<C, S, A> {
    for (let action of actions) {
      // Ignore chance keys
      const [newState] = this.game.apply(this.currentSnapshot, action);
      this.currentSnapshot = this.currentSnapshot.derive(newState);
    }
    return this;
    // return [newState, chanceKey];
  }

  // batch(actions: A[]): Episode<C, S, A> {
  //   for (let action of actions) {
  //     this.apply(action);
  //   }
  //   return this;
  // }
}

// export function unroll<StateT extends GameState, ActionT extends Action>(
//   episode: Episode<any, StateT, ActionT>,
//   actions: ReadonlyArray<ActionT>
// ) {
//   for (let action of actions) {
//     episode.apply(action);
//   }
//   // let [result] = episode.apply(actions[0]);
//   // for (const action of actions.slice(1)) {
//   //   [result] = episode.apply(action);
//   // }
//   // return episode.currentSnapshot.derive(result);
// }

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
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(
  game: Game<C, S, A>,
  config: EpisodeConfiguration,
  playerIdToAgent: Map<string, Agent<C, S, A>>
): Generator<EpisodeSnapshot<C, S>, EpisodeSnapshot<C, S>, unknown> {
  let snapshot = game.newEpisode(config);
  let episode = new Episode(game, snapshot);
  yield episode.currentSnapshot;
  while (game.result(episode.currentSnapshot) == undefined) {
    const currentPlayer = game.currentPlayer(episode.currentSnapshot);
    if (currentPlayer == undefined) {
      throw new Error(`Current player is undefined but game isn't over`);
    }
    const agent = playerIdToAgent.get(currentPlayer.id);
    if (agent == undefined) {
      throw new Error(`No agent for ${currentPlayer.id}`);
    }
    const action = agent.act(episode.currentSnapshot);
    episode.apply(action);
    yield episode.currentSnapshot;
  }
  return episode.currentSnapshot;
}
