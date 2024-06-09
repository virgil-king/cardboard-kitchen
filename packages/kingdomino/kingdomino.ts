import {
  ChanceKey,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  NO_CHANCE,
  Player,
  PlayerValues,
  Players,
} from "game";
import { KingdominoState, NextAction } from "./state.js";
import _ from "lodash";

import { ActionCase, KingdominoAction } from "./action.js";
import { Tensor, Rank } from "@tensorflow/tfjs-node-gpu";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
} from "./base.js";
import { requireDefined } from "studio-util";

type KingdominoSnapshot = EpisodeSnapshot<
  KingdominoConfiguration,
  KingdominoState
>;

export class Kingdomino
  implements Game<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  playerCounts = [2, 3, 4];

  load(bytes: Uint8Array): KingdominoState {
    throw new Error("Method not implemented.");
  }

  /**
   * @param shuffledTileNumbers shuffled tiles to use instead of a random shuffle of all tiles
   */
  newEpisode(config: EpisodeConfiguration): KingdominoSnapshot {
    return this.newKingdominoEpisode(config);
  }

  /**
   * @param shuffledTileNumbers shuffled tiles to use instead of a random shuffle of all tiles
   */
  newKingdominoEpisode(
    episodeConfig: EpisodeConfiguration,
    shuffledTileNumbers: Array<number> | undefined = undefined
  ): KingdominoSnapshot {
    const kingdominoConfig = new KingdominoConfiguration(
      episodeConfig.players.players.count(),
      shuffledTileNumbers
    );
    let state = KingdominoState.newGame(episodeConfig, kingdominoConfig);
    return new EpisodeSnapshot(episodeConfig, kingdominoConfig, state);
  }

  result(snapshot: KingdominoSnapshot): PlayerValues | undefined {
    return snapshot.state.result;
  }

  currentPlayer(snapshot: KingdominoSnapshot): Player | undefined {
    return snapshot.state.currentPlayer;
  }

  // tensorToAction(tensor: Tensor<Rank>): KingdominoAction {
  //   throw new Error("Method not implemented.");
  // }

  apply(
    snapshot: KingdominoSnapshot,
    action: KingdominoAction
  ): [KingdominoState, ChanceKey] {
    // console.log(`Handling ${JSON.stringify(action)}`);

    if (!action.player.equals(snapshot.state.currentPlayer)) {
      throw new Error(
        `Action specified player ${action.player.name} but should have been ${snapshot.state.currentPlayer?.name}`
      );
    }

    const actionData = action.data;
    let result: [KingdominoState, ChanceKey];
    switch (actionData.case) {
      case ActionCase.CLAIM: {
        result = this.handleClaim(snapshot, action.player, actionData.data);
        break;
      }
      case ActionCase.PLACE: {
        result = this.handlePlacement(snapshot, action.player, actionData.data);
        break;
      }
      case ActionCase.DISCARD: {
        result = this.handleDiscard(snapshot, action.player);
        break;
      }
    }
    // console.log(
    //   `Next player is ${JSON.stringify(this.currentState.currentPlayer)}`
    // );

    return result;
  }

  handleClaim(
    snapshot: KingdominoSnapshot,
    player: Player,
    claim: ClaimTile
  ): [KingdominoState, ChanceKey] {
    let newState = snapshot.state.withClaim(player, claim);
    let chanceKey = NO_CHANCE;
    if (newState.isFirstRound()) {
      const nextOffers = requireDefined(newState.props.nextOffers);
      const claimedOfferCount = nextOffers.offers.count((offer) =>
        offer.isClaimed()
      );
      if (claimedOfferCount == nextOffers.offers.count()) {
        // End of round
        [newState, chanceKey] = this.prepareNewRound(
          snapshot.episodeConfiguration,
          snapshot.gameConfiguration,
          newState
        );
      } else {
        const nextPlayerIndex =
          snapshot.gameConfiguration.firstRoundTurnOrder[claimedOfferCount];
        newState = newState.withCurrentPlayer(
          requireDefined(
            snapshot.episodeConfiguration.players.players.get(nextPlayerIndex)
          )
        );
      }
    } else {
      const nextPlayer = this.playerWithNextUnresolvedOffer(
        snapshot.episodeConfiguration,
        requireDefined(newState.props.previousOffers)
      );
      if (nextPlayer == undefined) {
        // End of round
        [newState, chanceKey] = this.prepareNewRound(
          snapshot.episodeConfiguration,
          snapshot.gameConfiguration,
          newState
        );
      } else {
        newState = newState
          .withCurrentPlayer(nextPlayer)
          .withNextAction(NextAction.RESOLVE_OFFER);
      }
    }
    return [newState, chanceKey];
  }

  prepareNewRound(
    episodeConfig: EpisodeConfiguration,
    kingdominoConfig: KingdominoConfiguration,
    state: KingdominoState
  ): [KingdominoState, ChanceKey] {
    const nextOffers = requireDefined(state.props.nextOffers);
    let [newState, chanceKey] = state
      .withPreviousOffers(nextOffers)
      .withNewNextOffers(kingdominoConfig);
    newState = newState
      .withCurrentPlayer(
        requireDefined(
          this.playerWithNextUnresolvedOffer(episodeConfig, nextOffers)
        )
      )
      .withNextAction(NextAction.RESOLVE_OFFER);
    return [newState, chanceKey];
  }

  handlePlacement(
    snapshot: KingdominoSnapshot,
    player: Player,
    placement: PlaceTile
  ): [KingdominoState, ChanceKey] {
    const previousOffers = snapshot.state.props.previousOffers;
    if (previousOffers == undefined) {
      throw new Error("Tried to place a tile in the first round");
    }
    const unresolvedOfferInfo = this.nextUnresolvedOffer(previousOffers);
    if (unresolvedOfferInfo == undefined) {
      throw new Error(
        "Tried to place a tile when there were no unplaced tiles"
      );
    }
    let newState = snapshot.state
      .withPreviousOfferRemoved(unresolvedOfferInfo[0])
      .withPlacement(
        player,
        placement,
        requireDefined(unresolvedOfferInfo[1].tileNumber)
      );
    // console.log(`isLastRound=${snapshot.state.isLastRound()}`);
    newState = this.handleOfferResolved(
      snapshot.episodeConfiguration,
      newState
    );
    return [newState, NO_CHANCE];
  }

  /**
   * Returns new state updated in response to a preceding offer resolution
   */
  handleOfferResolved(
    episodeConfig: EpisodeConfiguration,
    state: KingdominoState
  ): KingdominoState {
    if (state.isLastRound()) {
      const unresolvedOfferInfo = this.nextUnresolvedOffer(
        requireDefined(state.props.previousOffers)
      );
      if (unresolvedOfferInfo == undefined) {
        // End of game
        state = state.withNextAction(undefined);
      } else {
        const nextPlayerId = requireDefined(
          unresolvedOfferInfo[1].claim
        ).playerId;
        const nextPlayer = episodeConfig.players.requirePlayer(nextPlayerId);
        state = state.withCurrentPlayer(nextPlayer);
        // console.log(`Next player is ${JSON.stringify(nextPlayer)}`);
      }
    } else {
      state = state.withNextAction(NextAction.CLAIM_OFFER);
    }
    return state;
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
  playerWithNextUnresolvedOffer(
    episodeConfig: EpisodeConfiguration,
    offers: TileOffers
  ): Player | undefined {
    const unresolvedOfferInfo = this.nextUnresolvedOffer(offers);
    if (unresolvedOfferInfo == undefined) {
      return undefined;
    }
    return episodeConfig.players.requirePlayer(
      requireDefined(unresolvedOfferInfo[1].claim).playerId
    );
  }

  handleDiscard(
    snapshot: KingdominoSnapshot,
    player: Player
  ): [KingdominoState, ChanceKey] {
    const previousOffers = snapshot.state.props.previousOffers;
    if (previousOffers == undefined) {
      throw new Error("Can't discard in the first round");
    }
    const offerToResolve = this.nextUnresolvedOffer(previousOffers);
    if (offerToResolve == undefined) {
      throw new Error("No unresolved offer to discard");
    }
    let newState = snapshot.state.withPreviousOfferRemoved(offerToResolve[0]);
    newState = this.handleOfferResolved(
      snapshot.episodeConfiguration,
      newState
    );
    return [newState, NO_CHANCE];
  }
}
