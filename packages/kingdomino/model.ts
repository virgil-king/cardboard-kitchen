import {
  EpisodeConfiguration,
  EpisodeSnapshot,
  Player,
  PlayerValues,
  Players,
} from "game";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffers,
  playAreaRadius,
  playAreaSize,
  KingdominoVectors,
  LocationState,
} from "./base.js";
import { KingdominoState, NextAction, nextActions } from "./state.js";
import { ActionCase, KingdominoAction } from "./action.js";
import {
  InferenceModel,
  InferenceResult,
  Model,
  ModelCodecType,
  ModelMetadata,
  TrainingModel,
} from "mcts";
import { Map, Range, Seq } from "immutable";
import tfTypes from "@tensorflow/tfjs";
import { Kingdomino } from "./kingdomino.js";
import {
  randomBelow,
  randomBoolean,
  requireDefined,
  requireNotDone,
} from "studio-util";
import _ from "lodash";
import { Terrain, Tile, terrainValues } from "./tile.js";
import {
  VectorCodec,
  OneHotCodec,
  ObjectCodec,
  ArrayCodec,
  CodecValueType,
  ScalarCodec,
  OptionalCodec,
  RawCodec,
  Sparse2dCodec,
  decodeAsGenerator,
} from "./codec.js";
import { PlayerBoard } from "./board.js";
import {
  BoardTransformation,
  Direction,
  NO_TRANSFORM,
  Vector2,
} from "./util.js";
import { ActionStatistics, StateTrainingData } from "training-data";
import { Linearization } from "./linearization.js";
import { BroadcastLayer } from "./broadcastlayer.js";
import { ExpandDimsLayer } from "./expanddims.js";
import * as tf from "@tensorflow/tfjs";

/*
 * This model is a function from state to per-player value and move
 * probabilities for the current player.
 *
 * Move probabilities are encoded as one output per possible (not necessarily
 * legal) move.
 */

/**
 * Size used in various places in the model shape that take arbitrary sizes.
 *
 * Can be used to scale model size across multiple axes.
 */
const SIZE_FACTOR = 16;

const HIDDEN_LAYER_WIDTH = 64;

class TerrainTypeCodec implements VectorCodec<Terrain> {
  private readonly oneHotCodec = new OneHotCodec(terrainValues.length);
  readonly columnCount = this.oneHotCodec.columnCount;
  encode(value: Terrain, into: Float32Array, offset: number): void {
    this.oneHotCodec.encode(value, into, offset);
  }
  decode(from: Float32Array, offset: number): Terrain {
    return this.oneHotCodec.decode(from, offset);
  }
}

class NextActionCodec implements VectorCodec<NextAction> {
  readonly codec = new OneHotCodec(nextActions.length);
  readonly columnCount = this.codec.columnCount;
  encode(value: NextAction, into: Float32Array, offset: number): void {
    this.codec.encode(requireDefined(nextActions.indexOf(value)), into, offset);
  }
  decode(from: Float32Array, offset: number): NextAction {
    throw new Error("Method not implemented.");
  }
}

// Exported for testing
export const locationPropertiesCodec = new ObjectCodec({
  terrain: new TerrainTypeCodec(),
  crowns: new ScalarCodec(),
});

export class LocationStateCodec implements VectorCodec<LocationState> {
  columnCount = locationPropertiesCodec.columnCount;
  encode(value: LocationState, into: Float32Array, offset: number): void {
    const locationProperties = value.properties();
    locationPropertiesCodec.encode(
      {
        terrain: locationProperties.terrain,
        crowns: locationProperties.crowns,
      },
      into,
      offset
    );
  }
  decode(from: Float32Array, offset: number): LocationState {
    throw new Error("Not implemented");
  }
}

// Exported for testing
export const locationStateCodec = new LocationStateCodec();

// Exported for testing
export const boardCodec = new (class
  implements VectorCodec<Map<Vector2, LocationState>>
{
  readonly mapCodec = new Sparse2dCodec(
    -playAreaRadius,
    playAreaRadius + 1,
    -playAreaRadius,
    playAreaRadius + 1,
    locationStateCodec
  );
  readonly columnCount = this.mapCodec.columnCount;
  readonly centerOffset = this.mapCodec.linearization.getOffset(
    playAreaRadius,
    playAreaRadius
  );
  readonly centerProperties = { terrain: Terrain.TERRAIN_CENTER, crowns: 0 };
  encode(
    value: Map<Vector2, LocationState>,
    into: Float32Array,
    offset: number
  ): void {
    this.mapCodec.encode(value, into, offset);
    // Encode the center square which isn't included in board maps
    locationPropertiesCodec.encode(
      this.centerProperties,
      into,
      this.centerOffset
    );
  }
  decode(from: Float32Array, offset: number): Map<Vector2, LocationState> {
    throw new Error("Method not implemented.");
  }
})();

const tileCodec = new ArrayCodec(locationPropertiesCodec, 2);

const tileOfferCodec = new ObjectCodec({
  locationProperties: new OptionalCodec(tileCodec),
  claimPlayerIndex: new OptionalCodec(
    new OneHotCodec(Kingdomino.INSTANCE.maxPlayerCount)
  ),
});

type TileOfferValue = CodecValueType<typeof tileOfferCodec>;

