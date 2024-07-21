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
  playAreaRadius,
  playAreaSize,
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
import tf, { loadLayersModel } from "@tensorflow/tfjs-node-gpu";
import tfcore from "@tensorflow/tfjs-core";
import { Kingdomino } from "./kingdomino.js";
import { requireDefined } from "studio-util";
import _ from "lodash";
import { LocationProperties, Terrain, Tile, terrainValues } from "./tile.js";
import {
  TensorCodec,
  OneHotCodec,
  ObjectCodec,
  ArrayCodec,
  CodecValueType,
  ScalarCodec,
  OptionalOneHotCodec,
  OptionalCodec,
  RawCodec,
} from "./codec.js";
import { PlayerBoard } from "./board.js";
import { Direction, Vector2 } from "./util.js";
import { ActionStatistics, StateTrainingData } from "training-data";

/*
 * This model is a function from state to per-player value and move
 * probabilities for the current player.
 *
 * Move probabilities are encoded as one output per possible (not necessarily
 * legal) move.
 */

const SCHEMA_VERSION = 0;

class TerrainTypeCodec implements TensorCodec<Terrain> {
  private readonly oneHotCodec = new OneHotCodec(terrainValues.length);
  readonly columnCount = this.oneHotCodec.columnCount;
  encode(value: Terrain): ReadonlyArray<number> {
    return this.oneHotCodec.encode(value);
  }
  decode(values: ReadonlyArray<number>): Terrain {
    throw new Error("Method not implemented.");
  }
}

class NextActionCodec implements TensorCodec<NextAction> {
  readonly codec = new OneHotCodec(nextActions.length);
  readonly columnCount = this.codec.columnCount;
  private readonly zeros = new Array(this.columnCount).fill(0);
  encode(value: NextAction): ReadonlyArray<number> {
    return this.codec.encode(requireDefined(nextActions.indexOf(value)));
  }
  decode(values: ReadonlyArray<number>): NextAction {
    throw new Error("Method not implemented.");
  }
}

// const locationPropertiesCodec = new ObjectCodec({
//   terrainType: new TerrainTypeCodec(),
//   crownCount: new ScalarCodec(),
// });

// type LocationPropertiesValue = CodecValueType<typeof locationPropertiesCodec>;

// class LocationPropertiesCodec implements TensorCodec<LocationProperties> {
//   private readonly codec = new ObjectCodec({
//     terrain: new TerrainTypeCodec(),
//     crowns: new ScalarCodec(),
//   });
//   columnCount = this.codec.columnCount;
//   toTensor(value: LocationProperties): readonly number[] {
//     return this.codec.toTensor(value);
//   }
//   fromTensor(values: readonly number[]): LocationProperties {
//     throw new Error("Method not implemented.");
//   }
// }

const locationPropertiesCodec = new ObjectCodec({
  terrain: new TerrainTypeCodec(),
  crowns: new ScalarCodec(),
});

const tileCodec = new ArrayCodec(locationPropertiesCodec, 2);

type TileValue = CodecValueType<typeof tileCodec>;

const tileOfferCodec = new ObjectCodec({
  locationProperties: new OptionalCodec(tileCodec),
  claimPlayerIndex: new OptionalOneHotCodec(
    Kingdomino.INSTANCE.maxPlayerCount - 1
  ),
});

type TileOfferValue = CodecValueType<typeof tileOfferCodec>;

const playerStateCodec = new ObjectCodec({
  score: new ScalarCodec(),
  locationState: new ArrayCodec(
    locationPropertiesCodec,
    playAreaSize * playAreaSize
  ),
});

type PlayerStateValue = CodecValueType<typeof playerStateCodec>;

