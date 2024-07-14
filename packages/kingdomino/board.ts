import { Map, Range, Seq, Set, ValueObject } from "immutable";
import {
  LocationState,
  centerX,
  centerY,
  centerLocationProperties,
  defaultLocationProperties,
  PlaceTile,
  maxKingdomSize,
  adjacentExternalLocations,
  playAreaRadius,
  locationStateJson,
} from "./base.js";
import { LocationProperties, Terrain, Tile } from "./tile.js";
import { Vector2, Rectangle, Direction, vector2Json } from "./util.js";
import * as io from "io-ts";
import { decodeOrThrow } from "studio-util";

export const playerBoardJson = io.type({
  locationStates: io.array(io.tuple([vector2Json, locationStateJson])),
});

export type PlayerBoardJson = io.TypeOf<typeof playerBoardJson>;

/**
 * Coordinates in this class refer to lines between tiles. A tile at [x,y]
 * has its bottom left corner at [x,y].
 */
export class PlayerBoard implements ValueObject {
  readonly occupiedRectangle: Rectangle;

  constructor(readonly locationStates: Map<Vector2, LocationState>) {
    this.occupiedRectangle = this.computeOccupiedRectangle();
  }

  static fromJson(json: unknown): PlayerBoard {
    const decoded = decodeOrThrow(playerBoardJson, json);
    return new PlayerBoard(
      Map(
        decoded.locationStates.map(([locationJson, stateJson]) => [
          Vector2.fromJson(locationJson),
          LocationState.fromJson(stateJson),
        ])
      )
    );
  }

  getLocationState(location: Vector2): LocationProperties {
    if (location.x == centerX && location.y == centerY) {
      return centerLocationProperties;
    }
    const locationState = this.locationStates.get(location);
    if (locationState == undefined) {
      return defaultLocationProperties;
    }
    return locationState.properties();
  }

  static center: Vector2 = new Vector2(centerX, centerY);

  toAssociationList(): Array<[Vector2, LocationState]> {
    return [...this.locationStates.entries()];
  }

  /**
   * Returns `this` updated by placing {@link tileNumber} according to {@link placement}
   */
  withTile(placement: PlaceTile, tileNumber: number): PlayerBoard {
    let result: PlayerBoard = this;
    for (const tileLocationIndex of [0, 1]) {
      const squareLocation = placement.squareLocation(tileLocationIndex);
      const locationState = new LocationState(tileNumber, tileLocationIndex);
      result = result.withLocationState(squareLocation, locationState);
    }
    return result;
  }

  private withLocationState(
    location: Vector2,
    value: LocationState
  ): PlayerBoard {
    return new PlayerBoard(this.locationStates.set(location, value));
  }

  private computeOccupiedRectangle(): Rectangle {
    const isEmpty = (x: number, y: number) => {
      return (
        this.getLocationState(new Vector2(x, y)).terrain ==
        Terrain.TERRAIN_EMPTY
      );
    };
    const left = this.lastOccupiedLine(
      centerX - 1,
      -playAreaRadius - 1,
      -1,
      (a, b) => isEmpty(a, b)
    );
    // Top and right are on the end (+1) side of the row or column
    const top =
      1 +
      this.lastOccupiedLine(centerY + 1, playAreaRadius + 1, 1, (a, b) =>
        isEmpty(b, a)
      );
    const right =
      1 +
      this.lastOccupiedLine(centerX + 1, playAreaRadius + 1, 1, (a, b) =>
        isEmpty(a, b)
      );
    const bottom = this.lastOccupiedLine(
      centerY - 1,
      -playAreaRadius - 1,
      -1,
      (a, b) => isEmpty(b, a)
    );
    return new Rectangle(left, top, right, bottom);
  }

  /**
   * Returns the last occupied row or column between start (inclusive) and end (exclusive).
   */
  lastOccupiedLine(
    start: number,
    end: number,
    increment: number,
    isEmpty: (a: number, b: number) => boolean
  ) {
    // Find the first unoccupied row or column and then rewind by one step
    const result = Seq(Range(start, end, increment)).find((a) =>
      Seq(Range(-playAreaRadius, playAreaRadius + 1)).every((b) =>
        isEmpty(a, b)
      )
    );
    if (result != undefined) {
      return result - increment;
    }
    return end - increment;
  }

