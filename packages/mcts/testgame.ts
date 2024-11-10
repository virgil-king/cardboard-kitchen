import {
  Player,
  scoresToPlayerValues,
  Game,
  Action,
  GameState,
  PlayerValues,
  EpisodeConfiguration,
  JsonSerializable,
  GameConfiguration,
  EpisodeSnapshot,
} from "game";

import { Map, Range, Set } from "immutable";
import { Tensor, Rank } from "@tensorflow/tfjs";
import { decodeOrThrow, requireDefined } from "studio-util";
import { InferenceModel, TrainingModel } from "./model.js";
import * as io from "io-ts";
import { StateTrainingData } from "training-data";

class NotSerializable implements JsonSerializable {
  static readonly INSTANCE = new NotSerializable();

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}

export class NumberAction implements Action {
  constructor(readonly number: number) {}
  equals(other: unknown): boolean {
    if (!(other instanceof NumberAction)) {
      return false;
    }
    return this.number == other.number;
  }
  hashCode(): number {
    return this.number;
  }
  toJson(): number {
    return io.number.encode(this.number);
  }
  static decode(encoded: any): NumberAction {
    const decoded = decodeOrThrow(io.number, encoded);
    return new NumberAction(decoded);
  }
}

// In "Pick A Number", each player gets one turn to pick a number, which equals
// their final score

const pickANumberConfigurationJson = io.type({
  availableNumbers: io.array(io.number),
});

type EncodedPickANumberConfiguration = io.TypeOf<
  typeof pickANumberConfigurationJson
>;

export class PickANumberConfiguration implements GameConfiguration {
  constructor(readonly availableNumbers: Set<number>) {}
  toJson(): EncodedPickANumberConfiguration {
    return { availableNumbers: this.availableNumbers.toArray() };
  }
  static decode(encoded: any): PickANumberConfiguration {
    const decoded = decodeOrThrow(pickANumberConfigurationJson, encoded);
    return new PickANumberConfiguration(Set(decoded.availableNumbers));
  }
}

const pickANumberStateJson = io.type({
  playerIdToNumber: io.array(io.tuple([io.string, io.number])),
  remainingNumbers: io.array(io.number),
});

type EncodedPickANumberState = io.TypeOf<typeof pickANumberStateJson>;

export class PickANumberState implements GameState {
  constructor(
    // readonly config: EpisodeConfiguration,
    readonly playerIdToNumber: Map<string, number>,
    readonly remainingNumbers: Set<number>
  ) {}
  toJson(): EncodedPickANumberState {
    return {
      playerIdToNumber: this.playerIdToNumber.entrySeq().toArray(),
      remainingNumbers: this.remainingNumbers.toArray(),
    };
  }
  static decode(encoded: any): PickANumberState {
    const decoded = decodeOrThrow(pickANumberStateJson, encoded);
    return new PickANumberState(
      Map(decoded.playerIdToNumber),
      Set(decoded.remainingNumbers)
    );
  }
}

type PickANumberEpisodeSnapshot = EpisodeSnapshot<
  PickANumberConfiguration,
  PickANumberState
>;

export class PickANumber
  implements Game<PickANumberConfiguration, PickANumberState, NumberAction>
{
  playerCounts = [2, 3, 4];

  static INSTANCE = new PickANumber();

  newEpisode(config: EpisodeConfiguration): PickANumberEpisodeSnapshot {
    const availableNumbers = Set(Range(1, 10));
    return new EpisodeSnapshot(
      config,
      new PickANumberConfiguration(Set(Range(1, 10))),
      new PickANumberState(Map(), availableNumbers)
    );
  }

  isLegalAction(
    snapshot: EpisodeSnapshot<PickANumberConfiguration, PickANumberState>,
    action: NumberAction
  ): boolean {
    return snapshot.state.remainingNumbers.contains(action.number);
  }

  apply(
    snapshot: PickANumberEpisodeSnapshot,
    action: NumberAction
  ): [PickANumberState, any] {
    if (!snapshot.state.remainingNumbers.contains(action.number)) {
      throw new Error(`Chose unavailable number ${action.number}`);
    }
    const currentPlayer = requireDefined(this.currentPlayer(snapshot));
    return [
      new PickANumberState(
        snapshot.state.playerIdToNumber.set(currentPlayer.id, action.number),
        snapshot.state.remainingNumbers.remove(action.number)
      ),
      0,
    ];
  }

  result(snapshot: PickANumberEpisodeSnapshot): PlayerValues | undefined {
    if (
      snapshot.state.playerIdToNumber.count() <
      snapshot.episodeConfiguration.players.players.count()
    ) {
      return undefined;
    }
    return scoresToPlayerValues(snapshot.state.playerIdToNumber);
  }

  currentPlayer(snapshot: PickANumberEpisodeSnapshot): Player | undefined {
    return snapshot.episodeConfiguration.players.players.find(
      (player) => snapshot.state.playerIdToNumber.get(player.id) == undefined
    );
  }

  tensorToAction(tensor: Tensor<Rank>): NumberAction {
    throw new Error("Method not implemented.");
  }

  decodeConfiguration(json: any): PickANumberConfiguration {
    return PickANumberConfiguration.decode(json);
  }
  decodeState(json: any): PickANumberState {
    return PickANumberState.decode(json);
  }
  decodeAction(json: any): NumberAction {
    return NumberAction.decode(json);
  }
}

/**
 * Fake model for {@link PickANumber}.
 *
 * The policy function uses the move number itself as the probability.
 *
 * The value function acts as if the game will end up tied.
 */
export class PickANumberModel
  implements
    InferenceModel<GameConfiguration, PickANumberState, NumberAction>,
    TrainingModel<GameConfiguration, PickANumberState, NumberAction, any>
{
  static INSTANCE = new PickANumberModel();

  static STATE_VALUE = 0.5;

  infer(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<GameConfiguration, PickANumberState>
    >
  ): Promise<
    ReadonlyArray<{
      value: PlayerValues;
      policy: Map<NumberAction, number>;
    }>
  > {
    return Promise.resolve(
      snapshots.map((snapshot) => {
        return { value: this.value(snapshot), policy: this.policy(snapshot) };
      })
    );
  }

  private policy(
    snapshot: EpisodeSnapshot<GameConfiguration, PickANumberState>
  ): Map<NumberAction, number> {
    return Map(
      snapshot.state.remainingNumbers.map((number) => [
        new NumberAction(number),
        number,
      ])
    );
  }

  private value(
    snapshot: EpisodeSnapshot<GameConfiguration, PickANumberState>
  ): PlayerValues {
    const players = snapshot.episodeConfiguration.players.players;
    if (snapshot.state.playerIdToNumber.count() == players.count()) {
      console.log(`Value function called on finished game`);
    }
    return new PlayerValues(
      Map(players.map((player) => [player.id, PickANumberModel.STATE_VALUE]))
    );
  }

  encodeSample(
    sample: StateTrainingData<GameConfiguration, PickANumberState, NumberAction>
  ) {
    throw new Error("Method not implemented.");
  }

  async train(
    dataPoints: StateTrainingData<
      GameConfiguration,
      PickANumberState,
      NumberAction
    >[]
  ): Promise<number> {
    throw new Error("Method not implemented.");
  }
}