const playerStateCodec = new ObjectCodec({
  score: new ScalarCodec(),
});

// Visible for testing
// TODO included drawn or remaining tile numbers
/** Codec for non-board game state */
export const linearStateCodec = new ObjectCodec({
  currentPlayerIndex: new OneHotCodec(Kingdomino.INSTANCE.maxPlayerCount),
  nextAction: new NextActionCodec(),
  remainingTilesCount: new ScalarCodec(),
  nextOffers: new OptionalCodec(new ArrayCodec(tileOfferCodec, 4)),
  previousOffers: new OptionalCodec(new ArrayCodec(tileOfferCodec, 4)),
  playerState: new ArrayCodec(
    new OptionalCodec(playerStateCodec),
    Kingdomino.INSTANCE.maxPlayerCount
  ),
});

type StateCodecValue = CodecValueType<typeof linearStateCodec>;

const playerValueCodec = new ScalarCodec();

const playerValuesCodec = new ArrayCodec(
  playerValueCodec,
  Kingdomino.INSTANCE.maxPlayerCount
);

// Indexes in this array are the index of the claimed offer
const claimProbabilitiesCodec = new RawCodec(
  Kingdomino.INSTANCE.maxTurnsPerRound
);

// The contents of this codec are interpreted using placementPolicyLinearization.
// A custom codec is not used here because decoding uses move legality
// information which doesn't fit neatly into a value type.
const placeProbabilitiesCodec = new RawCodec(playAreaSize * playAreaSize * 4);

/**
 * Shape of placement policy matrices: x -> y -> 4 (# of directions)
 */
const placementPolicyShape = [
  playAreaSize,
  playAreaSize,
  Direction.valuesArray.length,
];

// x => y => direction => prior
export const placementPolicyLinearization = new Linearization(
  placementPolicyShape,
  true
);

// Visible for testing
// This codec is only used to size the hidden layer that provides these outputs
export const linearPolicyCodec = new ObjectCodec({
  claimProbabilities: claimProbabilitiesCodec,
  discardProbability: new ScalarCodec(),
});

// Visible for testing
export const policyCodec = new ObjectCodec({
  linearPolicy: linearPolicyCodec,
  placeProbabilities: placeProbabilitiesCodec,
});

type PolicyOutput = CodecValueType<typeof policyCodec>;

// Visible for testing
export class EncodedState {
  constructor(
    readonly linearState: Float32Array,
    readonly boards: ReadonlyArray<Float32Array>,
    /** Index into {@link boards} identifying the current player's board */
    readonly currentPlayerIndex: number
  ) {}
}

export class EncodedSample {
  constructor(
    readonly state: EncodedState,
    /** Encoded using {@link playerValuesCodec} */
    readonly valueOutput: Float32Array,
    /** Encoding using {@link linearPolicyCodec} */
    readonly policyOutput: Float32Array
  ) {}
}

