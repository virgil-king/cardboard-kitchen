import { Action, GameState, Player, PlayerResult } from "game";
// import * as Proto from "kingdomino-proto";
import { LocationProperties, Tile } from "./tile.js";
import {
  Configuration,
  LocationState,
  TileOffers,
  getLocationState,
  playerCountToConfiguration,
  playerToState,
} from "./base.js";
import { Vector2 } from "./util.js";

import { Seq } from "immutable";
import _ from "lodash";
import { Map, Set } from "immutable";

export class PlayerState {
  constructor(
    readonly player: Player,
    readonly locationEntries: Map<Vector2, LocationState>
  ) {}
}

// interface Foo {
//   readonly x: string;
// }

// let bar = { x: 5 };
// bar.x = 7;

export class KingdominoState implements GameState<KingdominoState> {
  constructor(
    readonly players: Player[],
    readonly playerIdToState: Map<string, PlayerState>,
    readonly previousOffers: TileOffers | undefined,
    readonly nextOffers: TileOffers | undefined
  ) {}

  private playerCount(): number {
    return this.playerIdToState.size;
  }

  configuration(): Configuration {
    return playerCountToConfiguration.get(this.playerCount());
  }

  turnCount(): number {
    return this.configuration().firstRoundTurnOrder.length;
  }

  result(): PlayerResult[] | undefined {
    throw new Error("Method not implemented.");
  }

  currentPlayer(): Player {
    if (this.previousOffers == undefined) {
      // First round: the number of existing claims is the number of players who
      // have gone already, so return the next player after that in player order
      const claimCount = Seq(this.nextOffers.offers).count(
        (offer) => offer.claim != undefined
      );
      if (claimCount == this.nextOffers.offers.length) {
        throw Error("Invalid state: all new offer tiles are claimed");
      }
      const playerIndex = playerCountToConfiguration.get(this.playerCount())
        .firstRoundTurnOrder[claimCount];
      return this.playerIdToState.get(this.players[playerIndex].id).player;
    }
    // Non-first round: return the player with the first offer that still has a
    // tile. This logic assumes that a single action atomically removes the
    // claimed tile, places it, and claims a new offered tile. If that weren't
    // the case those states would need to be checked separately.
    const newClaimIndices = Set<number>();
    for (const offer of this.previousOffers.offers) {
      if (offer.tileNumber != undefined) {
        return this.playerIdToState.get(offer.claim.playerId).player;
      }
    }
    throw new Error("No cases matched");
  }

  possibleActions(): Action<KingdominoState>[] {
    throw new Error("Method not implemented.");
  }

  toJson(): string {
    throw new Error("Method not implemented.");
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return getLocationState(
      playerToState(player, this).locationEntry,
      location
    );
  }

  // score(player: Player): number {
  //   const visited = Set<Vector2>();

  // }
}
