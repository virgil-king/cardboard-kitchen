import { Action, combineHashes, decodeOrThrow } from "game";
import { ClaimTile, PlaceTile, claimCodec, placeCodec } from "./base.js";
import { hash } from "immutable";
import * as io from "io-ts";
import { Direction } from "./util.js";

export enum ActionCase {
  CLAIM = "CLAIM",
  PLACE = "PLACE",
  DISCARD = "DISCARD",
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

export const actionCodec = io.union([
  io.type({ case: io.literal(ActionCase.CLAIM), claim: claimCodec }),
  io.type({ case: io.literal(ActionCase.PLACE), place: placeCodec }),
  io.type({ case: io.literal(ActionCase.DISCARD) }),
]);

type ActionMessage = io.TypeOf<typeof actionCodec>;

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

  static decode(message: unknown): KingdominoAction {
    const decoded = decodeOrThrow(actionCodec, message);
    switch (decoded.case) {
      case ActionCase.CLAIM:
        return KingdominoAction.claimTile(ClaimTile.decode(decoded.claim));
      case ActionCase.PLACE:
        return KingdominoAction.placeTile(PlaceTile.fromJson(decoded.place));
      case ActionCase.DISCARD:
        return KingdominoAction.discardTile();
    }
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

  encode(): ActionMessage {
    switch (this.data.case) {
      case ActionCase.CLAIM:
        return {
          case: ActionCase.CLAIM,
          claim: { offerIndex: this.data.claim.offerIndex },
        };
      case ActionCase.PLACE:
        return {
          case: ActionCase.PLACE,
          place: {
            location: this.data.place.location.encode(),
            direction: Direction.valuesArray.indexOf(this.data.place.direction),
          },
        };
      case ActionCase.DISCARD:
        return { case: ActionCase.DISCARD };
    }
  }
}
