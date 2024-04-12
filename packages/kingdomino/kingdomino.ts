import {
  Action,
  Game,
  GameState,
  Player,
  Players,
  PlayerResult,
  Serializable,
} from "game";
import * as Proto from "kingdomino-proto";
import { Seq } from "immutable";
import * as _ from "lodash";
import { LocationProperties, tiles } from "./tiles.js";

/** Maximum height or width of a player's kingdom */
const maxKingdomSize = 5;

/** Size of the square in which a player could possibly place tiles */
const playAreaSize = 1 + 2 * (maxKingdomSize - 1);

const centerX = Math.floor(playAreaSize / 2);
const centerY = centerX;

const defaultLocationState: Proto.LocationState = {
  tile: undefined,
  tileLocationIndex: undefined,
};

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

const defaultLocationProperties = new LocationProperties(
  Proto.Terrain.TERRAIN_EMPTY,
  0
);

const centerLocationProperties = new LocationProperties(
  Proto.Terrain.TERRAIN_CENTER,
  0
);

abstract class KingdominoAction implements Serializable {
  serialize(): Uint8Array {
    throw new Error("Method not implemented.");
  }
}

class KingdominoState implements GameState<KingdominoState> {
  constructor(
    readonly proto: Proto.State,
    /** Convenience cache of `Player` found in `proto` */ readonly playerIdToPlayer: Map<
      string,
      Player
    >
  ) {}

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
      const playerIndex = playerCountToConfiguration.get(
        this.proto.playerState.length
      ).firstRoundTurnOrder[claimCount];
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

  locationState(playerIndex: number, x: number, y: number): LocationProperties {
    return getLocationState(
      this.proto.playerState[playerIndex].locationState,
      x,
      y
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
        setLocationState(result, x, y, defaultLocationState);
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
    const shuffledTiles = _.shuffle(tiles).slice(0, config.tileCount);
    const offers = new Array<Proto.TileOffer>();
    for (const playerNumber in config.firstRoundTurnOrder) {
      const tile = shuffledTiles.pop();
      offers.push({ tile: { tileNumber: tile.number } });
    }
    return new KingdominoState(
      {
        previousOffers: undefined,
        nextOffers: { offer: offers },
        remainingTiles: shuffledTiles.map((tile) => tile.number),
        playerState: protoPlayers,
      },
      new Map(players.players.map((player) => [player.id, player]))
    );
  }
}

function getLocationState(
  board: Proto.LocationState[],
  x: number,
  y: number
): LocationProperties {
  if (x == centerX && y == centerY) {
    return centerLocationProperties;
  }
  const locationState = board[x * playAreaSize + y];
  const tile = locationState.tile;
  if (tile == undefined) {
    return defaultLocationProperties;
  }
  return tiles[tile.tileNumber].properties[locationState.tileLocationIndex];
}

function setLocationState(
  board: Proto.LocationState[],
  x: number,
  y: number,
  value: Proto.LocationState
) {
  board[x * playAreaSize + y] = value;
}
