import * as Proto from "kingdomino-proto";

export interface LocationProperties {
  readonly terrain: Proto.Terrain;
  readonly crowns: number;
}

export interface Tile {
  // constructor(
  readonly number: number;
  readonly properties: LocationProperties[];
  // ) {}
}

function create(
  tileNumber: number,
  terrain0: Proto.Terrain,
  crowns0: number,
  terrain1: Proto.Terrain,
  crowns1: number
): Tile {
  return {
    number: tileNumber,
    properties: [
      { terrain: terrain0, crowns: crowns0 },
      { terrain: terrain1, crowns: crowns1 },
    ],
  };
}

export function tileWithNumber(tileNumber: number) {
  return tiles[tileNumber - 1];
}

/**
 * The set of tiles in the base game.
 *
 * Each tile is at index (tile number - 1).
 */
export const tiles = [
  create(1, Proto.Terrain.TERRAIN_HAY, 0, Proto.Terrain.TERRAIN_HAY, 0),
  create(2, Proto.Terrain.TERRAIN_HAY, 0, Proto.Terrain.TERRAIN_HAY, 0),
  create(3, Proto.Terrain.TERRAIN_FOREST, 0, Proto.Terrain.TERRAIN_FOREST, 0),
  create(4, Proto.Terrain.TERRAIN_FOREST, 0, Proto.Terrain.TERRAIN_FOREST, 0),
  create(5, Proto.Terrain.TERRAIN_FOREST, 0, Proto.Terrain.TERRAIN_FOREST, 0),
  create(6, Proto.Terrain.TERRAIN_FOREST, 0, Proto.Terrain.TERRAIN_FOREST, 0),
  create(7, Proto.Terrain.TERRAIN_WATER, 0, Proto.Terrain.TERRAIN_WATER, 0),
  create(8, Proto.Terrain.TERRAIN_WATER, 0, Proto.Terrain.TERRAIN_WATER, 0),
  create(9, Proto.Terrain.TERRAIN_WATER, 0, Proto.Terrain.TERRAIN_WATER, 0),
  create(10, Proto.Terrain.TERRAIN_PASTURE, 0, Proto.Terrain.TERRAIN_PASTURE, 0),
  create(11, Proto.Terrain.TERRAIN_PASTURE, 0, Proto.Terrain.TERRAIN_PASTURE, 0),
  create(12, Proto.Terrain.TERRAIN_SWAMP, 0, Proto.Terrain.TERRAIN_SWAMP, 0),
];