// Visible for testing
// TODO included drawn or remaining tile numbers
export const stateCodec = new ObjectCodec({
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

type StateCodecValue = CodecValueType<typeof stateCodec>;

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

export function placementToCodecIndex(placeTile: PlaceTile): number {
  const result =
    (placeTile.location.x + playAreaRadius) * 9 * 4 +
    (placeTile.location.y + playAreaRadius) * 4 +
    requireDefined(Direction.valuesArray.indexOf(placeTile.direction));
  // console.log(
  //   `Using index ${result} for placement ${JSON.stringify(placeTile)}`
  // );
  return result;
}

// export function codecIndexToPlacement(index: number): PlaceTile {
//   const x = Math.floor(index / (9 * 4));
//   let remainder = index % x;
//   const y = Math.floor(remainder / 4);
//   const direction = Direction.valuesArray[remainder % 4];
//   return new PlaceTile(new Vector2(x, y), direction);
// }

// Visible for testing
export const policyCodec = new ObjectCodec({
  claimProbabilities: claimProbabilitiesCodec,
  discardProbability: discardProbabilityCodec,
  placeProbabilities: placeProbabilitiesCodec,
});

export enum HiddenLayerStructure {
  ONE_HALF_SIZE,
  FOUR_EIGHTH_SIZE,
}

type AnyTensor =
  | tf.SymbolicTensor
  | tf.SymbolicTensor[]
  | tf.Tensor<tf.Rank>
  | tf.Tensor<tf.Rank>[];

export class KingdominoModel
  implements Model<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  static maxPlayerCount = requireDefined(
    Seq(Kingdomino.INSTANCE.playerCounts).max()
  );

  static nextActions = [NextAction.CLAIM_OFFER, NextAction.RESOLVE_OFFER];

  model: tf.LayersModel;

  inferenceModel = new KingdominoInferenceModel(this);
  private _trainingModel: KingdominoTrainingModel | undefined;

  static fresh(
    hiddenLayerStructure: HiddenLayerStructure = HiddenLayerStructure.ONE_HALF_SIZE
  ): KingdominoModel {
    console.log(
      `Model has ${stateCodec.columnCount} input dimensions and ${
        valueCodec.columnCount + policyCodec.columnCount
      } output dimensions`
    );
    // Halfway between total input and output size
    const inputLayer = tf.input({ shape: [stateCodec.columnCount] });
    let hiddenOutput = this.createHiddenLayers(
      hiddenLayerStructure,
      inputLayer
    );
    const valueLayer = tf.layers.dense({ units: valueCodec.columnCount });
    const valueOutput = valueLayer.apply(hiddenOutput) as tf.SymbolicTensor;
    const policyLayer = tf.layers.dense({ units: policyCodec.columnCount });
    const policyOutput = policyLayer.apply(hiddenOutput) as tf.SymbolicTensor;

    const model = tf.model({
      inputs: inputLayer,
      outputs: [valueOutput, policyOutput],
    });

    return new KingdominoModel(model);
  }

  static createHiddenLayers(
    hiddenLayerStructure: HiddenLayerStructure,
    inputLayer: tf.SymbolicTensor
  ): AnyTensor {
    if (hiddenLayerStructure == HiddenLayerStructure.ONE_HALF_SIZE) {
      const hiddenLayerSize =
        (stateCodec.columnCount +
          valueCodec.columnCount +
          policyCodec.columnCount) /
        2;
      const hiddenLayer = tf.layers.dense({
        //   inputShape: [stateCodec.columnCount],
        //   batchSize: batchSize,
        units: hiddenLayerSize,
      });
      return hiddenLayer.apply(inputLayer) as tf.SymbolicTensor;
    } else {
      const hiddenLayerSize = Math.round(
        (stateCodec.columnCount +
          valueCodec.columnCount +
          policyCodec.columnCount) /
          8
      );
      let input: AnyTensor = inputLayer;
      let output: AnyTensor | undefined = undefined;
      for (const layerIndex of Range(0, 4)) {
        const layer = tf.layers.dense({ units: hiddenLayerSize });
        output = layer.apply(input);
        input = output;
      }
      return requireDefined(output);
    }
  }

  /**
   * @param path path to the directory containing the model files
   */
  static async load(path: string): Promise<KingdominoModel> {
    const layersModel = await loadLayersModel(`file://${path}/model.json`);
    return new KingdominoModel(layersModel);
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

  // Visible for testing
  encodeState(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ): ReadonlyArray<number> {
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
            locationState: this.encodeBoard(
              snapshot.state.requirePlayerState(player.id).board
            ),
          };
        }
      ),
    };
    const numbers = stateCodec.encode(stateValue);
    return numbers;
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

  private encodeBoard(board: PlayerBoard): ReadonlyArray<LocationProperties> {
    const result = new Array<LocationProperties>();
    for (const x of _.range(-playAreaRadius, playAreaRadius + 1)) {
      for (const y of _.range(-playAreaRadius, playAreaRadius + 1)) {
        result.push(board.getLocationState(new Vector2(x, y)));
      }
    }
    return result;
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
  ): Promise<KingdominoModel> {
    const model = await tf.loadLayersModel({
      load: () => {
        return Promise.resolve(artifacts);
      },
    });
    return new KingdominoModel(model);
  }
}

