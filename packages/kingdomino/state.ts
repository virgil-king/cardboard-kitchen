
import { Action, Game, GameState, Player, Players, PlayerResult } from "game";
import * as Proto from "kingdomino-proto";
import { LocationProperties, tiles } from "./tiles.js";
import { dealOffer, defaultLocationState, getLocationState, playAreaSize, playerToState, setLocationState } from "./base.js";
import { Vector2 } from "./util.js";

import { Seq } from "immutable";
import _ from "lodash";


class Configuration {
    constructor(
      readonly tileCount: number,
      readonly firstRoundTurnOrder: number[]
    ) {}
  }
  
  const playerCountToConfiguration = new Map([
    [2, new Configuration(24, [0, 1, 0, 1])],
    [3, new Configuration(36, [0, 1, 2])],
    [4, new Configuration(48, [0, 1, 2, 3])],
  ]);
  
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
    const newClaimIndices = new Set<number>();
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
}

export class Kingdomino implements Game<KingdominoState> {
  playerCounts(): number[] {
    return [2, 3, 4];
  }

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  private createStartingBoard(): Array<Proto.LocationState> {
    const result = new Array<Proto.LocationState>(playAreaSize * playAreaSize);
    for (let x = 0; x < playAreaSize; x++) {
      for (let y = 0; y < playAreaSize; y++) {
        setLocationState(result, new Vector2(x, y), defaultLocationState);
      }
    }
    return result;
  }

  newGame(players: Players): KingdominoState {
    const protoPlayers: Proto.PlayerState[] = players.players.map((player) => {
      return {
        id: player.id,
        name: player.name,
        locationState: this.createStartingBoard(),
      };
    });
    const playerCount = players.players.length;
    const config = playerCountToConfiguration.get(playerCount);
    const allTileNumbers = _.range(1, tiles.length + 1);
    const shuffledTiles = _.shuffle(allTileNumbers).slice(0, config.tileCount);
    const firstOffer = dealOffer(
      config.firstRoundTurnOrder.length,
      shuffledTiles
    );
    return new KingdominoState(
      {
        previousOffers: undefined,
        nextOffers: firstOffer,
        remainingTiles: shuffledTiles,
        playerState: protoPlayers,
      },
      new Map(players.players.map((player) => [player.id, player]))
    );
  }
}
