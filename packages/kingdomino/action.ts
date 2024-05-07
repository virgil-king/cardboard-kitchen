import { Action, Player } from "game";

import { ClaimTile, PlaceTile } from "./base.js";

export enum ActionCase {
  CLAIM,
  PLACE,
  DISCARD,
}

export type Claim = {
  case: ActionCase.CLAIM;
  data: ClaimTile;
};

export type Place = {
  case: ActionCase.PLACE;
  data: PlaceTile;
};

export type Discard = {
  case: ActionCase.DISCARD;
};

export type ActionData = Claim | Place | Discard;

export class KingdominoAction implements Action {
  private constructor(readonly player: Player, readonly data: ActionData) {}

  static claimTile(player: Player, claimTile: ClaimTile) {
    return new KingdominoAction(player, {
      case: ActionCase.CLAIM,
      data: claimTile,
    });
  }

  static placeTile(player: Player, placeTile: PlaceTile) {
    return new KingdominoAction(player, {
      case: ActionCase.PLACE,
      data: placeTile,
    });
  }

  static discardTile(player: Player) {
    return new KingdominoAction(player, { case: ActionCase.DISCARD });
  }

  get case(): ActionCase {
    return this.data.case;
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}
