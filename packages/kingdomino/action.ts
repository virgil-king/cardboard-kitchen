import { Action, Player } from "game";
import * as Proto from "kingdomino-proto";
import { Tile, tileWithNumber } from "./tiles.js";
import { Direction, Rectangle, Vector2, neighbors } from "./util.js";
import { KingdominoState } from "./state.js";

import { Range, Seq } from "immutable";
import _ from "lodash";
import { produce } from "immer";
import {
  centerX,
  centerY,
  dealOffer,
  getLocationState,
  maxKingdomSize,
  orientationToDirection,
  playAreaSize,
  playerToState,
  setLocationState,
} from "./base.js";

export class KingdominoAction implements Action<KingdominoState> {
  constructor(readonly proto: Proto.Action) {}
  apply(state: KingdominoState): KingdominoState {
    const currentPlayer = state.currentPlayer();
    const newProto = produce(state.proto, (draft) => {
      if (this.proto.placeTile) {
        this.applyPlace(this.proto.placeTile, draft, currentPlayer);
      }
      if (this.proto.claimTile) {
        this.applyClaim(this.proto.claimTile, currentPlayer, draft);
      }
      // Check both round-end conditions to handle first, middle, and last round
      // cases
      if (
        // All new offers claimed
        (draft.nextOffers != undefined &&
          !_.some(
            draft.nextOffers.offer,
            (offer) => offer.claim == undefined
          )) ||
        // All previous offers placed
        (draft.previousOffers != undefined &&
          !_.some(
            draft.previousOffers.offer,
            (offer) => offer.tile == undefined
          ))
      ) {
        draft.previousOffers = draft.nextOffers;
        if (draft.remainingTiles.length == 0) {
          // Starting last round
          draft.nextOffers = undefined;
        } else {
          draft.nextOffers = dealOffer(state.turnCount(), draft.remainingTiles);
        }
      }
    });
    return new KingdominoState(newProto, state.playerIdToPlayer);
  }

  applyPlace(
    placement: Proto.Action_PlaceTile,
    draft: Proto.State,
    currentPlayer: Player
  ) {
    if (draft.previousOffers == undefined) {
      throw new Error("Invalid action: can't place a tile in the first round");
    }

    const firstUnplacedOffer = draft.previousOffers.offer.find(
      (offer) => offer.tile != undefined
    );
    const tileNumber = firstUnplacedOffer.tile.tileNumber;
    const tile = tileWithNumber(tileNumber);
    const currentPlayerBoardDraft = playerToState(
      currentPlayer,
      draft
    ).locationEntry;
    const tileLocation = new Vector2(placement.x, placement.y);

    // Check placement legality
    if (
      !isPlacementAllowed(
        tileLocation,
        placement.orientation,
        tile,
        currentPlayerBoardDraft
      )
    ) {
      throw Error(`Invalid placement: ${JSON.stringify(placement)}`);
    }

    // Successful placement! Remove the tile from the next unplaced offer.
    firstUnplacedOffer.tile = undefined;

    // Update the two board locations
    this.setLocationState(
      currentPlayerBoardDraft,
      tileLocation,
      placement.orientation,
      tile.number,
      0
    );
    this.setLocationState(
      currentPlayerBoardDraft,
      tileLocation,
      placement.orientation,
      tile.number,
      1
    );
  }

  setLocationState(
    currentPlayerBoardDraft: Proto.LocationEntry[],
    tileLocation: Vector2,
    orientation: Proto.TileOrientation,
    tileNumber: number,
    tileLocationIndex: number
  ) {
    const location = squareLocation(
      tileLocation,
      orientation,
      tileLocationIndex
    );
    const state = {
      tile: { tileNumber: tileNumber },
      tileLocationIndex: tileLocationIndex,
    };
    console.log(
      `Setting square ${JSON.stringify(location)} state to ${JSON.stringify(
        state
      )}`
    );
    setLocationState(currentPlayerBoardDraft, location, state);
  }

  applyClaim(
    claim: Proto.Action_ClaimTile,
    currentPlayer: Player,
    draft: Proto.State
  ) {
    if (draft.nextOffers == undefined) {
      throw new Error("Invalid action: can't claim a tile in the last round");
    }
    draft.nextOffers.offer[claim.offerIndex].claim = {
      playerId: currentPlayer.id,
    };
  }

  serialize(): Uint8Array {
    throw new Error("Method not implemented.");
  }
}