// TODOS:
// - add linear input to placement policy module?
// - include raw location data in the board internal layers instead of
//   pinching it together with non-location data in an entrance layer
export class KingdominoModel
  implements
    Model<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction,
      EncodedSample
    >
{
  static maxPlayerCount = requireDefined(
    Seq(Kingdomino.INSTANCE.playerCounts).max()
  );

  static nextActions = [NextAction.CLAIM_OFFER, NextAction.RESOLVE_OFFER];

  inferenceModel = new KingdominoInferenceModel(this);
  private _trainingModel: KingdominoTrainingModel | undefined;

  static fresh(): KingdominoModel {
    const linearInput = tf.input({
      shape: [linearStateCodec.columnCount],
      name: "linear_input",
    });
    console.log(`Linear input shape is ${linearInput.shape}`);

    // One analysis board input per player
    const boardModule = new BoardAnalysisModule();
    const boardInputs = Range(0, Kingdomino.INSTANCE.maxPlayerCount)
      .map((playerIndex) =>
        tf.layers.input({
          shape: BoardInputTensor.shape,
          name: `analysis_board_input_${playerIndex}`,
        })
      )
      .toArray();

    // Policy board input is equal to the analysis board input for the
    // current player
    const policyBoardInput = tf.layers.input({
      shape: BoardInputTensor.shape,
      name: `policy_board_input`,
    });

    // Analysis board outputs are a 1x1xN vectors. Flatten them and concatenate
    // them with with the linear input as the input to the dense layers stack.
    const boardAnalysisOutputs = boardInputs.map((input) => {
      const boardModuleOutput = boardModule.apply(linearInput, input);
      return tf.layers
        .flatten()
        .apply(boardModuleOutput) as tfTypes.SymbolicTensor;
    });

    const concat = tf.layers
      .concatenate({ name: "concat_linear_input_with_board_analysis" })
      .apply([linearInput, ...boardAnalysisOutputs]) as tfTypes.SymbolicTensor;
    console.log(`Concat shape is ${concat.shape}`);

    let hiddenOutput = concat;
    for (const i of Range(0, 4)) {
      hiddenOutput = tf.layers
        .dense({
          units: HIDDEN_LAYER_WIDTH,
          name: `hidden_dense_${i}`,
        })
        .apply(hiddenOutput) as tfTypes.SymbolicTensor;
      hiddenOutput = tf.layers
        .batchNormalization({ name: `hidden_norm_${i}` })
        .apply(hiddenOutput) as tfTypes.SymbolicTensor;
      hiddenOutput = tf.layers
        .reLU({ name: `hidden_relu_${i}` })
        .apply(hiddenOutput) as tfTypes.SymbolicTensor;
    }

    // Output layer containing state value for each player
    const valueOutput = tf.layers
      .dense({
        units: playerValuesCodec.columnCount,
        activation: "relu",
        name: "value_output",
      })
      .apply(hiddenOutput) as tfTypes.SymbolicTensor;

    // Internal layer containing the non-placement policy values
    const linearPolicyOutput = tf.layers
      .dense({
        units: linearPolicyCodec.columnCount,
        activation: "relu",
        name: "linear_policy_output",
      })
      .apply(hiddenOutput) as tfTypes.SymbolicTensor;

    const linearInputPlusHiddenOutput = tf.layers
      .concatenate({ name: "concat_linear_input_with_hidden_output" })
      .apply([linearInput, hiddenOutput]) as tfTypes.SymbolicTensor;

    // Placement policy module input is linear input plus dense stack output
    // plus policy board input
    const placementPolicyModule = new PlacementPolicyModule();
    const placementPolicyOutput = placementPolicyModule.apply(
      linearInputPlusHiddenOutput,
      policyBoardInput
    );

    // Policy board output is 9x9x4 placement logits. Flatten it for concatenation
    // into the policy output layer.
    const flattenedPolicyBoardOutput = tf.layers
      .flatten({ name: "flatten_board_policy_output" })
      .apply(placementPolicyOutput) as tfTypes.SymbolicTensor;

    const policyOutput = tf.layers
      .concatenate({ name: "concat_policies" })
      .apply([
        linearPolicyOutput,
        flattenedPolicyBoardOutput,
      ]) as tfTypes.SymbolicTensor;

    const model = tf.model({
      inputs: [linearInput, ...boardInputs, policyBoardInput],
      outputs: [valueOutput, policyOutput],
    });

    const metadata = { trainingSampleCount: 0 } satisfies ModelMetadata;

    return new KingdominoModel(model, metadata);
  }

  /**
   * @param url path to the directory containing the model files
   */
  static async loadFromUrl(url: string): Promise<KingdominoModel> {
    console.log(`Loading model from ${url}`);
    const layersModel = await tf.loadLayersModel(`${url}/model.json`);
    console.log(
      `Input shape is ${(layersModel.input as tfTypes.SymbolicTensor[]).map(
        (t) => t.shape
      )}`
    );

    // Loading metadata from URLs is not supported
    const metadata = { trainingSampleCount: 0 } satisfies ModelMetadata;

    return new KingdominoModel(layersModel, metadata);
  }

  constructor(
    readonly model: tfTypes.LayersModel,
    readonly metadata: ModelMetadata | undefined
  ) {
    console.log(`Constructor metadata is ${JSON.stringify(metadata)}`);
  }

  logSummary() {
    this.model.summary(200);
  }

  dispose(): void {
    console.log(JSON.stringify(this.model.dispose()));
  }

  trainingModel(batchSize: number = 128): KingdominoTrainingModel {
    if (this._trainingModel != undefined) {
      return this._trainingModel;
    }
    const result = new KingdominoTrainingModel(this, batchSize);
    this._trainingModel = result;
    return result;
  }

  /**
   * Returns the vector-encoded representation of {@link snapshot}.
   *
   * By default does not mirror and rotate boards.
   *
   * @param playerIdToTransform can be used to apply separate mirroring and
   * rotation to each player board
   */
  encodeState(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>,
    playerIdToTransform: (player: Player) => BoardTransformation = () =>
      NO_TRANSFORM
  ): EncodedState {
    const linearInput = this.encodeLinearState(snapshot);

    const boardInputs = Range(0, Kingdomino.INSTANCE.maxPlayerCount)
      .map((playerIndex) => {
        if (
          playerIndex >= snapshot.episodeConfiguration.players.players.count()
        ) {
          // The zero board is fully symmetrical and doesn't need to be transformed
          return BoardInputTensor.boardZeros;
        } else {
          const player = requireDefined(
            snapshot.episodeConfiguration.players.players.get(playerIndex)
          );
          const transform = playerIdToTransform(player);
          return KingdominoModel.encodeBoard(
            snapshot.state
              .requirePlayerState(player.id)
              .board.transform(transform)
          );
        }
      })
      .toArray();

    const currentPlayerId = snapshot.state.requireCurrentPlayerId();
    const currentPlayerIndex =
      snapshot.episodeConfiguration.players.players.findIndex(
        (player) => player.id == currentPlayerId
      );
    if (currentPlayerIndex == -1) {
      throw new Error("No current player index");
    }

    return new EncodedState(linearInput, boardInputs, currentPlayerIndex);
  }

  // Visible for testing
  encodeLinearState(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ): Float32Array {
    const currentPlayer = requireDefined(
      Kingdomino.INSTANCE.currentPlayer(snapshot)
    );
    if (currentPlayer == undefined) {
      throw new Error("Model invoked with snapshot with no current player");
    }
    const nextAction = snapshot.state.nextAction;
    if (nextAction == undefined) {
      throw new Error("Model invoked with snapshot with no next action");
    }
    const currentPlayerIndex =
      snapshot.episodeConfiguration.players.players.indexOf(currentPlayer);
    const nextOffers = snapshot.state.props.nextOffers;
    const previousOffers = snapshot.state.props.previousOffers;
    const stateValue: StateCodecValue = {
      currentPlayerIndex: currentPlayerIndex,
      nextAction: nextAction,
      remainingTilesCount:
        snapshot.gameConfiguration.tileCount -
        snapshot.state.props.drawnTileNumbers.count(),
      nextOffers: this.encodeTileOffers(
        snapshot.episodeConfiguration,
        snapshot.state.props.nextOffers
      ),
      previousOffers: this.encodeTileOffers(
        snapshot.episodeConfiguration,
        snapshot.state.props.previousOffers
      ),
      playerState: _.range(0, Kingdomino.INSTANCE.maxPlayerCount).map(
        (playerIndex) => {
          if (
            playerIndex >= snapshot.episodeConfiguration.players.players.count()
          ) {
            return undefined;
          }
          const player = requireDefined(
            snapshot.episodeConfiguration.players.players.get(playerIndex)
          );
          const playerState = snapshot.state.requirePlayerState(player.id);
          return {
            score: playerState.score,
          };
        }
      ),
    };
    const result = new Float32Array(linearStateCodec.columnCount);
    linearStateCodec.encode(stateValue, result, 0);
    return result;
  }

  private encodeTileOffers(
    episodeConfig: EpisodeConfiguration,
    offers: TileOffers | undefined
  ): ReadonlyArray<TileOfferValue> | undefined {
    if (offers == undefined) {
      return undefined;
    }
    return offers.offers
      .map((offer) => {
        const claim = offer.claim;
        const claimPlayerIndex =
          claim == undefined
            ? undefined
            : episodeConfig.players.players.findIndex(
                (player) => player.id == claim.playerId
              );
        if (claimPlayerIndex == -1) {
          throw new Error(`Claim player was not found`);
        }
        return {
          locationProperties:
            offer.tileNumber == undefined
              ? undefined
              : Tile.withNumber(offer.tileNumber).properties,
          claimPlayerIndex: claimPlayerIndex,
        };
      })
      .toArray();
  }

  // Visible for testing
  static encodeBoard(board: PlayerBoard): Float32Array {
    const result = new Float32Array(BoardInputTensor.size);

    boardCodec.encode(board.locationStates, result, 0);

    return result;
  }

  /**
   * Returns the batch of states encoded as one linear input tensor and an
   * array of player board input tensors
   */
  stateBatchToTensors(states: ReadonlyArray<EncodedState>): {
    linearTensor: tfTypes.Tensor;
    boardAnalysisTensors: ReadonlyArray<tfTypes.Tensor>;
    boardPolicyTensor: tfTypes.Tensor;
  } {
    // Allocate a single Float32Array for each output tensor and encode the
    // batch into each of those arrays

    // Flattened indices: sample, linear state column
    const linearStateArray = new Float32Array(
      states.length * linearStateCodec.columnCount
    );
    // Flattened indices: player, sample, x, y, feature
    const boardSize = BoardInputTensor.size;
    const playerBoardArrays = _.range(
      0,
      Kingdomino.INSTANCE.maxPlayerCount
    ).map(() => new Float32Array(states.length * boardSize));

    const boardPolicyArray = new Float32Array(states.length * boardSize);

    for (const [sampleIndex, encodedState] of states.entries()) {
      // TODO try to use generators to encapsulate offset arithmetic
      linearStateArray.set(
        encodedState.linearState,
        sampleIndex * linearStateCodec.columnCount
      );
      for (const [playerIndex, playerBoard] of encodedState.boards.entries()) {
        playerBoardArrays[playerIndex].set(
          playerBoard,
          sampleIndex * boardSize
        );
      }
      boardPolicyArray.set(
        encodedState.boards[encodedState.currentPlayerIndex],
        sampleIndex * boardSize
      );
    }

    const linearInputTensor = tf.tensor(linearStateArray, [
      states.length,
      linearStateCodec.columnCount,
    ]);
    const boardAnalysisTensors = playerBoardArrays.map((boards) =>
      tf.tensor(boards, [states.length, 9, 9, 9])
    );
    const boardPolicyTensor = tf.tensor(boardPolicyArray, [
      states.length,
      9,
      9,
      9,
    ]);
    return {
      linearTensor: linearInputTensor,
      boardAnalysisTensors: boardAnalysisTensors,
      boardPolicyTensor: boardPolicyTensor,
    };
  }

  toJson(): Promise<ModelCodecType> {
    return new Promise((resolve) =>
      this.model.save({
        save: (modelArtifacts: tfTypes.io.ModelArtifacts) => {
          resolve({ modelArtifacts: modelArtifacts, metadata: this.metadata });

          return Promise.resolve({
            modelArtifactsInfo: {
              dateSaved: new Date(),
              modelTopologyType: "JSON",
            },
          });
        },
      })
    );
  }

  static async fromJson(encoded: ModelCodecType): Promise<KingdominoModel> {
    const model = await tf.loadLayersModel({
      load: () => {
        return Promise.resolve(encoded.modelArtifacts);
      },
    });
    return new KingdominoModel(model, encoded.metadata);
  }
}

