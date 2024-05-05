import { Action, Player } from "game";

import { ClaimTile, PlaceTile } from "./base.js";

export class KingdominoAction implements Action {
  private constructor(
    readonly player: Player,
    readonly claimTile?: ClaimTile,
    readonly placeTile?: PlaceTile
  ) {}

  static claimTile(player: Player, claimTile: ClaimTile) {
    return new KingdominoAction(player, claimTile);
  }

  static placeTile(player: Player, placeTile: PlaceTile) {
    return new KingdominoAction(player, undefined, placeTile);
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}
