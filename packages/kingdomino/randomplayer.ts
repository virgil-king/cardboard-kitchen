import { KingdominoAction, isPlacementAllowed } from "./action.js";
import {
  centerX,
  centerY,
  getLocationState,
  orientations,
  playerToState,
} from "./base.js";
import { KingdominoState } from "./state.js";
import { Direction, Vector2 } from "./util.js";
import * as Proto from "kingdomino-proto";

import seedrandom from "seedrandom";
import { Set } from "immutable";
import { tileWithNumber } from "./tile.js";

function* adjacentEmptyLocations(
  currentPlayerBoard: Proto.LocationEntry[]
): Generator<Vector2> {
  // Contains both occupied and empty locations
  const center = new Vector2(centerX, centerY);
  const visited = Set<Vector2>();
  visited.add(center);
  for (const [neighbor, _] of visit(currentPlayerBoard, center, visited)) {
    yield neighbor;
  }
}

/**
 * Emits pairs whose first element is an empty neighbor and whose second element is a new set of all visited locations
 */
function* visit(
  board: Proto.LocationEntry[],
  location: Vector2,
  visited: Set<Vector2>
): Generator<[Vector2, Set<Vector2>]> {
  let localVisited = visited;
  for (const direction of Direction.values()) {
    const neighbor = location.plus(direction.offset);
    if (localVisited.contains(neighbor)) {
      continue;
    }
    localVisited = localVisited.add(neighbor);
    const neighborState = getLocationState(board, neighbor);
    if (neighborState.terrain == Proto.Terrain.TERRAIN_EMPTY) {
      yield [neighbor, localVisited];
    } else {
      for (const [newNeighbor, newVisited] of visit(
        board,
        neighbor,
        localVisited
      )) {
        localVisited = newVisited;
        yield [newNeighbor, newVisited];
      }
    }
  }
}

export function* possiblePlacements(
  state: KingdominoState
): Generator<Proto.Action_PlaceTile> {
  const currentPlayer = state.currentPlayer();
  const currentPlayerState = playerToState(currentPlayer, state.proto);
  const currentPlayerBoard = currentPlayerState.locationEntry;
  const firstUnplacedOffer = state.proto.previousOffers.offer.find(
    (offer) => offer.tile != undefined
  );
  const tileNumber = firstUnplacedOffer.tile.tileNumber;
  const tile = tileWithNumber(tileNumber);
  for (const adjacentLocation of adjacentEmptyLocations(currentPlayerBoard)) {
    for (const orientation of orientations()) {
      if (
        isPlacementAllowed(
          adjacentLocation,
          orientation,
          tile,
          currentPlayerBoard
        )
      ) {
        yield {
          x: adjacentLocation.x,
          y: adjacentLocation.y,
          orientation: orientation,
        };
      }
    }
  }
}

interface Rng {
  /** Returns a number between 0 and 1 */
  random(): number;
}

class SeededRng implements Rng {
  readonly rng: seedrandom;
  constructor(seed: number) {
    this.rng = new seedrandom(seed);
  }
  random(): number {
    return this.rng.random();
  }
}

const platformRng: Rng = {
  random: function (): number {
    return Math.random();
  },
};

export function streamingRandom<T>(
  stream: Generator<T>,
  rng: Rng = platformRng
): T {
  let count = 0;
  let result: T | undefined;
  for (let item of stream) {
    count++;
    const random = rng.random();
    if (random < 1 / count) {
      result = item;
    }
  }
  return result;
}