export class KingdominoInferenceModel
  implements
    InferenceModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  constructor(private readonly model: KingdominoModel) {}

  async infer(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): Promise<ReadonlyArray<InferenceResult<KingdominoAction>>> {
    if (snapshots.length == 0) {
      throw new Error(`infer called with no snapshots`);
    }

    const encodedInputs = snapshots.map((snapshot) =>
      this.model.encodeState(snapshot)
    );
    const inputTensors = this.model.stateBatchToTensors(encodedInputs);

    try {
      let outputTensors = this.model.model.predict([
        inputTensors.linearTensor,
        ...inputTensors.boardAnalysisTensors,
        inputTensors.boardPolicyTensor,
      ]) as tfTypes.Tensor[];
      try {
        if (!Array.isArray(outputTensors)) {
          throw new Error("Expected tensor array but received single tensor");
        }
        if (outputTensors.length != 2) {
          throw new Error(
            `Expected 2 tensors but received ${outputTensors.length}`
          );
        }

        return await this.inferenceTensorsToInferenceResults(
          snapshots,
          outputTensors
        );
      } finally {
        for (const tensor of outputTensors) {
          tensor.dispose();
        }
      }
    } finally {
      inputTensors.linearTensor.dispose();
      for (const boardTensor of inputTensors.boardAnalysisTensors) {
        boardTensor.dispose();
      }
      inputTensors.boardPolicyTensor.dispose();
    }
  }

  private async inferenceTensorsToInferenceResults(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >,
    outputTensors: ReadonlyArray<tfTypes.Tensor>
  ): Promise<ReadonlyArray<InferenceResult<KingdominoAction>>> {
    const valuesArray = await outputTensors[0].data<"float32">();
    const policyArray = await outputTensors[1].data<"float32">();

    const valuesGenerator = decodeAsGenerator(
      playerValuesCodec,
      snapshots.length,
      valuesArray
    );
    const policyGenerator = decodeAsGenerator(
      policyCodec,
      snapshots.length,
      policyArray
    );

    const result = new Array<InferenceResult<KingdominoAction>>();
    for (const snapshot of snapshots) {
      const decodedValues = requireNotDone(valuesGenerator.next());
      const decodedPolicy = requireNotDone(policyGenerator.next());

      const playerValues = this.decodeValues(
        snapshot.episodeConfiguration.players,
        decodedValues
      );

      let policy = decodePolicy(snapshot, decodedPolicy);
      if (policy.isEmpty()) {
        throw new Error(`Empty policy!`);
      }
      result.push({
        value: playerValues,
        policy: policy,
      });
    }
    return result;
  }

  // Visible for testing
  decodeValues(players: Players, values: ReadonlyArray<number>): PlayerValues {
    const playerIdToValue = Map(
      players.players.map((player, index) => {
        const result = requireDefined(values[index]);
        if (Number.isNaN(result)) {
          throw new Error(`Player value was NaN`);
        }
        return [player.id, result];
      })
    );
    return new PlayerValues(playerIdToValue);
  }
}

