import { PlaceTile, PlayerBoard, centerX, centerY } from "./base.js";
import { KingdominoState } from "./state.js";
import { Direction, Vector2 } from "./util.js";

import { Seq, Set } from "immutable";
import { Terrain, Tile } from "./tile.js";

export function* adjacentEmptyLocations(
  currentPlayerBoard: PlayerBoard
): Generator<Vector2> {
  const center = new Vector2(centerX, centerY);
  // Contains both occupied and empty locations.
  // We use an immutable Set here, even though a mutable set would be more convenient in this case,
  // because JS mutable sets don't support deep equality behavior (ValueObject in this case)
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
  board: PlayerBoard,
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
    const neighborState = board.getLocationState(neighbor);
    if (neighborState.terrain == Terrain.TERRAIN_EMPTY) {
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

/**
 * Returns all of the legal placements available from {@link state}
 */
export function* possiblePlacements(
  state: KingdominoState
): Generator<PlaceTile> {
  const currentPlayerBoard = state.requireCurrentPlayerState().board;
  const previousOffers = state.props.previousOffers;
  if (previousOffers == undefined) {
    // First round; can't place anything
    return;
  }
  const firstUnplacedOfferTileNumber = Seq(previousOffers.offers)
    .map((offer) => offer.tileNumber)
    .find((tileNumber) => tileNumber != undefined);
  if (firstUnplacedOfferTileNumber == undefined) {
    // All tiles already placed
    return;
  }
  const tile = Tile.withNumber(firstUnplacedOfferTileNumber);
  for (const adjacentLocation of adjacentEmptyLocations(currentPlayerBoard)) {
    for (const direction of Direction.values()) {
      const square0Placement = new PlaceTile(adjacentLocation, direction);
      if (
        currentPlayerBoard.isPlacementAllowed(square0Placement, tile)
      ) {
        yield square0Placement;
      }
      const square1Placement = square0Placement.flip();
      if (
        currentPlayerBoard.isPlacementAllowed(square1Placement, tile)
      ) {
        yield square1Placement;
      }
    }
  }
}

interface Rng {
  /** Returns a number between 0 and 1 */
  random(): number;
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
  let result: T | undefined = undefined;
  for (let item of stream) {
    count++;
    const random = rng.random();
    if (random < 1 / count) {
      result = item;
    }
  }
  if (result == undefined) {
    throw new Error("Empty stream");
  }
  return result;
}
