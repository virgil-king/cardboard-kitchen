export enum Terrain {
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

  static withNumber(tileNumber: number): Tile {
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
  create(13, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_FOREST, 0),
  create(14, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_WATER, 0),
  create(15, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_PASTURE, 0),
  create(16, Terrain.TERRAIN_HAY, 0, Terrain.TERRAIN_SWAMP, 0),
  create(17, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_WATER, 0),
  create(18, Terrain.TERRAIN_FOREST, 0, Terrain.TERRAIN_PASTURE, 0),
  create(19, Terrain.TERRAIN_HAY, 1, Terrain.TERRAIN_FOREST, 0),
  create(20, Terrain.TERRAIN_HAY, 1, Terrain.TERRAIN_WATER, 0),
  create(21, Terrain.TERRAIN_HAY, 1, Terrain.TERRAIN_PASTURE, 0),
  create(22, Terrain.TERRAIN_HAY, 1, Terrain.TERRAIN_SWAMP, 0),
  create(23, Terrain.TERRAIN_HAY, 1, Terrain.TERRAIN_MINE, 0),
  create(24, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_HAY, 0),
  create(25, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_HAY, 0),
  create(26, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_HAY, 0),
  create(27, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_HAY, 0),
  create(28, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_WATER, 0),
  create(29, Terrain.TERRAIN_FOREST, 1, Terrain.TERRAIN_PASTURE, 0),
  create(30, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_HAY, 0),
  create(31, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_HAY, 0),
  create(32, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_FOREST, 0),
  create(33, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_FOREST, 0),
  create(34, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_FOREST, 0),
  create(35, Terrain.TERRAIN_WATER, 1, Terrain.TERRAIN_FOREST, 0),
  create(36, Terrain.TERRAIN_PASTURE, 1, Terrain.TERRAIN_HAY, 0),
];