// Visible for testing
export function decodePolicy(
  snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>,
  decodedPolicy: PolicyOutput
  // placementPolicy: Float32Array
): Map<KingdominoAction, number> {
  let result = Map<KingdominoAction, number>();
  const nextAction = snapshot.state.props.nextAction;

  if (nextAction == NextAction.CLAIM_OFFER) {
    // Claim actions
    result = result.merge(
      Seq(decodedPolicy.linearPolicy.claimProbabilities)
        .map<[KingdominoAction, number]>((probability, index) => [
          KingdominoAction.claimTile(new ClaimTile(index)),
          probability,
        ])
        .filter(([action]) => {
          const result = Kingdomino.INSTANCE.isLegalAction(snapshot, action);
          return result;
        })
    );
  } else if (nextAction == NextAction.RESOLVE_OFFER) {
    // Discard action
    const discardAction = KingdominoAction.discardTile();
    result = result.set(
      discardAction,
      decodedPolicy.linearPolicy.discardProbability
    );

    // Place actions
    placementPolicyLinearization.scan(
      decodedPolicy.placeProbabilities,
      (value, shiftedX, shiftedY, directionIndex) => {
        const action = KingdominoAction.placeTile(
          new PlaceTile(
            KingdominoVectors.instance(
              shiftedX - playAreaRadius,
              shiftedY - playAreaRadius
            ),
            Direction.fromIndex(requireDefined(directionIndex))
          )
        );
        if (Kingdomino.INSTANCE.isLegalAction(snapshot, action)) {
          result = result.set(action, value);
        }
      }
    );
  }

  return result;
}

// Visible for testing
export class ResidualBlock {
  private readonly conv1: tfTypes.layers.Layer;
  private readonly conv2: tfTypes.layers.Layer;

  // SIZE_FACTOR for tiled non-spatial data plus the original spatial data
  static filterCount = SIZE_FACTOR + locationStateCodec.columnCount;

  constructor() {
    this.conv1 = ResidualBlock.conv2D();
    this.conv2 = ResidualBlock.conv2D();
  }

