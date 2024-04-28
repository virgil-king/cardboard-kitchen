import { Action } from "game";
import { Direction, Vector2 } from "./util.js";
import { KingdominoState } from "./state.js";

import _ from "lodash";

class ClaimTile {
  constructor(readonly offerIndex: number) {}
}

class PlaceTile {
  constructor(readonly location: Vector2, readonly direction: Direction) {}
}

interface Props {
  readonly claimTile?: ClaimTile;
  readonly placeTile?: PlaceTile;
}

export class KingdominoAction implements Action<KingdominoState> {
  constructor(readonly props: Props) {}
  apply(state: KingdominoState): KingdominoState {
    let result = state;
    if (this.props.claimTile) {
      result = result.claimTile(this.props.claimTile.offerIndex);
    }
    if (this.props.placeTile) {
      const place = this.props.placeTile;
      result = result.placeTile(place.location, place.direction);
    }
    return result;
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}
