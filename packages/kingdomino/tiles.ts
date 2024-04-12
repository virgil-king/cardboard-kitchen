import * as Proto from "kingdomino-proto";

export class LocationProperties {
  constructor(readonly terrain: Proto.Terrain, readonly crowns: number) {}
}

export class Tile {
  constructor(
    readonly number: number,
    readonly properties: LocationProperties[]
  ) {}

  static create(
    number: number,
    terrain0: Proto.Terrain,
    crowns0: number,
    terrain1: Proto.Terrain,
    crowns1: number
  ) {
    return new Tile(number, [
      { terrain: terrain0, crowns: crowns0 },
      { terrain: terrain1, crowns: crowns1 },
    ]);
  }
}

/** The set of tiles in the base game (currently inaccurate) */
export const tiles = [
  Tile.create(
    1,
    Proto.Terrain.TERRAIN_FOREST,
    0,
    Proto.Terrain.TERRAIN_FOREST,
    1
  ),
  Tile.create(
    2,
    Proto.Terrain.TERRAIN_PASTURE,
    0,
    Proto.Terrain.TERRAIN_PASTURE,
    1
  ),
  Tile.create(3, Proto.Terrain.TERRAIN_MINE, 0, Proto.Terrain.TERRAIN_MINE, 1),
  Tile.create(
    4,
    Proto.Terrain.TERRAIN_SWAMP,
    0,
    Proto.Terrain.TERRAIN_SWAMP,
    1
  ),
  Tile.create(
    5,
    Proto.Terrain.TERRAIN_WATER,
    0,
    Proto.Terrain.TERRAIN_WATER,
    1
  ),
  Tile.create(6, Proto.Terrain.TERRAIN_HAY, 0, Proto.Terrain.TERRAIN_HAY, 1),
  Tile.create(7, Proto.Terrain.TERRAIN_HAY, 0, Proto.Terrain.TERRAIN_FOREST, 1),
  Tile.create(
    8,
    Proto.Terrain.TERRAIN_PASTURE,
    0,
    Proto.Terrain.TERRAIN_WATER,
    1
  ),
];