  apply(input: tfTypes.SymbolicTensor): tfTypes.SymbolicTensor {
    let output = this.conv1.apply(input);
    output = tf.layers.batchNormalization().apply(output);
    output = tf.layers.reLU().apply(output);
    output = this.conv2.apply(output) as tfTypes.SymbolicTensor;
    output = tf.layers
      .batchNormalization()
      .apply(output) as tfTypes.SymbolicTensor;
    output = tf.layers.add().apply([input, output]);
    return tf.layers.reLU().apply(output) as tfTypes.SymbolicTensor;
  }

  static conv2D(): tfTypes.layers.Layer {
    return tf.layers.conv2d({
      kernelSize: 3,
      filters: this.filterCount,
      padding: "same",
      strides: 1,
    });
  }
}

class BoardInputTensor {
  static readonly channelCount = locationStateCodec.columnCount;
  static readonly shape = [
    playAreaSize,
    playAreaSize,
    BoardInputTensor.channelCount,
  ];
  static readonly size =
    playAreaSize * playAreaSize * BoardInputTensor.channelCount;
  static readonly locationZeros = new Array<number>(
    BoardInputTensor.channelCount
  ).fill(0);
  static readonly boardZeros = new Float32Array(BoardInputTensor.size);
  static linearization = new Linearization(
    [playAreaSize, playAreaSize, BoardInputTensor.channelCount],
    /* strict= */ true
  );
}

/**
 * Network module for analyzing player boards.
 *
 * Input shapes are [,N] (game linear input) and [9,9,9] (board state)
 * Output shape is [1,1,SIZE_FACTOR]
 */
class BoardAnalysisModule {
  /** Number of steps needed to traverse a kingdom from corner to corner */
  private static blockCount = 8;

  static readonly outputChannelCount = SIZE_FACTOR;

  static readonly outputSize =
    playAreaSize * playAreaSize * this.outputChannelCount;

  // Compress linear input down to SIZE_FACTOR columns
  private linearInputCompressor: tfTypes.layers.Layer;

  // Aggreggate the entire board into one vector of output channels
  private outputLayer: tfTypes.layers.Layer;

  private readonly blocks: ReadonlyArray<ResidualBlock>;

  private readonly inputMerger: BoardInputMerger;

  constructor() {
    this.linearInputCompressor = tf.layers.dense({
      units: SIZE_FACTOR,
      activation: "relu",
      name: "board_analysis_compress_linear_input",
    });
    this.outputLayer = tf.layers.conv2d({
      kernelSize: playAreaSize,
      filters: BoardAnalysisModule.outputChannelCount,
      strides: 1,
      activation: "relu",
      name: "board_analysis_output",
    });
    this.blocks = Range(0, BoardAnalysisModule.blockCount)
      .map((_) => {
        console.log(`Creating new residual block`);
        return new ResidualBlock();
      })
      .toArray();
    this.inputMerger = new BoardInputMerger("board_analysis");
  }

  apply(
    linearInput: tfTypes.SymbolicTensor,
    boardInput: tfTypes.SymbolicTensor
  ): tfTypes.SymbolicTensor {
    let compressedLinearInput = this.linearInputCompressor.apply(
      linearInput
    ) as tfTypes.SymbolicTensor;

    let output = this.inputMerger.apply(compressedLinearInput, boardInput);
    output = tf.layers
      .batchNormalization()
      .apply(output) as tfTypes.SymbolicTensor;
    output = tf.layers.reLU().apply(output) as tfTypes.SymbolicTensor;

    for (const block of this.blocks) {
      output = block.apply(output);
    }

    output = this.outputLayer.apply(output) as tfTypes.SymbolicTensor;

    return output;
  }
}

class BoardInputMerger {
  constructor(readonly namePrefix: string) {}

  readonly expandDims = new ExpandDimsLayer({
    name: `${this.namePrefix}_expand_dims`,
    shape: [1, 1],
  });

  readonly broadcast = new BroadcastLayer({
    name: `${this.namePrefix}_broadcast`,
    shape: [null, playAreaSize, playAreaSize, null],
  });

  readonly concat = tf.layers.concatenate({
    name: `${this.namePrefix}_concat`,
  });

  /**
   * Takes a batch of linear inputs and board inputs encoded using {@link boardCodec}.
   *
   * Returns a {@link tfTypes.SymbolicTensor} defined by tiling the linear inputs
   * to match the spatial dimensions of the board inputs and then stacking
   * those two tensors together.
   */
  apply(
    linearInput: tfTypes.SymbolicTensor,
    boardInput: tfTypes.SymbolicTensor
  ): tfTypes.SymbolicTensor {
    // Broadcast the batch of linear input vectors to a batch of 2d matrices of
    // those vectors.
    // First insert two new dimensions around each batch item...
    console.log(`linearInput shape: ${linearInput.shape}`);
    // Then tile the last dimension in the previous two dimensions
    const tiledLinearInput = this.broadcast.apply(
      this.expandDims.apply(linearInput)
    ) as tfTypes.SymbolicTensor;

    console.log(`expandDims shape: ${this.expandDims.outputShape}`);
    console.log(`broadcast shape: ${this.broadcast.outputShape}`);

    // Finally stack the tiled linear input and board input
    return this.concat.apply([
      tiledLinearInput,
      boardInput,
    ]) as tfTypes.SymbolicTensor;
  }
}

