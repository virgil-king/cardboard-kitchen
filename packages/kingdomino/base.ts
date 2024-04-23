import { Player } from "game";
import * as Proto from "kingdomino-proto";
import { Direction, Vector2 } from "./util.js";
import { LocationProperties, tileWithNumber } from "./tiles.js";

/** Maximum height or width of a player's kingdom */
export const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
export const playAreaSize = 1 + 2 * (maxKingdomSize - 1);

export const centerX = Math.floor(playAreaSize / 2);
export const centerY = centerX;

export const defaultLocationState: Proto.LocationState = {
  tile: undefined,
  tileLocationIndex: undefined,
};

export const defaultLocationProperties: LocationProperties = {
  terrain: Proto.Terrain.TERRAIN_EMPTY,
  crowns: 0,
};

export const centerLocationProperties: LocationProperties = {
  terrain: Proto.Terrain.TERRAIN_CENTER,
  crowns: 0,
};

export function orientationToDirection(orientation: Proto.TileOrientation) {
  switch (orientation) {
    case Proto.TileOrientation.LEFT:
      return Direction.LEFT;
    case Proto.TileOrientation.UP:
      return Direction.UP;
    case Proto.TileOrientation.RIGHT:
      return Direction.RIGHT;
    case Proto.TileOrientation.DOWN:
      return Direction.DOWN;
  }
}

export function* orientations(): Generator<Proto.TileOrientation> {
  yield Proto.TileOrientation.LEFT;
  yield Proto.TileOrientation.UP;
  yield Proto.TileOrientation.RIGHT;
  yield Proto.TileOrientation.DOWN;
}

export function playerToState(
  player: Player,
  gameState: Proto.State
): Proto.PlayerState {
  return gameState.playerState.find(
    (p: Proto.PlayerState) => p.id == player.id
  );
}

export class Configuration {
  constructor(
    readonly tileCount: number,
    readonly firstRoundTurnOrder: number[]
  ) {}
}

export const playerCountToConfiguration = new Map([
  [2, new Configuration(24, [0, 1, 0, 1])],
  [3, new Configuration(36, [0, 1, 2])],
  [4, new Configuration(48, [0, 1, 2, 3])],
]);

/**
 * Returns an offer consisting of `turnCount` tiles from the end of
 * `tileNumbers` and removes those tiles from `tileNumbers`
 */
export function dealOffer(
  turnCount: number,
  tileNumbers: number[]
): Proto.TileOffers {
  const offers = new Array<Proto.TileOffer>();
  for (let i = 0; i < turnCount; i++) {
    const tileNumber = tileNumbers.pop();
    offers.push({ tile: { tileNumber: tileNumber } });
  }
  return { offer: offers };
}

export function getLocationState(
  board: Proto.LocationEntry[],
  location: Vector2
): LocationProperties {
  if (location.x == centerX && location.y == centerY) {
    return centerLocationProperties;
  }
  const locationState =
    board.find(
      (entry) =>
        entry.location.x == location.x && entry.location.y == location.y
    )?.locationState || defaultLocationState;
  const tile = locationState.tile;
  if (tile == undefined) {
    return defaultLocationProperties;
  }
  return tileWithNumber(tile.tileNumber).properties[
    locationState.tileLocationIndex
  ];
}

export function setLocationState(
  board: Proto.LocationEntry[],
  location: Vector2,
  value: Proto.LocationState
) {
  const existingIndex = board.findIndex(
    (entry) => entry.location.x == location.x && entry.location.y == location.y
  );
  if (existingIndex >= 0) {
    board[existingIndex].locationState = value;
  } else {
    board.push({
      location: { x: location.x, y: location.y },
      locationState: value,
    });
  }
}
