import { ActionCase, KingdominoAction } from "./action.js";
import { KingdominoState, NextAction } from "./state.js";
import {
  ChanceKey,
  Episode,
  EpisodeConfiguration,
  Player,
  Transcript,
} from "game";
import _ from "lodash";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
} from "./base.js";
import { requireDefined } from "studio-util";
import { Map } from "immutable";

export class KingdominoEpisode
  implements Episode<KingdominoState, KingdominoAction>
{
  private static NO_CHANCE = [];
  transcript: Transcript<KingdominoState, KingdominoAction>;
  currentState: KingdominoState;
  /** The index of the next unused tile in `shuffledTileNumbers` */
  offsetInShuffledTileNumbers = 0;
  playerIdToPlayer: Map<string, Player>;
  constructor(
    readonly configuration: EpisodeConfiguration,
    readonly kingdominoConfig: KingdominoConfiguration
  ) {
    // this.generator = this.play(players, shuffledTileNumbers);
    this.currentState = KingdominoState.newGame(
      configuration
    ).withNewNextOffers(kingdominoConfig, this.nextOffers());
    this.playerIdToPlayer = Map(
      configuration.players.players.map((player) => [player.id, player])
    );
    this.transcript = new Transcript(this.currentState);
    // this.currentState = state;
  }

  apply(action: KingdominoAction): [KingdominoState, ChanceKey] {
    // console.log(`Handling ${JSON.stringify(action)}`);

    if (!action.player.equals(this.currentState.currentPlayer)) {
      throw new Error(
        `Action specified player ${action.player.name} but should have been ${this.currentState.currentPlayer?.name}`
      );
    }

    const actionData = action.data;
    switch (actionData.case) {
      case ActionCase.CLAIM: {
        this.handleClaim(action.player, actionData.data);
        break;
      }
      case ActionCase.PLACE: {
        this.handlePlacement(action.player, actionData.data);
        break
      }
      case ActionCase.DISCARD: {
        this.handleDiscard(action.player);
        break;
      }
    }
    // console.log(
    //   `Next player is ${JSON.stringify(this.currentState.currentPlayer)}`
    // );

    return [this.currentState, KingdominoEpisode.NO_CHANCE];
  }

  handleClaim(player: Player, claim: ClaimTile) {
    this.currentState = this.currentState.withClaim(player, claim);
    if (this.currentState.isFirstRound()) {
      const nextOffers = requireDefined(this.currentState.props.nextOffers);
      const claimedOfferCount = nextOffers.offers.count((offer) =>
        offer.isClaimed()
      );
      if (claimedOfferCount == nextOffers.offers.count()) {
        // End of round
        this.handleEndOfRound();
      } else {
        const nextPlayerIndex =
          this.kingdominoConfig.firstRoundTurnOrder[claimedOfferCount];
        this.currentState = this.currentState.withCurrentPlayer(
          requireDefined(
            this.configuration.players.players.get(nextPlayerIndex)
          )
        );
      }
    } else {
      const nextPlayer = this.playerWithNextUnresolvedOffer(
        requireDefined(this.currentState.props.previousOffers)
      );
      if (nextPlayer == undefined) {
        // End of round
        this.handleEndOfRound();
      } else {
        this.currentState = this.currentState
          .withCurrentPlayer(nextPlayer)
          .withNextAction(NextAction.RESOLVE_OFFER);
      }
    }
  }

  handleEndOfRound() {
    const nextOffers = requireDefined(this.currentState.props.nextOffers);
    this.currentState = this.currentState
      .withPreviousOffers(nextOffers)
      .withNewNextOffers(this.kingdominoConfig, this.nextOffers())
      .withCurrentPlayer(requireDefined(this.playerWithNextUnresolvedOffer(nextOffers)))
      .withNextAction(NextAction.RESOLVE_OFFER);
  }

  handlePlacement(player: Player, placement: PlaceTile) {
    const previousOffers = this.currentState.props.previousOffers;
    if (previousOffers == undefined) {
      throw new Error("Tried to place a tile in the first round");
    }
    const unresolvedOfferInfo = this.nextUnresolvedOffer(previousOffers);
    if (unresolvedOfferInfo == undefined) {
      throw new Error(
        "Tried to place a tile when there were no unplaced tiles"
      );
    }
    this.currentState = this.currentState
      .withPreviousOfferRemoved(unresolvedOfferInfo[0])
      .withPlacement(
        player,
        placement,
        requireDefined(unresolvedOfferInfo[1].tileNumber)
      );
    // console.log(`isLastRound=${this.currentState.isLastRound()}`);
    if (this.currentState.isLastRound()) {
      const unresolvedOfferInfo = this.nextUnresolvedOffer(
        requireDefined(this.currentState.props.previousOffers)
      );
      if (unresolvedOfferInfo == undefined) {
        // End of game
        this.currentState = this.currentState.withNextAction(undefined);
      } else {
        const nextPlayerId = requireDefined(
          unresolvedOfferInfo[1].claim
        ).playerId;
        const nextPlayer = this.requirePlayer(nextPlayerId);
        this.currentState = this.currentState.withCurrentPlayer(nextPlayer);
        // console.log(`Next player is ${JSON.stringify(nextPlayer)}`);
      }
    } else {
      this.currentState = this.currentState.withNextAction(
        NextAction.CLAIM_OFFER
      );
    }
  }

  /**
   * Returns scripted next offer tile numbers or undefined if there is no tiles
   * script or the script is exhausted
   */
  nextOffers(): Array<number> | undefined {
    const shuffledTileNumbers = this.kingdominoConfig.shuffledTileNumbers;
    if (shuffledTileNumbers != undefined) {
      const remainingTiles =
        shuffledTileNumbers.length - this.offsetInShuffledTileNumbers;
      if (remainingTiles >= this.kingdominoConfig.turnsPerRound) {
        const result = shuffledTileNumbers.slice(
          this.offsetInShuffledTileNumbers,
          this.offsetInShuffledTileNumbers + this.kingdominoConfig.turnsPerRound
        );
        this.offsetInShuffledTileNumbers += this.kingdominoConfig.turnsPerRound;
        return result;
      } else if (remainingTiles != 0) {
        throw new Error(
          "shuffled tile count was not a multiple of turns per round"
        );
      } else {
        // Out of tiles
        return [];
      }
    } else {
      return undefined;
    }
  }

  /**
   * Returns the next offer index and offer that hasn't been resolved yet, or undefined if
   * there is no such offer.
   *
   * {@link offers} must not include any unclaimed offers (i.e. it must be
   * previous offers)
   */
  nextUnresolvedOffer(offers: TileOffers): [number, TileOffer] | undefined {
    const indexMatch = offers.offers.findIndex((offer) => offer.hasTile());
    if (indexMatch == -1) {
      return undefined;
    }
    return [indexMatch, requireDefined(offers.offers.get(indexMatch))];
  }

  /**
   * Returns the player with the next claimed tile that hasn't been resolved yet,
   * or undefined if there is no such tile.
   *
   * {@link offers} must not include any unclaimed offers (i.e. it must be
   * previous offers)
   */
  playerWithNextUnresolvedOffer(offers: TileOffers): Player | undefined {
    const unresolvedOfferInfo = this.nextUnresolvedOffer(offers);
    if (unresolvedOfferInfo == undefined) {
      return undefined;
    }
    return this.requirePlayer(
      requireDefined(unresolvedOfferInfo[1].claim).playerId
    );
  }

  requirePlayer(playerId: string): Player {
    return requireDefined(this.playerIdToPlayer.get(playerId));
  }

  handleDiscard(player: Player) {
    const previousOffers = this.currentState.props.previousOffers;
    if (previousOffers == undefined) {
      throw new Error("Can't discard in the first round");
    }
    const offerToResolve = this.nextUnresolvedOffer(previousOffers);
    if (offerToResolve == undefined) {
      throw new Error("No unresolved offer to discard");
    }
    this.currentState = this.currentState.withPreviousOfferRemoved(
      offerToResolve[0]
    );
  }
}
