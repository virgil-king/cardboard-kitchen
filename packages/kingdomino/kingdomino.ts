import {
  ChanceKey,
  EpisodeConfiguration,
  EpisodeSnapshot,
  Game,
  NO_CHANCE,
  Player,
  PlayerValues,
} from "game";
import { KingdominoState, NextAction, propsJson } from "./state.js";
import _ from "lodash";

import { ActionCase, KingdominoAction, actionCodec } from "./action.js";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
  configurationCodec,
  playerCountToConfiguration,
} from "./base.js";
import { decodeOrThrow, requireDefined } from "studio-util";
import { Seq } from "immutable";
import { Tile } from "./tile.js";

export type KingdominoSnapshot = EpisodeSnapshot<
  KingdominoConfiguration,
  KingdominoState
>;

export class Kingdomino
  implements Game<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  static INSTANCE = new Kingdomino();

  playerCounts = [2, 3, 4];

  maxPlayerCount = requireDefined(Seq(this.playerCounts).max());

  maxTurnsPerRound = requireDefined(
    Seq(playerCountToConfiguration.values())
      .map((config) => config.firstRoundTurnOrder.length)
      .max()
  );

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
    const playerId = snapshot.state.currentPlayerId;
    if (playerId == undefined) {
      return undefined;
    }
    return snapshot.episodeConfiguration.players.requirePlayer(playerId);
  }

  isLegalAction(
    snapshot: EpisodeSnapshot<KingdominoConfiguration, KingdominoState>,
    action: KingdominoAction
  ): boolean {
    const actionData = action.data;
    const currentPlayer = requireDefined(
      Kingdomino.INSTANCE.currentPlayer(snapshot)
    );
    const nextAction = snapshot.state.nextAction;
    switch (actionData.case) {
      case ActionCase.CLAIM: {
        if (nextAction != NextAction.CLAIM_OFFER) {
          return false;
        }
        if (
          requireDefined(
            snapshot.state.props.nextOffers?.offers.get(
              actionData.claim.offerIndex
            )
          ).isClaimed()
        ) {
          return false;
        }
        return true;
      }
      case ActionCase.PLACE: {
        if (nextAction != NextAction.RESOLVE_OFFER) {
          return false;
        }

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
        const tile = Tile.withNumber(
          requireDefined(unresolvedOfferInfo[1].tileNumber)
        );

        return snapshot.state
          .requirePlayerState(currentPlayer.id)
          .board.isPlacementAllowed(actionData.place, tile);
      }
      case ActionCase.DISCARD: {
        if (nextAction != NextAction.RESOLVE_OFFER) {
          return false;
        }
        return true;
      }
    }
  }

  legalActions(snapshot: KingdominoSnapshot): Iterable<KingdominoAction> {
    return snapshot.state.possibleActions();
  }

  apply(
    snapshot: KingdominoSnapshot,
    action: KingdominoAction
  ): [KingdominoState, ChanceKey] {
    const actionData = action.data;
    let result: [KingdominoState, ChanceKey];
    const currentPlayer = requireDefined(
      Kingdomino.INSTANCE.currentPlayer(snapshot)
    );
    switch (actionData.case) {
      case ActionCase.CLAIM: {
        result = this.handleClaim(snapshot, currentPlayer, actionData.claim);
        break;
      }
      case ActionCase.PLACE: {
        result = this.handlePlacement(
          snapshot,
          currentPlayer,
          actionData.place
        );
        break;
      }
      case ActionCase.DISCARD: {
        result = this.handleDiscard(snapshot, currentPlayer);
        break;
      }
    }
    return result;
  }

  handleClaim(
    snapshot: KingdominoSnapshot,
    player: Player,
    claim: ClaimTile
  ): [KingdominoState, ChanceKey] {
    if (snapshot.state.nextAction != NextAction.CLAIM_OFFER) {
      throw new Error(`Unexpected claim action`);
    }
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
    if (snapshot.state.nextAction != NextAction.RESOLVE_OFFER) {
      throw new Error(`Unexpected place action`);
    }
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
        state = this.handleEndOfGame(state);
      } else {
        const nextPlayerId = requireDefined(
          unresolvedOfferInfo[1].claim
        ).playerId;
        const nextPlayer = episodeConfig.players.requirePlayer(nextPlayerId);
        state = state.withCurrentPlayer(nextPlayer);
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

  handleEndOfGame(state: KingdominoState): KingdominoState {
    let result = state.withNextAction(undefined).withCurrentPlayer(undefined);
    for (const [playerId, state] of result.props.playerIdToState.entries()) {
      let bonusPoints = 0;
      const board = state.board;
      if (board.isCentered()) {
        bonusPoints += 10;
      }
      if (board.isFilled()) {
        bonusPoints += 5;
      }
      result = result.withBonusPoints(playerId, bonusPoints);
    }
    return result;
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
    if (snapshot.state.nextAction != NextAction.RESOLVE_OFFER) {
      throw new Error(`Unexpected discard action`);
    }
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

  decodeConfiguration(json: any): KingdominoConfiguration {
    const decoded = decodeOrThrow(configurationCodec, json);
    return KingdominoConfiguration.fromJson(decoded);
  }

  decodeState(json: any): KingdominoState {
    const decoded = decodeOrThrow(propsJson, json);
    return KingdominoState.decode(decoded);
  }

  decodeAction(json: any): KingdominoAction {
    const decoded = decodeOrThrow(actionCodec, json);
    return KingdominoAction.decode(decoded);
  }
}
