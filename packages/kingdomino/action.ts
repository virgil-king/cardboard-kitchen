import { Action, Player } from "game";

import { ClaimTile, PlaceTile } from "./base.js";
import { Tensor, Rank } from "@tensorflow/tfjs-node-gpu";
import { hash } from "immutable";
import { combineHashes } from "studio-util";

export enum ActionCase {
  CLAIM,
  PLACE,
  DISCARD,
}

export const actionCases = [
  ActionCase.CLAIM,
  ActionCase.PLACE,
  ActionCase.DISCARD,
];

export type Claim = {
  case: ActionCase.CLAIM;
  claim: ClaimTile;
};

export type Place = {
  case: ActionCase.PLACE;
  place: PlaceTile;
};

export type Discard = {
  case: ActionCase.DISCARD;
};

export type ActionData = Claim | Place | Discard;

export class KingdominoAction implements Action {
  private constructor(readonly data: ActionData) {}
  static claimTile(claimTile: ClaimTile) {
    return new KingdominoAction({
      case: ActionCase.CLAIM,
      claim: claimTile,
    });
  }

  static placeTile(placeTile: PlaceTile) {
    return new KingdominoAction({
      case: ActionCase.PLACE,
      place: placeTile,
    });
  }

  static discardTile() {
    return new KingdominoAction({ case: ActionCase.DISCARD });
  }

  get case(): ActionCase {
    return this.data.case;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof KingdominoAction)) {
      return false;
    }
    if (
      this.data.case == ActionCase.CLAIM &&
      other.data.case == ActionCase.CLAIM &&
      this.data.claim.offerIndex == other.data.claim.offerIndex
    ) {
      return true;
    }
    if (
      this.data.case == ActionCase.PLACE &&
      other.data.case == ActionCase.PLACE &&
      this.data.place.equals(other.data.place)
    ) {
      return true;
    }
    if (
      this.data.case == ActionCase.DISCARD &&
      other.data.case == ActionCase.DISCARD
    ) {
      return true;
    }
    return false;
  }

  hashCode(): number {
    const tagHash = hash(this.case);
    let caseHash: number;
    switch (this.data.case) {
      case ActionCase.CLAIM: {
        caseHash = hash(this.data.claim.offerIndex);
        break;
      }
      case ActionCase.PLACE: {
        caseHash = this.data.place.hashCode();
        break;
      }
      case ActionCase.DISCARD: {
        caseHash = 0;
        break;
      }
    }
    return combineHashes(tagHash, caseHash);
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}
