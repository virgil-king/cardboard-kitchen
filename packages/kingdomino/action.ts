import { Action, Player } from "game";
import { KingdominoState } from "./state.js";

import { ClaimTile, PlaceTile } from "./base.js";

interface Props {
  readonly player: Player;
  readonly claimTile?: ClaimTile;
  readonly placeTile?: PlaceTile;
}

export class KingdominoAction implements Action<KingdominoState> {
  constructor(readonly props: Props) {}
  get player(): Player {
    return this.props.player;
  }
  apply(state: KingdominoState): KingdominoState {
    let result = state;
    if (this.props.placeTile) {
      result = result.placeTile(this.props.placeTile);
    }
    if (this.props.claimTile) {
      result = result.claimTile(this.props.claimTile.offerIndex);
    }
    return result;
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }
}
