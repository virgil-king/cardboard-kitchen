import {
  EpisodeConfiguration,
  EpisodeSnapshot,
  Model,
  PlayerValues,
  Players,
} from "game";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
  boardIndices,
  playAreaRadius,
  playAreaSize,
} from "./base.js";
import {
  KingdominoPlayerState,
  KingdominoState,
  NextAction,
  nextActions,
} from "./state.js";
import { ActionCase, KingdominoAction, actionCases } from "./action.js";
import { InferenceResult, StateTrainingData } from "game/model.js";
import { List, Map, Seq } from "immutable";
import tf from "@tensorflow/tfjs-node-gpu";
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

export class KingdominoModel
  implements Model<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  static maxPlayerCount = requireDefined(
    Seq(Kingdomino.INSTANCE.playerCounts).max()
  );

  static nextActions = [NextAction.CLAIM_OFFER, NextAction.RESOLVE_OFFER];

  model: tf.LayersModel;
  optimizer: tf.Optimizer;

  constructor(readonly batchSize: number = 128) {
    console.log(
      `Model has ${stateCodec.columnCount} input dimensions and ${
        valueCodec.columnCount + policyCodec.columnCount
      } output dimensions`
    );
    // Halfway between total input and output size
    const inputLayer = tf.input({ shape: [stateCodec.columnCount] });
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
    const hiddenOutput = hiddenLayer.apply(inputLayer);
    const valueLayer = tf.layers.dense({ units: valueCodec.columnCount });
    const valueOutput = valueLayer.apply(hiddenOutput) as tf.SymbolicTensor;
    const policyLayer = tf.layers.dense({ units: policyCodec.columnCount });
    const policyOutput = policyLayer.apply(hiddenOutput) as tf.SymbolicTensor;

    this.model = tf.model({
      inputs: inputLayer,
      outputs: [valueOutput, policyOutput],
    });

    // console.log(
    //   `model is ${JSON.stringify(
    //     this.model.toJSON(undefined, false),
    //     undefined,
    //     "  "
    //   )}`
    // );

    // this.model.add(tf.layers.dense({ units: stateCodec.columnCount +  }));
    this.optimizer = tf.train.momentum(0.00001, 0.9);

    this.model.compile({
      optimizer: this.optimizer,
      // MSE for value and crossentry for policy
      loss: [tf.losses.meanSquaredError, tf.losses.softmaxCrossEntropy],
    });
  }

  infer(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ): InferenceResult<KingdominoAction> {
    const tensor = tf.tensor([this.encodeState(snapshot)]);
    // console.log(`tensor is ${tensor.toString()}`);
    let prediction = this.model.predict(tensor);
    if (!Array.isArray(prediction)) {
      throw new Error("Expected tensor array but received single tensor");
    }
    if (prediction.length != 2) {
      throw new Error(`Expected 2 tensors but received ${prediction.length}`);
    }
    // const [values, policy] = this.parseOutputVector(
    //   snapshot.episodeConfiguration.players,
    //   (prediction as tf.Tensor).arraySync() as number[]
    // );
    const playerValues = this.decodeValues(
      snapshot.episodeConfiguration.players,
      this.unwrapNestedArrays(prediction[0].arraySync())
    );
    const policy = this.decodePolicy(
      snapshot,
      this.unwrapNestedArrays(prediction[1].arraySync())
    );
    // console.log(
    //   `infer: policy is ${JSON.stringify(policy.toArray(), undefined, 2)}`
    // );
    return {
      value: playerValues,
      policy: policy,
    };
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

  async train(
    dataPoints: StateTrainingData<
      KingdominoConfiguration,
      KingdominoState,
      KingdominoAction
    >[]
  ) {
    if (dataPoints.length != this.batchSize) {
      throw new Error(`Number of samples did not equal batch size`);
    }
    const statesMatrix = Seq(dataPoints)
      .map((sample) => this.encodeState(sample.snapshot))
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
      .map((sample) => this.encodePolicy(sample.actionToVisitCount))
      .toArray();
    // console.log(
    //   `Calling fit with expected values ${JSON.stringify(
    //     valuesMatrix
    //   )} and ${JSON.stringify(policyMatrix)}`
    // );
    const fitResult = await this.model.fit(
      tf.tensor(statesMatrix),
      // tf.tensor([valuesMatrix, policyMatrix]),
      [tf.tensor(valuesMatrix), tf.tensor(policyMatrix)],
      { batchSize: this.batchSize, epochs: 3, verbose: 1 }
    );
    // console.log(`History: ${JSON.stringify(fitResult.history)}`);
  }

  // Visible for testing
  encodeState(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>
  ): ReadonlyArray<number> {
    const currentPlayer = Kingdomino.INSTANCE.currentPlayer(snapshot);
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
            playerIndex >=
            snapshot.episodeConfiguration.players.players.count() - 1
          ) {
            return undefined;
          }
          const player = requireDefined(
            snapshot.episodeConfiguration.players.players.get(playerIndex)
          );
          const playerState = requireDefined(
            snapshot.state.playerState(player.id)
          );
          return {
            score: playerState.score,
            locationState: this.encodeBoard(
              snapshot.state.requirePlayerState(player).board
            ),
          };
        }
      ),
    };
    const numbers = stateCodec.encode(stateValue);
    return numbers;
  }

  encodeTileOffers(
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

  encodeBoard(board: PlayerBoard): ReadonlyArray<LocationProperties> {
    const result = new Array<LocationProperties>();
    for (const x of _.range(-playAreaRadius, playAreaRadius + 1)) {
      for (const y of _.range(-playAreaRadius, playAreaRadius + 1)) {
        result.push(board.getLocationState(new Vector2(x, y)));
      }
    }
    return result;
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
    visitCounts: Map<KingdominoAction, number>
  ): ReadonlyArray<number> {
    const claimProbabilities = Array<number>(
      claimProbabilitiesCodec.columnCount
    ).fill(0);
    let discardProbability = 0;
    const placeProbabilities = Array<number>(
      placeProbabilitiesCodec.columnCount
    ).fill(0);

    for (const [action, visitCount] of visitCounts.entries()) {
      switch (action.data.case) {
        case ActionCase.CLAIM: {
          claimProbabilities[action.data.claim.offerIndex] = visitCount;
          break;
        }
        case ActionCase.DISCARD: {
          discardProbability = visitCount;
          break;
        }
        case ActionCase.PLACE: {
          placeProbabilities[placementToCodecIndex(action.data.place)] =
            visitCount;
          break;
        }
      }
    }

    return policyCodec.encode({
      claimProbabilities: claimProbabilities,
      discardProbability: discardProbability,
      placeProbabilities: placeProbabilities,
    });
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
    return { playerIdToValue: playerIdToValue };
  }

  private decodePolicy(
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
          // console.log(`${JSON.stringify(action)} legality was ${result}`);
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
}