export function isPlacementAllowed(
  tileLocation: Vector2,
  orientation: Proto.TileOrientation,
  tile: Tile,
  currentPlayerBoardDraft: Proto.LocationEntry[]
): boolean {
  const occupied = occupiedRectangle(currentPlayerBoardDraft);
  // Each square of the tile must be:
  for (let i = 0; i < 2; i++) {
    const location = squareLocation(tileLocation, orientation, i);
    // Not already occupied:
    if (
      getLocationState(currentPlayerBoardDraft, location).terrain !=
      Proto.Terrain.TERRAIN_EMPTY
    ) {
      // console.log(`Square already occupied: ${location}`);
      return false;
    }
    // Not make the kingdom too tall or wide:
    const updatedRectangle = occupied.extend(location);
    if (
      updatedRectangle.width > maxKingdomSize ||
      updatedRectangle.height > maxKingdomSize
    ) {
      console.log(`Square would make the kingdom too large: ${location}`);
      return false;
    }
  }

  // At least one adjacent square must have matching terrain or be the center
  // square:
  for (let i = 0; i < 2; i++) {
    const tileSquareTerrain = tileWithNumber(tile.number).properties[i].terrain;
    for (let location of adjacentExternalLocations(
      tileLocation,
      orientation,
      i
    )) {
      const adjacentTerrain = getLocationState(
        currentPlayerBoardDraft,
        location
      ).terrain;
      if (
        adjacentTerrain == tileSquareTerrain ||
        adjacentTerrain == Proto.Terrain.TERRAIN_CENTER
      ) {
        return true;
      }
    }
  }
}

function occupiedRectangle(board: Proto.LocationEntry[]): Rectangle {
  function isEmpty(x: number, y: number) {
    return (
      getLocationState(board, new Vector2(x, y)).terrain ==
      Proto.Terrain.TERRAIN_EMPTY
    );
  }
  // Scan out in all four directions from the center tile, choosing the last
  // row or column before the first row or column that's completely empty
  const left =
    Seq(Range(centerX - 1, 0, -1)).find((x) =>
      Seq(Range(0, playAreaSize)).every((y) => isEmpty(x, y))
    ) + 1;
  const top =
    Seq(Range(centerY + 1, playAreaSize)).find((y) =>
      Seq(Range(0, playAreaSize)).every((x) => isEmpty(x, y))
    ) - 1;
  const right =
    Seq(Range(centerX + 1, playAreaSize)).find((x) =>
      Seq(Range(0, playAreaSize)).every((y) => isEmpty(x, y))
    ) - 1;
  const bottom =
    Seq(Range(centerY - 1, 0, -1)).find((y) =>
      Seq(Range(0, playAreaSize)).every((x) => isEmpty(x, y))
    ) + 1;
  return new Rectangle(left, top, right, bottom);
}

function squareLocation(
  tileLocation: Vector2,
  tileOrientation: Proto.TileOrientation,
  squareIndex: number
): Vector2 {
  if (squareIndex == 0) {
    return tileLocation;
  }
  if (squareIndex != 1) {
    throw Error("Invalid tile square index");
  }
  return tileLocation.plus(orientationToDirection(tileOrientation).offset);
}

/**
 * Returns the locations adjacent to one square of a tile, not including the
 * other square of the tile.
 *
 * @param tileLocation location of the first square of the tile
 * @param tileOrientation orientation of the tile
 * @param squareIndex square index on the tile
 */
function* adjacentExternalLocations(
  tileLocation: Vector2,
  tileOrientation: Proto.TileOrientation,
  squareIndex: number
) {
  const location = squareLocation(tileLocation, tileOrientation, squareIndex);
  const otherSquareLocation = squareLocation(
    tileLocation,
    tileOrientation,
    otherSquareIndex(squareIndex)
  );
  for (const adjacentLocation of neighbors(location)) {
    if (
      !_.isEqual(adjacentLocation, otherSquareLocation) &&
      isInBounds(adjacentLocation)
    ) {
      yield adjacentLocation;
    }
  }
}

function otherSquareIndex(squareIndex: number) {
  switch (squareIndex) {
    case 0:
      return 1;
    case 1:
      return 0;
    default:
      throw Error(`Invalid square index ${squareIndex}`);
  }
}

function isInBounds(location: Vector2): boolean {
  return (
    location.x >= 0 &&
    location.x < playAreaSize &&
    location.y >= 0 &&
    location.y < playAreaSize
  );
}
