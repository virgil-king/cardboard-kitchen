import {
  combineHashes,
  decodeOrThrow,
  requireDefined,
  sum,
} from "./util/util.js";
import { hash, List, Map, Seq, ValueObject } from "immutable";
import _ from "lodash";
import * as io from "io-ts";

export const playerCodec = io.type({ id: io.string, name: io.string });

type PlayerMessage = io.TypeOf<typeof playerCodec>;

export class Player implements ValueObject, JsonSerializable {
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
  encode(): PlayerMessage {
    return this;
  }
  static decode(message: any): Player {
    const decoded = decodeOrThrow(playerCodec, message);
    return new Player(decoded.id, decoded.name);
  }
}

export const playersCodec = io.type({
  players: io.array(playerCodec),
});

type PlayersMessage = io.TypeOf<typeof playersCodec>;

export class Players implements ValueObject, JsonSerializable {
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
  encode(): PlayersMessage {
    return { players: this.players.toArray().map((it) => it.encode()) };
  }
  static decode(message: any): Players {
    const decoded = decodeOrThrow(playersCodec, message);
    return new Players(
      ...decoded.players.map((encoded) => Player.decode(encoded))
    );
  }
}

export const playerValuesCodec = io.type({
  playerIdToValue: io.array(io.tuple([io.string, io.number])),
});

type PlayerValuesMessage = io.TypeOf<typeof playerValuesCodec>;

/**
 * Map from player to "value" which is defined by the player's position with
 * respect to the other players in the game.
 *
 * Instances may be actual final game results or predicted results from
 * non-final game states.
 */
export class PlayerValues implements JsonSerializable {
  constructor(readonly playerIdToValue: Map<string, number>) {
    for (const entry of playerIdToValue.entries()) {
      if (Number.isNaN(entry[1])) {
        throw new Error("Player value cannot be NaN");
      }
      if (entry[1] < 0 || entry[1] > 1) {
        throw new Error(`Player value ${entry[1]} is not between 0 and 1`);
      }
    }
  }
  requirePlayerValue(player: Player): number {
    return requireDefined(this.playerIdToValue.get(player.id));
  }
  encode(): PlayerValuesMessage {
    return {
      playerIdToValue: this.playerIdToValue.entrySeq().toArray(),
    };
  }
  static decode(message: any): PlayerValues {
    const decoded = decodeOrThrow(playerValuesCodec, message);
    return new PlayerValues(Map(decoded.playerIdToValue));
  }
}

/** Returns a {@link PlayerValues} with values defined by position in the provided tiers */
export function tiersToPlayerValues(
  /**
   * Tiers of player IDs. Tiers are ordered by finishing position (earlier is
   * better). Players in the same tier are tied.
   */
  playerIds: Array<Array<string>>
) {
  const playerCount = sum(Seq(playerIds).map((it) => it.length));
  const valuePerDefeatedOpponent = 1 / (playerCount - 1);
  let playerIdToValue = Map<string, number>();
  let laterTiersSize = 0;
  for (let tierIndex = playerIds.length - 1; tierIndex >= 0; tierIndex--) {
    const tier = playerIds[tierIndex];
    const thisTierSize = tier.length;
    // Value in this tier is one for all players in lower tiers plus half for
    // other players in this tier
    const defeatedOpponentCount = laterTiersSize + (thisTierSize - 1) * 0.5;
    const thisTierValue = valuePerDefeatedOpponent * defeatedOpponentCount;
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
 * Interface for classes that can encode themselves as plain JS values that can
 * survive structured cloning and JSON string encoding
 */
export interface JsonSerializable {
  encode(): any;
}

export interface Action extends JsonSerializable, ValueObject {}

export interface Agent<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> {
  act(snapshot: EpisodeSnapshot<C, S>): Promise<A>;
}

export interface GameState extends JsonSerializable {}

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

export const episodeConfigurationCodec = io.type({ players: playersCodec });

type EpisodeConfigurationMessage = io.TypeOf<typeof episodeConfigurationCodec>;

/**
 * Configuration info shared by all games
 */
export class EpisodeConfiguration implements JsonSerializable {
  constructor(readonly players: Players) {}
  encode(): EpisodeConfigurationMessage {
    return { players: this.players.encode() };
  }
  static decode(encoded: any): EpisodeConfiguration {
    const decoded = decodeOrThrow(episodeConfigurationCodec, encoded);
    return new EpisodeConfiguration(Players.decode(decoded.players));
  }
}

/**
 * Game-specific configuration
 */
export interface GameConfiguration extends JsonSerializable {}

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
  /**
   * Returns a new episode using a default game configuration
   */
  newEpisode(config: EpisodeConfiguration): EpisodeSnapshot<C, S>;

  legalActions(snapshot: EpisodeSnapshot<C, S>): Iterable<A>;

  isLegalAction(snapshot: EpisodeSnapshot<C, S>, action: A): boolean;

  apply(snapshot: EpisodeSnapshot<C, S>, action: A): [S, ChanceKey];

  result(snapshot: EpisodeSnapshot<C, S>): PlayerValues | undefined;

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
    readonly snapshot: EpisodeSnapshot<C, S>
  ) {
    this.currentSnapshot = snapshot;
  }

  apply(...actions: Array<A>): Episode<C, S, A> {
    for (let action of actions) {
      // Ignore chance keys
      const [newState] = this.game.apply(this.currentSnapshot, action);
      this.currentSnapshot = this.currentSnapshot.derive(newState);
    }
    return this;
  }
}