/**
 * Network module for analyzing player boards.
 *
 * Input shapes are [,N] (hidden layer output) and [9,9,9] (board state)
 * Output shape is [9,9,4]: x, y, placement direction
 */
class PlacementPolicyModule {
  /** Number of steps needed to traverse a kingdom from corner to corner */
  private static blockCount = 8;

  static readonly outputChannelCount = 4;

  private readonly inputMerger: BoardInputMerger;

  // Compress linear input down to SIZE_FACTOR columns
  private linearInputCompressor: tfTypes.layers.Layer;

  private readonly blocks: ReadonlyArray<ResidualBlock>;

  // Pixel-wise downsize internal channel count to output channel count
  private outputLayer: tfTypes.layers.Layer;

  constructor() {
    this.inputMerger = new BoardInputMerger("board_policy");
    this.linearInputCompressor = tf.layers.dense({
      units: SIZE_FACTOR,
      activation: "relu",
      name: "placement_policy_compress_linear_input",
    });
    this.blocks = Range(0, PlacementPolicyModule.blockCount)
      .map((_) => {
        return new ResidualBlock();
      })
      .toArray();
    this.outputLayer = tf.layers.conv2d({
      name: "placement_policy_output",
      kernelSize: 1,
      filters: PlacementPolicyModule.outputChannelCount,
      strides: 1,
      activation: "relu",
    });
  }

  apply(
    linearInput: tfTypes.SymbolicTensor,
    boardInput: tfTypes.SymbolicTensor
  ): tfTypes.SymbolicTensor {
    let compressedLinearInput = this.linearInputCompressor.apply(
      linearInput
    ) as tfTypes.SymbolicTensor;

    let output = this.inputMerger.apply(compressedLinearInput, boardInput);
    output = tf.layers
      .batchNormalization()
      .apply(output) as tfTypes.SymbolicTensor;
    output = tf.layers.reLU().apply(output) as tfTypes.SymbolicTensor;

    for (const block of this.blocks) {
      output = block.apply(output);
    }

    output = this.outputLayer.apply(output) as tfTypes.SymbolicTensor;

    console.log(`Placement policy module output shape is ${output.shape}`);

    return output;
  }
}

export class KingdominoTrainingModel
  implements
    TrainingModel<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction,
      EncodedSample
    >
{
  // private readonly tensorboard = tf.node.tensorBoard("/tmp/tensorboard");
  private readonly optimizer: tfTypes.Optimizer;

  constructor(
    private readonly model: KingdominoModel,
    private readonly batchSize: number = 128
  ) {
    this.optimizer = tf.train.adam();

    this.model.model.compile({
      optimizer: this.optimizer,
      // MSE for value and cross entropy for policy
      loss: [tf.losses.meanSquaredError, tf.losses.softmaxCrossEntropy],
    });
  }

  /**
   * Returns the vector-encoded representation of {@link sample}.
   *
   * By default randomly mirrors and rotates player boards and the current
   * player's policy.
   *
   * @param playerToBoardTransform can be used to apply separate board mirroring
   * and rotation to each player's board
   */
  encodeSample(
    sample: StateTrainingData<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >,
    playerToBoardTransform?: (player: Player) => BoardTransformation
  ): EncodedSample {
    // If a transform map was provided, use it; otherwise generate a map of
    // random transforms
    const innerPlayerToBoardTransform = (() => {
      if (playerToBoardTransform != undefined) {
        return playerToBoardTransform;
      }
      const playerIdToRandomBoardTransform = Map(
        sample.snapshot.episodeConfiguration.players.players.map((player) => {
          return [
            player.id,
            {
              mirror: randomBoolean(),
              quarterTurns: randomBelow(4),
            },
          ];
        })
      );
      return (player: Player) =>
        requireDefined(playerIdToRandomBoardTransform.get(player.id));
    })();

    const state = this.model.encodeState(
      sample.snapshot,
      innerPlayerToBoardTransform
    );
    const value = this.encodeValues(
      sample.snapshot.episodeConfiguration.players,
      sample.terminalValues
    );
    const currentPlayer = requireDefined(
      Kingdomino.INSTANCE.currentPlayer(sample.snapshot)
    );
    const currentPlayerBoardTransform =
      innerPlayerToBoardTransform(currentPlayer);
    const linearPolicy = encodePolicy(
      sample.actionToStatistics,
      currentPlayerBoardTransform
    );
    return new EncodedSample(state, value, linearPolicy);
  }

  async train(dataPoints: ReadonlyArray<EncodedSample>): Promise<number> {
    if (dataPoints.length != this.batchSize) {
      throw new Error(`Number of samples did not equal batch size`);
    }
    // Flattened indices: sample, linear state column
    const linearStateArray = new Float32Array(
      this.batchSize * linearStateCodec.columnCount
    );
    // Flattened indices: player, sample, x, y, feature
    const boardSize = BoardInputTensor.size;
    const playerBoardArrays = _.range(
      0,
      Kingdomino.INSTANCE.maxPlayerCount
    ).map(() => new Float32Array(this.batchSize * boardSize));
    const policyBoardArray = new Float32Array(this.batchSize * boardSize);
    for (const [sampleIndex, encodedSample] of dataPoints.entries()) {
      const encodedState = encodedSample.state;
      linearStateArray.set(
        encodedState.linearState,
        sampleIndex * linearStateCodec.columnCount
      );
      for (const [
        playerIndex,
        playerBoard,
      ] of encodedSample.state.boards.entries()) {
        playerBoardArrays[playerIndex].set(
          playerBoard,
          sampleIndex * boardSize
        );
      }
      policyBoardArray.set(
        encodedState.boards[encodedState.currentPlayerIndex],
        sampleIndex * boardSize
      );
    }
    const valuesMatrix = Seq(dataPoints)
      .map((sample) => sample.valueOutput)
      .toArray();
    const policyMatrix = Seq(dataPoints)
      .map((sample) => sample.policyOutput)
      .toArray();
    const linearInputTensor = tf.tensor(linearStateArray, [
      dataPoints.length,
      linearStateCodec.columnCount,
    ]);
    const boardTensors = playerBoardArrays.map((boards) =>
      tf.tensor(boards, [dataPoints.length, 9, 9, 9])
    );
    const policyBoardTensor = tf.tensor(policyBoardArray, [
      dataPoints.length,
      9,
      9,
      9,
    ]);
    const valueOutputTensor = tf.tensor(valuesMatrix);
    const policyOutputTensor = tf.tensor(policyMatrix);

    try {
      const fitResult = await this.model.model.trainOnBatch(
        [linearInputTensor, ...boardTensors, policyBoardTensor],
        [valueOutputTensor, policyOutputTensor]
      );
      console.log(fitResult);

      const metadata = this.model.metadata;
      if (metadata != undefined) {
        metadata.trainingSampleCount += dataPoints.length;
      }

      return (fitResult as number[])[0];
    } finally {
      linearInputTensor.dispose();
      for (const boardTensor of boardTensors) {
        boardTensor.dispose();
      }
      policyBoardTensor.dispose();
      valueOutputTensor.dispose();
      policyOutputTensor.dispose();
    }
  }

  encodeValues(players: Players, terminalValues: PlayerValues): Float32Array {
    const valuesArray = _.range(0, Kingdomino.INSTANCE.maxPlayerCount).map(
      (playerIndex) => {
        if (playerIndex >= players.players.count()) {
          return 0;
        }
        return requireDefined(
          terminalValues.playerIdToValue.get(
            requireDefined(players.players.get(playerIndex)).id
          )
        );
      }
    );
    // Using the codec here mainly just provides column count enforcement
    const result = new Float32Array(playerValuesCodec.columnCount);
    playerValuesCodec.encode(valuesArray, result, 0);
    return result;
  }
}