export class KingdominoInferenceModel
  implements
    InferenceModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  constructor(private readonly model: KingdominoModel) {}

  infer(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ): InferenceResult<KingdominoAction> {
    const inputTensor = tf.tensor([this.model.encodeState(snapshot)]);
    // console.log(`tensor is ${tensor.toString()}`);
    let outputTensor = this.model.model.predict(inputTensor);
    inputTensor.dispose();
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
    const playerValues = this.decodeValues(
      snapshot.episodeConfiguration.players,
      this.unwrapNestedArrays(outputTensor[0].arraySync())
    );
    const policy = this.decodePolicy(
      snapshot,
      this.unwrapNestedArrays(outputTensor[1].arraySync())
    );
    for (const tensor of outputTensor) {
      tensor.dispose();
    }
    // console.log(
    //   `infer: policy is ${JSON.stringify(policy.toArray(), undefined, 2)}`
    // );
    return {
      value: playerValues,
      policy: policy,
    };
  }

  // Visible for testing
  decodeValues(players: Players, vector: ReadonlyArray<number>): PlayerValues {
    // console.log(`decodeValues: vector is ${vector}`);
    const output = valueCodec.decode(vector);
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
    vector: ReadonlyArray<number>
  ): Map<KingdominoAction, number> {
    const output = policyCodec.decode(vector);
    let policy = Map<KingdominoAction, number>();

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

    // Discard action
    const discardAction = KingdominoAction.discardTile();
    if (Kingdomino.INSTANCE.isLegalAction(snapshot, discardAction)) {
      policy = policy.set(discardAction, output.discardProbability);
    }

    // Place actions
    let placeProbabilityIndex = 0;
    for (const x of boardIndices) {
      for (const y of boardIndices) {
        for (const direction of Direction.valuesArray) {
          const action = KingdominoAction.placeTile(
            new PlaceTile(new Vector2(x, y), direction)
          );
          if (Kingdomino.INSTANCE.isLegalAction(snapshot, action)) {
            policy = policy.set(
              action,
              output.placeProbabilities[placeProbabilityIndex]
            );
          }
          placeProbabilityIndex++;
        }
      }
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

export class KingdominoTrainingModel
  implements
    TrainingModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  private readonly tensorboard = tf.node.tensorBoard("/tmp/tensorboard");
  private readonly optimizer: tf.Optimizer;

  constructor(
    private readonly model: KingdominoModel,
    private readonly batchSize: number = 128
  ) {
    this.optimizer = tf.train.momentum(0.001, 0.5);

    this.model.model.compile({
      optimizer: this.optimizer,
      // MSE for value and crossentry for policy
      loss: [tf.losses.meanSquaredError, tf.losses.softmaxCrossEntropy],
    });
  }

  async train(
    dataPoints: StateTrainingData<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >[]
  ): Promise<number> {
    if (dataPoints.length != this.batchSize) {
      throw new Error(`Number of samples did not equal batch size`);
    }
    const statesMatrix = Seq(dataPoints)
      .map((sample) => this.model.encodeState(sample.snapshot))
      .toArray();
    const valuesMatrix = Seq(dataPoints)
      .map((sample) =>
        this.encodeValues(
          sample.snapshot.episodeConfiguration.players,
          sample.terminalValues
        )
      )
      .toArray();
    const policyMatrix = Seq(dataPoints)
      .map((sample) => this.encodePolicy(sample.actionToStatistics))
      .toArray();
    // console.log(
    //   `Calling fit with expected values ${JSON.stringify(
    //     valuesMatrix
    //   )} and ${JSON.stringify(policyMatrix)}`
    // );
    const inputTensor = tf.tensor(statesMatrix);
    const valueOutputTensor = tf.tensor(valuesMatrix);
    const policyOutputTensor = tf.tensor(policyMatrix);
    const fitResult = await this.model.model.fit(
      inputTensor,
      // tf.tensor([valuesMatrix, policyMatrix]),
      [valueOutputTensor, policyOutputTensor],
      {
        batchSize: this.batchSize,
        epochs: 3,
        verbose: 0,
        callbacks: this.tensorboard,
      }
    );
    // console.log(`Loss: ${fitResult.onEpochEnd}`)
    inputTensor.dispose();
    valueOutputTensor.dispose();
    policyOutputTensor.dispose();
    const epochLosses = fitResult.history.loss;
    const loss = epochLosses[epochLosses.length - 1] as number;
    console.log(`Losses: ${JSON.stringify(fitResult.history)}`);
    return loss;
  }
  encodeValues(players: Players, values: PlayerValues): ReadonlyArray<number> {
    const valuesVector = _.range(0, Kingdomino.INSTANCE.maxPlayerCount).map(
      (playerIndex) => {
        if (playerIndex >= players.players.count()) {
          return 0;
        }
        return requireDefined(
          values.playerIdToValue.get(
            requireDefined(players.players.get(playerIndex)).id
          )
        );
      }
    );
    // Using the codec here mainly just provides column count enforcement
    return valueCodec.encode({ playerValues: valuesVector });
  }

  // Visible for testing
  encodePolicy(
    visitCounts: Map<KingdominoAction, ActionStatistics>
  ): ReadonlyArray<number> {
    const claimProbabilities = Array<number>(
      claimProbabilitiesCodec.columnCount
    ).fill(0);
    let discardProbability = 0;
    const placeProbabilities = Array<number>(
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
          placeProbabilities[placementToCodecIndex(action.data.place)] =
            statistics.visitCount;
          break;
        }
      }
    }

    const raw = policyCodec.encode({
      claimProbabilities: claimProbabilities,
      discardProbability: discardProbability,
      placeProbabilities: placeProbabilities,
    });
    const sum = raw.reduce((reduction, next) => reduction + next, 0);
    return raw.map((x) => x / sum);
  }
}
