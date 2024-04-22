import { Action, GameState, Player, PlayerResult } from "game";
import * as Proto from "kingdomino-proto";
import { LocationProperties } from "./tiles.js";
import {
  Configuration,
  getLocationState,
  playerCountToConfiguration,
  playerToState,
} from "./base.js";
import { Vector2 } from "./util.js";

import { Seq } from "immutable";
import _ from "lodash";
import { Set } from "immutable";

export class KingdominoState implements GameState<KingdominoState> {
  constructor(
    readonly proto: Proto.State,
    /** Convenience cache of `Player` found in `proto` */ readonly playerIdToPlayer: Map<
      string,
      Player
    >
  ) {}

  private playerCount(): number {
    return this.playerIdToPlayer.size;
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
    if (this.proto.previousOffers == undefined) {
      // First round: the number of existing claims is the number of players who
      // have gone already, so return the next player after that in player order
      const claimCount = Seq(this.proto.nextOffers.offer).count(
        (offer) => offer.claim != undefined
      );
      if (claimCount == this.proto.nextOffers.offer.length) {
        throw Error("Invalid state: all new offer tiles are claimed");
      }
      const playerIndex = playerCountToConfiguration.get(this.playerCount())
        .firstRoundTurnOrder[claimCount];
      return this.playerIdToPlayer.get(this.proto.playerState[playerIndex].id);
    }
    // Non-first round: return the player with the first offer that still has a
    // tile. This logic assumes that a single action atomically removes the
    // claimed tile, places it, and claims a new offered tile. If that weren't
    // the case those states would need to be checked separately.
    const newClaimIndices = Set<number>();
    for (const offer of this.proto.previousOffers.offer) {
      if (offer.tile != undefined) {
        return this.playerIdToPlayer.get(offer.claim.playerId);
      }
    }
    throw new Error("No cases matched");
  }

  possibleActions(): Action<KingdominoState>[] {
    throw new Error("Method not implemented.");
  }

  serialize(): Uint8Array {
    throw new Error("Method not implemented.");
  }

  locationState(player: Player, location: Vector2): LocationProperties {
    return getLocationState(
      playerToState(player, this.proto).locationState,
      location
    );
  }

  // score(player: Player): number {
  //   const visited = Set<Vector2>();

  // }
}
