import { KingdominoSnapshot, Vector2 } from "kingdomino";
import { Set } from "immutable";

// This file should eventually contain a class that implements all of the game
// logic for the play page.

export function nextSquarePossibleLocations(
  snapshot: KingdominoSnapshot,
  firstSquareLocation: Vector2 | undefined
): Set<Vector2> {
  let result = Set<Vector2>();
  for (const placement of snapshot.state.possiblePlacements()) {
    if (firstSquareLocation == undefined) {
      result = result.add(placement.location);
    } else if (firstSquareLocation.equals(placement.location)) {
      result = result.add(placement.location.plus(placement.direction.offset));
    }
  }
  return result;
}
