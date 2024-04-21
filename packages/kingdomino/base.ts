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
  return gameState.playerState.find((p: Proto.PlayerState) => p.id == player.id);
}

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
  board: Proto.LocationState[],
  location: Vector2
): LocationProperties {
  if (location.x == centerX && location.y == centerY) {
    return centerLocationProperties;
  }
  const locationState = board[location.x * playAreaSize + location.y];
  const tile = locationState.tile;
  if (tile == undefined) {
    return defaultLocationProperties;
  }
  return tileWithNumber(tile.tileNumber).properties[
    locationState.tileLocationIndex
  ];
}

export function setLocationState(
  board: Proto.LocationState[],
  location: Vector2,
  value: Proto.LocationState
) {
  board[location.x * playAreaSize + location.y] = value;
}