/**
 * Encodes {@link visitCounts}, transformed by {@link boardTransform},
 * as probabilities in a new {@link Float32Array}.
 */
// Visible for testing
export function encodePolicy(
  visitCounts: Map<KingdominoAction, ActionStatistics>,
  boardTransform: BoardTransformation
): Float32Array {
  const claimProbabilities = new Float32Array(
    claimProbabilitiesCodec.columnCount
  ).fill(0);
  let discardProbability = 0;
  let placeProbability = 0;
  for (const [action, statistics] of visitCounts.entries()) {
    switch (action.data.case) {
      case ActionCase.CLAIM: {
        claimProbabilities[action.data.claim.offerIndex] =
          statistics.visitCount;
        break;
      }
      case ActionCase.PLACE: {
        // Place probability is the sum of visits for all placement actions
        placeProbability += statistics.visitCount;
        break;
      }
      case ActionCase.DISCARD: {
        discardProbability = statistics.visitCount;
        break;
      }
    }
  }

  const placementProbabilities = encodePlacementPolicy(
    visitCounts,
    boardTransform
  );

  const result = new Float32Array(policyCodec.columnCount);
  const policy = {
    linearPolicy: {
      claimProbabilities: claimProbabilities,
      discardProbability: discardProbability,
    },
    placeProbabilities: placementProbabilities,
  } satisfies PolicyOutput;
  policyCodec.encode(policy, result, 0);

  const sum = result.reduce((reduction, next) => reduction + next, 0);
  return result.map((x) => x / sum);
}

/**
 * Encodes the placement action statistics in {@link visitCounts},
 * transformed by {@link boardTransform}, into a new
 * {@link Float32Array} in the format associated with
 * {@link placeProbabilitiesCodec}.
 *
 * Values are raw visit counts rather than probabilities.
 */
// Visible for testing
export function encodePlacementPolicy(
  visitCounts: Map<KingdominoAction, ActionStatistics>,
  boardTransform: BoardTransformation
): Float32Array {
  const result = new Float32Array(placeProbabilitiesCodec.columnCount);

  for (const [action, statistics] of visitCounts.entries()) {
    if (action.data.case == ActionCase.PLACE) {
      setPlacementVisitCount(
        action.data.place.transform(boardTransform),
        statistics.visitCount,
        result
      );
    }
  }

  return result;
}

export function setPlacementVisitCount(
  placeTile: PlaceTile,
  visitCount: number,
  into: Float32Array
) {
  placementPolicyLinearization.set(
    into,
    visitCount,
    placeTile.location.x + playAreaRadius,
    placeTile.location.y + playAreaRadius,
    placeTile.direction.index
  );
}
