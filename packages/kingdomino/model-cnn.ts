import {
  EpisodeConfiguration,
  EpisodeSnapshot,
  PlayerValues,
  Players,
} from "game";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffers,
  boardIndices,
  defaultLocationProperties,
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
  TrainingModel,
} from "training";
import { Map, Range, Seq } from "immutable";
import tf from "@tensorflow/tfjs-node-gpu";
import tfcore, { Conv3DBackpropFilterV2 } from "@tensorflow/tfjs-core";
import { Kingdomino } from "./kingdomino.js";
import {
  randomBelow,
  randomBetween,
  randomBoolean,
  requireDefined,
} from "studio-util";
import _ from "lodash";
import { LocationProperties, Terrain, Tile, terrainValues } from "./tile.js";
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
} from "./codec.js";
import { PlayerBoard } from "./board.js";
import {
  BoardTransformation,
  Direction,
  NO_TRANSFORM,
  Vector2,
} from "./util.js";
import { ActionStatistics, StateTrainingData } from "training-data";
import { stat } from "fs";
import { Linearization } from "./linearization.js";

/*
 * This model is a function from state to per-player value and move
 * probabilities for the current player.
 *
 * Move probabilities are encoded as one output per possible (not necessarily
 * legal) move.
 */

const SCHEMA_VERSION = 0;

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

const valueCodec = new ObjectCodec({
  playerValues: new RawCodec(Kingdomino.INSTANCE.maxPlayerCount),
});

// Indexes in this array are the index of the claimed offer
const claimProbabilitiesCodec = new RawCodec(
  Kingdomino.INSTANCE.maxTurnsPerRound
);
const discardProbabilityCodec = new ScalarCodec();

// Indexes in this array are (index of direction in Direction.values) + (4 * (y
// + (9 * x))). A custom codec is not used here because decoding uses move
// legality information which doesn't fit neatly into a value type.
const placeProbabilitiesCodec = new RawCodec(playAreaSize * playAreaSize * 4);

// x => y => direction => prior
export const policyLinearization = new Linearization(
  [playAreaSize, playAreaSize, 4],
  true
);

export function setPlacementVisitCount(
  placeTile: PlaceTile,
  visitCount: number,
  into: Float32Array
) {
  policyLinearization.set(
    into,
    visitCount,
    placeTile.location.x + playAreaRadius,
    placeTile.location.y + playAreaRadius,
    placeTile.direction.index
  );
}

// Visible for testing
export const policyCodec = new ObjectCodec({
  claimProbabilities: claimProbabilitiesCodec,
  discardProbability: discardProbabilityCodec,
  placeProbabilities: placeProbabilitiesCodec,
});

// export enum HiddenLayerStructure {
//   ONE_HALF_SIZE,
//   FOUR_EIGHTH_SIZE,
// }

// Visible for testing
export class EncodedState {
  constructor(
    readonly linearState: Float32Array,
    readonly boards: ReadonlyArray<Float32Array>
  ) {}
}

export class EncodedSample {
  constructor(
    readonly state: EncodedState,
    readonly valueOutput: Float32Array,
    readonly policyOutput: Float32Array
  ) {}
}

