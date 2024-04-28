// import * as Proto from "kingdomino-proto";

import { Vector2, Direction } from "./util.js";

export enum Terrain {
  // TERRAIN_UNKNOWN,
  TERRAIN_EMPTY,
  TERRAIN_CENTER,
  TERRAIN_FOREST,
  TERRAIN_WATER,
  TERRAIN_PASTURE,
  TERRAIN_SWAMP,
  TERRAIN_MINE,
  TERRAIN_HAY,
}

export class LocationProperties {
  constructor(readonly terrain: Terrain, readonly crowns: number) {}
}

export class Tile {
  constructor(
    readonly number: number,
    readonly properties: LocationProperties[]
  ) {}

  static withNumber(tileNumber: number) {
    return tiles[tileNumber - 1];
  }
}

function create(
  tileNumber: number,
  terrain0: Terrain,
  crowns0: number,
  terrain1: Terrain,
  crowns1: number
): Tile {
  return new Tile(tileNumber, [
    new LocationProperties(terrain0, crowns0),
    new LocationProperties(terrain1, crowns1),
  ]);
}

/**
 * The set of tiles in the base game.
 *
 * Each tile is at index (tile number - 1).
 */
export const tiles = [
  create(1, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_HAY, 0),
  create(2, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_HAY, 0),
  create(3, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_FOREST, 0),
  create(4, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_FOREST, 0),
  create(5, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_FOREST, 0),
  create(6, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_FOREST, 0),
  create(7, Terrain.TERRAIN_WATER, 0, Terrain.TERRAIN_WATER, 0),
  create(8, Terrain.TERRAIN_WATER, 0, Terrain.TERRAIN_WATER, 0),
  create(9, Terrain.TERRAIN_WATER, 0, Terrain.TERRAIN_WATER, 0),
  create(10, Terrain.TERRAIN_PASTURE, 0, Terrain.TERRAIN_PASTURE, 0),
  create(11, Terrain.TERRAIN_PASTURE, 0, Terrain.TERRAIN_PASTURE, 0),
  create(12, Terrain.TERRAIN_SWAMP, 0, Terrain.TERRAIN_SWAMP, 0),
];