  isPlacementAllowed(placement: PlaceTile, tile: Tile): boolean {
    // console.log(JSON.stringify(this.toAssociationList()));
    // Each square of the tile must be:
    for (let i = 0; i < 2; i++) {
      const location = placement.squareLocation(i);
      // Not already occupied:
      if (this.getLocationState(location).terrain != Terrain.TERRAIN_EMPTY) {
        // console.log(`Not empty`);
        return false;
      }
      // Not make the kingdom too tall or wide:
      const updatedRectangle = extend(this.occupiedRectangle, location);
      if (
        updatedRectangle.width > maxKingdomSize ||
        updatedRectangle.height > maxKingdomSize
      ) {
        // console.log(`Would make kingdom too big`);
        return false;
      }
    }

    // At least one adjacent square must have matching terrain or be the center
    // square:
    for (let i = 0; i < 2; i++) {
      const tileSquareTerrain = tile.properties[i].terrain;
      for (let location of adjacentExternalLocations(placement, i)) {
        const adjacentTerrain = this.getLocationState(location).terrain;
        if (
          adjacentTerrain == tileSquareTerrain ||
          adjacentTerrain == Terrain.TERRAIN_CENTER
        ) {
          return true;
        }
      }
    }

    // No terrain matches found
    // console.log(`No terrain matches`);
    return false;
  }

  score(): number {
    // Treat the center as scored since it's irrelevant to scoring
    let scored = Set<Vector2>([Vector2.origin]);
    let queue = Set<Vector2>(
      [...Direction.values()].map((direction) => direction.offset)
    );
    let score = 0;
    while (true) {
      const location = queue.first();
      if (location == undefined) {
        break;
      }
      queue = queue.rest();
      // A queued location may have been visited via a different group after it was discovered
      if (scored.contains(location)) {
        continue;
      }
      const locationState = this.getLocationState(location);
      if (locationState.terrain == Terrain.TERRAIN_EMPTY) {
        continue;
      }
      const visitResult = this.visit(locationState.terrain, location, scored);
      score += visitResult.squareCount * visitResult.crownCount;
      scored = visitResult.scored;
      queue = queue.merge(visitResult.queue);
    }
    return score;
  }

  /**
   * If {@link location} is already scored, returns an empty result.
   *
   * If location's terrain type is not {@link terrain}, returns {@link location}
   * in {@link VisitResult.queue}.
   *
   * Otherwise returns scoring information for {@link location} and its connected
   * group of tiles with the same terrain.
   *
   */
  visit(
    terrain: Terrain,
    location: Vector2,
    scored: Set<Vector2>
  ): VisitResult {
    if (scored.contains(location)) {
      return {
        squareCount: 0,
        crownCount: 0,
        scored: scored,
        queue: Set<Vector2>(),
      };
    }
    const locationState = this.getLocationState(location);
    if (locationState.terrain != terrain) {
      let queue = Set<Vector2>();
      // No point adding empty locations
      if (locationState.terrain != Terrain.TERRAIN_EMPTY) {
        queue = queue.add(location);
      }
      return {
        squareCount: 0,
        crownCount: 0,
        scored: scored,
        queue: queue,
      };
    }
    scored = scored.add(location);
    let squareCount = 1;
    let crownCount = locationState.crowns;
    let queue = Set<Vector2>();
    for (const direction of Direction.values()) {
      const neighborLocation = location.plus(direction.offset);
      if (scored.contains(neighborLocation)) {
        continue;
      }
      let result = this.visit(terrain, neighborLocation, scored);
      squareCount += result.squareCount;
      crownCount += result.crownCount;
      scored = result.scored;
      queue = queue.merge(result.queue);
    }
    return {
      squareCount: squareCount,
      crownCount: crownCount,
      scored: scored,
      queue: queue,
    };
  }

  equals(other: unknown): boolean {
    if (!(other instanceof PlayerBoard)) {
      return false;
    }
    return this.locationStates.equals(other.locationStates);
  }
  hashCode(): number {
    return this.locationStates.hashCode();
  }

  toJson(): PlayerBoardJson {
    return {
      locationStates: this.locationStates
        .mapEntries(([location, state]) => [location.toJson(), state.toJson()])
        .toArray(),
    };
  }
}

type VisitResult = {
  squareCount: number;
  crownCount: number;
  /** The input scored set plus newly scored locations */
  scored: Set<Vector2>;
  /** Non-terrain-matching locations discovered during the visit */
  queue: Set<Vector2>;
};

/**
 * Returns {@link rect} modified to extends its lower left and upper right corners
 * to include {@link square}
 */
export function extend(rect: Rectangle, square: Vector2): Rectangle {
  return new Rectangle(
    Math.min(rect.left, square.x),
    Math.max(rect.top, square.y + 1),
    Math.max(rect.right, square.x + 1),
    Math.min(rect.bottom, square.y)
  );
}
