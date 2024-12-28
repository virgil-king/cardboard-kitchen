import {
  PlayerValues,
  playerValuesCodec,
  GameState,
  Action,
  JsonSerializable,
  Game,
  GameConfiguration,
  episodeConfigurationCodec,
  EpisodeConfiguration,
  EpisodeSnapshot,
  decodeOrThrow,
} from "game";
import { Map } from "immutable";
import * as io from "io-ts";

/**
 * Interface for sequences that allows values to be generated lazily
 */
export interface LazyArray<T> {
  count(): number;
  get(index: number): T;
}

// The following two interfaces allow multiple concrete types to be used
// as inputs to logic that computes derived properties of search trees

export interface StateNodeInfo<A extends Action> {
  readonly visitCount: number;
  readonly predictedValues: PlayerValues;
  readonly actionToNodeInfo: Map<A, ActionNodeInfo>;
}

export interface ActionNodeInfo {
  readonly visitCount: number;
  readonly priorProbability: number;
  readonly priorLogit: number;
  readonly expectedValues: PlayerValues;
}

export class ActionStatistics implements ActionNodeInfo {
  constructor(
    /** Predicted probability that the current player would select this action */
    readonly priorProbability: number,
    readonly priorLogit: number,
    /** Number of times the action was visited by MCTS */
    readonly visitCount: number,
    /** Player values assigned by MCTS for the action */
    readonly expectedValues: PlayerValues
  ) {}
  toJson(): EncodedActionStatistics {
    return {
      priorProbability: this.priorProbability,
      priorLogit: this.priorLogit,
      visitCount: this.visitCount,
      expectedValues: this.expectedValues.encode(),
    };
  }
  static decode(encoded: any): ActionStatistics {
    const decoded = decodeOrThrow(actionStatisticsJson, encoded);
    return new ActionStatistics(
      decoded.priorProbability,
      decoded.priorLogit,
      decoded.visitCount,
      PlayerValues.decode(decoded.expectedValues)
    );
  }
}

const actionStatisticsJson = io.type({
  priorProbability: io.number,
  priorLogit: io.number,
  visitCount: io.number,
  expectedValues: playerValuesCodec,
});
type EncodedActionStatistics = io.TypeOf<typeof actionStatisticsJson>;

const stateSearchDataJson = io.type({
  state: io.any,
  predictedValues: playerValuesCodec,
  actionToStatistics: io.array(io.tuple([io.any, actionStatisticsJson])),
  visitCount: io.number,
});

type EncodedStateSearchData = io.TypeOf<typeof stateSearchDataJson>;

/**
 * Record of data associated with state search from one state
 */
export class StateSearchData<S extends GameState, A extends Action>
  implements JsonSerializable, StateNodeInfo<A>
{
  constructor(
    readonly state: S,
    /** Model-predicted values for this state, for diagnostic purposes only */
    readonly predictedValues: PlayerValues,
    readonly actionToStatistics: Map<A, ActionStatistics>,
    readonly visitCount: number
  ) {}

  get actionToNodeInfo(): Map<A, ActionNodeInfo> {
    return this.actionToStatistics;
  }

  encode(): EncodedStateSearchData {
    return {
      state: this.state.encode(),
      predictedValues: this.predictedValues.encode(),
      actionToStatistics: this.actionToStatistics
        .entrySeq()
        .map<[any, EncodedActionStatistics]>(([action, value]) => [
          action.encode(),
          value.toJson(),
        ])
        .toArray(),
      visitCount: this.visitCount,
    };
  }
  static decode<S extends GameState, A extends Action>(
    game: Game<GameConfiguration, S, A>,
    encoded: EncodedStateSearchData
  ): StateSearchData<S, A> {
    const decoded = decodeOrThrow(stateSearchDataJson, encoded);
    return new StateSearchData(
      game.decodeState(decoded.state),
      PlayerValues.decode(decoded.predictedValues),
      Map(
        decoded.actionToStatistics.map(([encodedAction, encodedValue]) => [
          game.decodeAction(encodedAction),
          ActionStatistics.decode(encodedValue),
        ])
      ),
      decoded.visitCount
    );
  }
}

export class StateTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements StateNodeInfo<A>
{
  constructor(
    /** Game state */
    readonly snapshot: EpisodeSnapshot<C, S>,
    /** Used to train the policy function */
    readonly actionToStatistics: Map<A, ActionStatistics>,
    /** Used to train the value function */
    readonly terminalValues: PlayerValues,
    /** Predicted player values for the state */
    readonly predictedValues: PlayerValues,
    readonly visitCount: number
  ) {
    if (
      snapshot.episodeConfiguration.players.players.count() !=
      terminalValues.playerIdToValue.count()
    ) {
      throw new Error(
        "Different player counts between config and terminal values"
      );
    }
  }

  get actionToNodeInfo(): Map<A, ActionNodeInfo> {
    return this.actionToStatistics;
  }
}

const episodeTrainingDataJson = io.type({
  episodeConfig: episodeConfigurationCodec,
  gameConfig: io.any,
  dataPoints: io.array(stateSearchDataJson),
  terminalState: io.any,
  terminalValues: playerValuesCodec,
});

type EncodedEpisodeTrainingData = io.TypeOf<typeof episodeTrainingDataJson>;

export class EpisodeTrainingData<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements JsonSerializable, LazyArray<StateTrainingData<C, S, A>>
{
  constructor(
    readonly episodeConfig: EpisodeConfiguration,
    readonly gameConfig: C,
    readonly dataPoints: Array<StateSearchData<S, A>>,
    /** Terminal state, for diagnostic purposes only */
    readonly terminalState: S,
    /** Terminal values, for diagnostic purposes only */
    readonly terminalValues: PlayerValues
  ) {}

  count(): number {
    return this.dataPoints.length;
  }

  get(index: number): StateTrainingData<C, S, A> {
    const stateSearchData = this.dataPoints[index];
    return new StateTrainingData(
      new EpisodeSnapshot(
        this.episodeConfig,
        this.gameConfig,
        stateSearchData.state
      ),
      stateSearchData.actionToStatistics,
      this.terminalValues,
      stateSearchData.predictedValues,
      stateSearchData.visitCount
    );
  }

  stateTrainingDataArray(): Array<StateTrainingData<C, S, A>> {
    const result = new Array<StateTrainingData<C, S, A>>();
    for (let i = 0; i < this.count(); i++) {
      result.push(this.get(i));
    }
    return result;
  }

  encode(): EncodedEpisodeTrainingData {
    return {
      episodeConfig: this.episodeConfig.encode(),
      gameConfig: this.gameConfig.encode(),
      terminalValues: this.terminalValues.encode(),
      dataPoints: this.dataPoints.map((it) => it.encode()),
      terminalState: this.terminalState.encode(),
    };
  }

  static decode<
    C extends GameConfiguration,
    S extends GameState,
    A extends Action
  >(game: Game<C, S, A>, encoded: any): EpisodeTrainingData<C, S, A> {
    const decoded = decodeOrThrow(episodeTrainingDataJson, encoded);
    return new EpisodeTrainingData(
      EpisodeConfiguration.decode(decoded.episodeConfig),
      game.decodeConfiguration(decoded.gameConfig),
      decoded.dataPoints.map((it) => StateSearchData.decode(game, it)),
      game.decodeState(decoded.terminalState),
      PlayerValues.decode(decoded.terminalValues)
    );
  }
}