export class KingdominoConvolutionalModel
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

  model: tf.LayersModel;

  inferenceModel = new KingdominoInferenceModel(this);
  private _trainingModel: KingdominoTrainingModel | undefined;

  static fresh(): KingdominoConvolutionalModel {
    console.log(
      `Model has ${
        linearStateCodec.columnCount +
        Kingdomino.INSTANCE.maxPlayerCount * BoardModule.inputSize
      } input dimensions and ${
        valueCodec.columnCount + policyCodec.columnCount
      } output dimensions`
    );
    // Halfway between total input and output size
    const linearInputLayer = tf.input({
      shape: [linearStateCodec.columnCount],
      name: "linear_input",
    });
    console.log(`Linear input shape is ${linearInputLayer.shape}`);

    const boardModule = new BoardModule();
    const boardInputs = Range(0, Kingdomino.INSTANCE.maxPlayerCount)
      .map((playerIndex) =>
        tf.layers.input({
          shape: BoardModule.inputShape,
          name: `board_input_${playerIndex}`,
        })
      )
      .toArray();
    // console.log(`Board input shapes are ${boardInputs.map((it) => it.shape)}`);

    const boardOutputs = boardInputs.map((input) => {
      const residualStackOutput = boardModule.apply(input);
      // console.log(`Residual stack output is ${residualStackOutput.shape}`);
      return tf.layers
        .flatten()
        .apply(residualStackOutput) as tf.SymbolicTensor;
    });
    // console.log(
    //   `Board outputs are ${boardOutputs.map((output) => output.shape)}`
    // );

    const concat = tf.layers
      .concatenate({ name: "concat" })
      .apply([linearInputLayer, ...boardOutputs]) as tf.SymbolicTensor;
    console.log(`Concat shape is ${concat.shape}`);
    const concatOutputSize =
      linearStateCodec.columnCount + 4 * BoardModule.outputSize;
    console.log(`Computed concat output size is ${concatOutputSize}`);

    let hiddenOutput = tf.layers
      .dense({
        units: 512,
        name: "hidden",
        // kernelRegularizer: tf.regularizers.l2
      })
      .apply(concat);
    hiddenOutput = tf.layers.batchNormalization().apply(hiddenOutput);
    hiddenOutput = tf.layers.reLU().apply(hiddenOutput);

    const valueOutput = tf.layers
      .dense({
        units: valueCodec.columnCount,
        activation: "relu",
        name: "value_output",
      })
      .apply(hiddenOutput) as tf.SymbolicTensor;

    const policyOutput = tf.layers
      .dense({
        units: policyCodec.columnCount,
        activation: "relu",
        name: "policy_output",
      })
      .apply(hiddenOutput) as tf.SymbolicTensor;

    // console.log(
    //   `Input shapes are ${[linearInputLayer, ...boardInputs].map(
    //     (input) => input.shape
    //   )}`
    // );
    // console.log(
    //   `Output shapes are ${[valueOutput, policyOutput].map(
    //     (output) => output.shape
    //   )}`
    // );

    const model = tf.model({
      inputs: [linearInputLayer, ...boardInputs],
      outputs: [valueOutput, policyOutput],
    });

    // model.summary();

    return new KingdominoConvolutionalModel(model);
  }

  /**
   * @param path path to the directory containing the model files
   */
  static async load(path: string): Promise<KingdominoConvolutionalModel> {
    const layersModel = await tf.loadLayersModel(`file://${path}/model.json`);
    // console.log(layersModel.getWeights().toString());
    console.log(
      `Input shape is ${(layersModel.input as tf.SymbolicTensor[]).map(
        (t) => t.shape
      )}`
    );

    return new KingdominoConvolutionalModel(layersModel);
  }

  constructor(model: tf.LayersModel) {
    this.model = model;
  }

  save(path: string): Promise<void> {
    return new Promise((r) => {
      this.model.save(`file://${path}`);
      r();
    });
  }

  trainingModel(batchSize: number = 128): KingdominoTrainingModel {
    if (this._trainingModel != undefined) {
      return this._trainingModel;
    }
    const result = new KingdominoTrainingModel(this, batchSize);
    this._trainingModel = result;
    return result;
  }

  encodeState(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>,
    boardTransformation: BoardTransformation = NO_TRANSFORM
  ): EncodedState {
    const linearInput = this.encodeLinearState(snapshot);

    const boardInputs = Range(0, Kingdomino.INSTANCE.maxPlayerCount)
      .map((playerIndex) => {
        if (
          playerIndex >= snapshot.episodeConfiguration.players.players.count()
        ) {
          // The zero board is fully symmetrical and doesn't need to be transformed
          return BoardModule.boardZeros;
        } else {
          const player = requireDefined(
            snapshot.episodeConfiguration.players.players.get(playerIndex)
          );
          return KingdominoConvolutionalModel.encodeBoard(
            snapshot.state
              .requirePlayerState(player.id)
              // TODO separate random transform for each player
              .board.transform(boardTransformation)
          );
        }
      })
      .toArray();

    return new EncodedState(linearInput, boardInputs);
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
            // locationState: this.encodeBoard(
            //   snapshot.state.requirePlayerState(player.id).board
            // ),
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
    const result = new Float32Array(BoardModule.inputSize);

    boardCodec.encode(board.locationStates, result, 0);

    // for (const gameX of _.range(-playAreaRadius, playAreaRadius + 1)) {
    //   const matrixX = gameX + playAreaRadius;
    //   const xOffset = matrixX * playAreaSize * BoardModule.inputChannelCount;
    //   for (const gameY of _.range(-playAreaRadius, playAreaRadius + 1)) {
    //     const matrixY = gameY + playAreaRadius;
    //     const yOffset = matrixY * BoardModule.inputChannelCount;
    //     const properties = board.getLocationState(
    //       KingdominoVectors.instance(gameX, gameY)
    //     );
    //     if (properties == defaultLocationProperties) {
    //       // Leave default zeros alone
    //       continue;
    //     }
    //     locationPropertiesCodec.encode(properties, result, xOffset + yOffset);
    //   }
    // }

    // for (const gameX of _.range(-playAreaRadius, playAreaRadius + 1)) {
    //   const matrixX = gameX + playAreaRadius;
    //   // const xOffset = matrixX * playAreaSize * BoardModule.inputChannelCount;
    //   for (const gameY of _.range(-playAreaRadius, playAreaRadius + 1)) {
    //     const matrixY = gameY + playAreaRadius;
    //     // const yOffset = matrixY * BoardModule.inputChannelCount;
    //     const properties = board.getLocationState(
    //       KingdominoVectors.instance(gameX, gameY)
    //     );
    //     if (properties == defaultLocationProperties) {
    //       // Leave default zeros alone
    //       continue;
    //     }
    //     BoardModule.linearization.set();
    //     locationPropertiesCodec.encode(properties, result, xOffset + yOffset);
    //   }
    // }

    return result;
  }

  /**
   * Returns the batch of states encoded as one linear input tensor and an
   * array of player board input tensors
   */
  stateBatchToTensors(
    states: ReadonlyArray<EncodedState>
  ): [tf.Tensor, ReadonlyArray<tf.Tensor>] {
    // Allocate a single Float32Array for each output tensor and encode the
    // batch into each of those arrays

    // Flattened indices: sample, linear state column
    const linearStateArray = new Float32Array(
      states.length * linearStateCodec.columnCount
    );
    // Flattened indices: player, sample, x, y, feature
    const boardSize = BoardModule.inputSize;
    const playerBoardArrays = _.range(
      0,
      Kingdomino.INSTANCE.maxPlayerCount
    ).map(() => new Float32Array(states.length * boardSize));
    for (const [sampleIndex, encodedState] of states.entries()) {
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
    }
    const linearInputTensor = tf.tensor(linearStateArray, [
      states.length,
      linearStateCodec.columnCount,
    ]);
    const boardTensors = playerBoardArrays.map((boards) =>
      tf.tensor(boards, [states.length, 9, 9, 9])
    );
    return [linearInputTensor, boardTensors];
  }

  toJson(): Promise<tfcore.io.ModelArtifacts> {
    return new Promise((resolve) =>
      this.model.save({
        save: (modelArtifacts: tfcore.io.ModelArtifacts) => {
          resolve(modelArtifacts);

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

  static async fromJson(
    artifacts: tfcore.io.ModelArtifacts
  ): Promise<KingdominoConvolutionalModel> {
    const model = await tf.loadLayersModel({
      load: () => {
        return Promise.resolve(artifacts);
      },
    });
    return new KingdominoConvolutionalModel(model);
  }
}

export class KingdominoInferenceModel
  implements
    InferenceModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  constructor(private readonly model: KingdominoConvolutionalModel) {}

  infer(
    snapshots: ReadonlyArray<
      EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
    >
  ): ReadonlyArray<InferenceResult<KingdominoAction>> {
    const encodedInputs = snapshots.map((snapshot) =>
      this.model.encodeState(snapshot)
    );
    const [linearInput, boardInputs] =
      this.model.stateBatchToTensors(encodedInputs);
    // const encodedInput = this.model.encodeState(snapshots);
    // const inputTensor = tf.tensor([
    //   encodedInput.linearState,
    //   ...encodedInput.boardStates,
    // ]);
    // const inputTensor = tf.tensor([]);
    // console.log(`tensor is ${tensor.toString()}`);
    // const linearTensor = tf.tensor([encodedInput.linearState]);
    // const boardTensors = encodedInput.boards.map((playerBoard) =>
    //   tf.tensor(playerBoard, [1, 9, 9, 9])
    // );
    // const inputTensors = [linearTensor, ...boardTensors];

    let outputTensor = this.model.model.predict([linearInput, ...boardInputs]);
    linearInput.dispose();
    for (const boardTensor of boardInputs) {
      boardTensor.dispose();
    }
    if (!Array.isArray(outputTensor)) {
      throw new Error("Expected tensor array but received single tensor");
    }
    if (outputTensor.length != 2) {
      throw new Error(`Expected 2 tensors but received ${outputTensor.length}`);
    }
    // const [values, policy] = this.parseOutputVector(
    //   snapshot.episodeConfiguration.players,
    //   (prediction as tf.Tensor).arraySync() as number[]
    // );
    const result = new Array<InferenceResult<KingdominoAction>>();
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      const playerValues = this.decodeValues(
        snapshot.episodeConfiguration.players,
        new Float32Array(this.unwrapNestedArrays(outputTensor[0].arraySync()))
      );
      const policy = this.decodePolicy(
        snapshot,
        new Float32Array(this.unwrapNestedArrays(outputTensor[1].arraySync()))
      );
      // console.log(
      //   `infer: policy is ${JSON.stringify(policy.toArray(), undefined, 2)}`
      // );
      result.push({
        value: playerValues,
        policy: policy,
      });
    }
    for (const tensor of outputTensor) {
      tensor.dispose();
    }
    return result;
  }

  // Visible for testing
  decodeValues(players: Players, vector: Float32Array): PlayerValues {
    // console.log(`decodeValues: vector is ${vector}`);
    const output = valueCodec.decode(vector, 0);
    const playerIdToValue = Map(
      players.players.map((player, index) => [
        player.id,
        output.playerValues[index],
      ])
    );
    return new PlayerValues(playerIdToValue);
  }

  decodePolicy(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>,
    vector: Float32Array
  ): Map<KingdominoAction, number> {
    const output = policyCodec.decode(vector, 0);
    let policy = Map<KingdominoAction, number>();
    const nextAction = snapshot.state.props.nextAction;

    if (nextAction == NextAction.CLAIM_OFFER) {
      // Claim actions
      policy = policy.merge(
        Seq(output.claimProbabilities)
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
      if (Kingdomino.INSTANCE.isLegalAction(snapshot, discardAction)) {
        policy = policy.set(discardAction, output.discardProbability);
      }

      // Place actions
      // let placeProbabilityIndex = 0;
      // for (const x of boardIndices) {
      //   for (const y of boardIndices) {
      //     for (const direction of Direction.valuesArray) {
      // for (let i = 0; i < output.placeProbabilities.length; i++) {
      // const visitCount =
      policyLinearization.scan(
        output.placeProbabilities,
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
            policy = policy.set(action, value);
          }
        }
      );
      // }
      // placeProbabilityIndex++;
      // }
      // }
      // }
    }

    // console.log(`Decoded ${policy.count()} legal actions`);

    return policy;
  }

  unwrapNestedArrays(arrayish: any): ReadonlyArray<number> {
    while (true) {
      if (Array.isArray(arrayish)) {
        if (typeof arrayish[0] == "number") {
          return arrayish;
        }
        arrayish = arrayish[0];
      } else {
        throw new Error("No number[] found");
      }
    }
  }
}

// Visible for testing
export class BoardResidualBlock {
  private readonly conv1 = BoardResidualBlock.conv2D();
  private readonly conv2 = BoardResidualBlock.conv2D();

  static filterCount = 64;

  constructor() {}

  apply(input: tf.SymbolicTensor): tf.SymbolicTensor {
    let output = this.conv1.apply(input);
    output = tf.layers.batchNormalization().apply(output);
    output = tf.layers.reLU().apply(output);
    output = this.conv2.apply(output) as tf.SymbolicTensor;
    output = tf.layers.batchNormalization().apply(output) as tf.SymbolicTensor;
    output = tf.layers.add().apply([input, output]);
    return tf.layers.reLU().apply(output) as tf.SymbolicTensor;
  }

  static conv2D(): tf.layers.Layer {
    return tf.layers.conv2d({
      kernelSize: 3,
      filters: this.filterCount,
      padding: "same",
      strides: 1,
    });
  }
}

/**
 * Network subgraph for processing player boards.
 *
 * Input format is 9x9x9: x => y => channel (terrain type and crown count)
 * Output format is 9x9x64: x => y => output feature
 */
class BoardModule {
  /** Number of steps needed to traverse a kingdom from corner to corner */
  private static blockCount = 8;

  static readonly inputChannelCount = locationStateCodec.columnCount;
  static readonly outputChannelCount = BoardResidualBlock.filterCount;

  static readonly inputShape = [
    playAreaSize,
    playAreaSize,
    this.inputChannelCount,
  ];

  static readonly inputSize =
    playAreaSize * playAreaSize * this.inputChannelCount;
  static readonly outputSize =
    playAreaSize * playAreaSize * this.outputChannelCount;

  static readonly locationZeros = new Array<number>(
    this.inputChannelCount
  ).fill(0);
  static readonly boardZeros = new Float32Array(this.inputSize);

  static linearization = new Linearization(
    [playAreaSize, playAreaSize, this.inputChannelCount],
    /* strict= */ true
  );

  private inputLayer = tf.layers.conv2d({
    // TODO this should probably be 1
    kernelSize: 3,
    filters: BoardModule.outputChannelCount,
    padding: "same",
    strides: 1,
  });

  private readonly blocks = Range(0, BoardModule.blockCount).map((_) => {
    return new BoardResidualBlock();
  });

  apply(input: tf.SymbolicTensor): tf.SymbolicTensor {
    // Project the input shape to the residual block shape
    let output = this.inputLayer.apply(input) as tf.SymbolicTensor;
    output = tf.layers.batchNormalization().apply(output) as tf.SymbolicTensor;
    output = tf.layers.reLU().apply(output) as tf.SymbolicTensor;

    for (const block of this.blocks) {
      output = block.apply(output);
    }
    return output;
  }
}

function scaledLossOrMetric(
  fn: (yTrue: tf.Tensor, yPred: tf.Tensor) => tf.Tensor,
  scale: number
) {
  const scalar = tf.scalar(scale);
  return (yTrue: tf.Tensor, yPred: tf.Tensor) => {
    const upstream = fn(yTrue, yPred);
    return upstream.mul(scalar);
  };
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
  private readonly tensorboard = tf.node.tensorBoard("/tmp/tensorboard");
  private readonly optimizer: tf.Optimizer;

  constructor(
    private readonly model: KingdominoConvolutionalModel,
    private readonly batchSize: number = 128
  ) {
    this.optimizer = tf.train.adam();

    this.model.model.compile({
      optimizer: this.optimizer,
      // MSE for value and cross entropy for policy
      loss: [
        tf.losses.meanSquaredError,
        scaledLossOrMetric(tf.losses.softmaxCrossEntropy, 0.2),
      ],
    });
  }

  encodeSample(
    sample: StateTrainingData<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >,
    boardTransformation?: BoardTransformation
  ): EncodedSample {
    const transform = boardTransformation ?? {
      mirror: randomBoolean(),
      quarterTurns: randomBelow(4),
    };
    const state = this.model.encodeState(sample.snapshot, transform);
    const value = this.encodeValues(
      sample.snapshot.episodeConfiguration.players,
      sample.terminalValues
    );
    const policy = this.encodePolicy(sample.actionToStatistics, transform);
    return new EncodedSample(state, value, policy);
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
    // const playerBoards = new Array<Array<Float32Array>>();
    // for (const i of Range(0, Kingdomino.INSTANCE.maxPlayerCount)) {
    //   playerBoards[i] = new Array<Float32Array>();
    // }
    const boardSize = BoardModule.inputSize;
    // const sampleBoardsSize = Kingdomino.INSTANCE.maxPlayerCount * boardSize;
    const playerBoardArrays = _.range(
      0,
      Kingdomino.INSTANCE.maxPlayerCount
    ).map(() => new Float32Array(this.batchSize * boardSize));
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
        // playerBoards[playerIndex].push(encodedState.boardArrays[playerIndex]);
        // playerBoardArrays.set(
        //   playerBoard,
        //   sampleIndex * sampleBoardsSize + playerIndex * boardSize
        // );
      }
      // boardMatrix.push(encodedState.boardStatesArray);
    }
    // const statesMatrix = Seq(dataPoints)
    //   .map((sample) => this.model.encodeState(sample.snapshot))
    //   .toArray();
    const valuesMatrix = Seq(dataPoints)
      .map((sample) => sample.valueOutput)
      .toArray();
    const policyMatrix = Seq(dataPoints)
      .map((sample) => sample.policyOutput)
      .toArray();
    // console.log(
    //   `Calling fit with expected values ${JSON.stringify(
    //     valuesMatrix
    //   )} and ${JSON.stringify(policyMatrix)}`
    // );
    // const inputTensor = tf.tensor(
    //   statesMatrix.map((state) => [state.linearStateTensor, ...state.boardTensors])
    // );
    const linearInputTensor = tf.tensor(linearStateArray, [
      dataPoints.length,
      linearStateCodec.columnCount,
    ]);
    const boardTensors = playerBoardArrays.map((boards) =>
      tf.tensor(boards, [dataPoints.length, 9, 9, 9])
    );
    // console.log(`boardTensors: ${boardTensors}`);
    const valueOutputTensor = tf.tensor(valuesMatrix);
    const policyOutputTensor = tf.tensor(policyMatrix);
    const fitResult = await this.model.model.trainOnBatch(
      [linearInputTensor, ...boardTensors],
      [valueOutputTensor, policyOutputTensor]
      // {
      //   batchSize: this.batchSize,
      //   epochs: 1,
      //   verbose: 0,
      //   callbacks: this.tensorboard,
      // }
    );
    // console.log(`Loss: ${fitResult.onEpochEnd}`)
    linearInputTensor.dispose();
    for (const boardTensor of boardTensors) {
      boardTensor.dispose();
    }
    valueOutputTensor.dispose();
    policyOutputTensor.dispose();
    console.log(fitResult);
    // const epochLosses = fitResult.;
    // const loss = epochLosses[epochLosses.length - 1] as number;
    // console.log(`Losses: ${JSON.stringify(fitResult.history)}`);
    return (fitResult as number[])[0];
  }

  encodeValues(
    players: Players,
    terminalValues: PlayerValues
    // into: Float32Array,
    // offset: number
  ): Float32Array {
    const valuesVector = _.range(0, Kingdomino.INSTANCE.maxPlayerCount).map(
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
    const result = new Float32Array(valueCodec.columnCount);
    valueCodec.encode(
      { playerValues: new Float32Array(valuesVector) },
      result,
      0
    );
    return result;
  }

  // Visible for testing
  encodePolicy(
    visitCounts: Map<KingdominoAction, ActionStatistics>,
    boardTransformation: BoardTransformation = NO_TRANSFORM
  ): Float32Array {
    const claimProbabilities = new Float32Array(
      claimProbabilitiesCodec.columnCount
    ).fill(0);
    let discardProbability = 0;
    const placeProbabilities = new Float32Array(
      placeProbabilitiesCodec.columnCount
    ).fill(0);

    for (const [action, statistics] of visitCounts.entries()) {
      switch (action.data.case) {
        case ActionCase.CLAIM: {
          claimProbabilities[action.data.claim.offerIndex] =
            statistics.visitCount;
          break;
        }
        case ActionCase.DISCARD: {
          discardProbability = statistics.visitCount;
          break;
        }
        case ActionCase.PLACE: {
          setPlacementVisitCount(
            action.data.place.transform(boardTransformation),
            statistics.visitCount,
            placeProbabilities
          );
          break;
        }
      }
    }

    const result = new Float32Array(policyCodec.columnCount);
    policyCodec.encode(
      {
        claimProbabilities: claimProbabilities,
        discardProbability: discardProbability,
        placeProbabilities: placeProbabilities,
      },
      result,
      0
    );
    const sum = result.reduce((reduction, next) => reduction + next, 0);
    return result.map((x) => x / sum);
  }
}
