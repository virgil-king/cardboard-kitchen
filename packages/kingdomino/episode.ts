import { ActionCase, Claim, KingdominoAction } from "./action.js";
import { KingdominoState, NextAction } from "./state.js";
import {
  ChanceKey,
  Episode,
  EpisodeConfiguration,
  Player,
  Players,
  Transcript,
} from "game";
import _, { first } from "lodash";
import {
  ClaimTile,
  KingdominoConfiguration,
  PlaceTile,
  TileOffer,
  TileOffers,
  maxKingdomSize,
} from "./base.js";
import { requireDefined } from "studio-util";
import { Map } from "immutable";

export class KingdominoEpisode
  implements Episode<KingdominoState, KingdominoAction>
{
  private static NO_CHANCE = [];
  transcript: Transcript<KingdominoState, KingdominoAction>;
  // currentState: KingdominoState;
  // generator: Generator<KingdominoState, KingdominoState, KingdominoAction>;
  currentState: KingdominoState;
  offsetInShuffledTileNumbers = 0;
  playerIdToPlayer: Map<string, Player>;
  constructor(
    readonly configuration: EpisodeConfiguration,
    readonly kingdominoConfig: KingdominoConfiguration
  ) {
    // this.generator = this.play(players, shuffledTileNumbers);
    this.currentState = KingdominoState.newGame(
      configuration
    ).withNewNextOffers(kingdominoConfig.turnsPerRound, this.nextOffers());
    this.playerIdToPlayer = Map(
      configuration.players.players.map((player) => [player.id, player])
    );
    this.transcript = new Transcript(this.currentState);
    // this.currentState = state;
  }

  apply(action: KingdominoAction): [KingdominoState, ChanceKey] {
    // const result = this.generator.next(action).value;
    // this.currentState = result;
    // this.transcript.steps.push([action, result]);

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
      }
    }

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
      const nextPlayer = this.playerWithNextClaim(
        requireDefined(this.currentState.props.previousOffers)
      );
      if (nextPlayer == undefined) {
        // End of round
      } else {
        this.currentState = this.currentState
          .withCurrentPlayer(nextPlayer)
          .withNextAction(NextAction.PLACE);
      }
    }
  }

  handleEndOfRound() {
    const nextOffers = requireDefined(this.currentState.props.nextOffers);
    this.currentState = this.currentState
      .withPreviousOffers(nextOffers)
      .withNewNextOffers(this.kingdominoConfig.turnsPerRound, this.nextOffers())
      .withCurrentPlayer(requireDefined(this.playerWithNextClaim(nextOffers)))
      .withNextAction(NextAction.PLACE);
  }

  handlePlacement(player: Player, placement: PlaceTile) {
    const previousOffers = this.currentState.props.previousOffers;
    if (previousOffers == undefined) {
      throw new Error("Tried to place a tile in the first round");
    }
    const offer = this.nextUnplacedOffer(previousOffers);
    if (offer == undefined) {
      throw new Error(
        "Tried to place a tile when there were no unplaced tiles"
      );
    }
    this.currentState = this.currentState.withPlacement(
      player,
      placement,
      requireDefined(offer.tileNumber)
    );
    if (this.currentState.isLastRound()) {
      const nextUnplacedOffer = this.nextUnplacedOffer(
        requireDefined(this.currentState.props.previousOffers)
      );
      if (nextUnplacedOffer == undefined) {
        // End of game
        this.currentState = this.currentState.withNextAction(undefined);
      } else {
        const nextPlayerId = requireDefined(nextUnplacedOffer.claim).playerId;
        const nextPlayer = this.requirePlayer(nextPlayerId);
        this.currentState = this.currentState.withCurrentPlayer(nextPlayer);
      }
    } else {
      this.currentState = this.currentState.withNextAction(NextAction.CLAIM);
    }
  }

  /**
   * Returns scripted next offer tile numbers if specified or else undefined
   */
  nextOffers(): Array<number> | undefined {
    const shuffledTileNumbers = this.kingdominoConfig.shuffledTileNumbers;
    if (shuffledTileNumbers != undefined) {
      const result = shuffledTileNumbers.slice(
        this.offsetInShuffledTileNumbers,
        this.offsetInShuffledTileNumbers + this.kingdominoConfig.turnsPerRound
      );
      this.offsetInShuffledTileNumbers += this.kingdominoConfig.turnsPerRound;
      return result;
    } else {
      return undefined;
    }
  }

  /**
   * Returns the next claimed tile that hasn't been placed yet, or undefined if
   * there is no such tile.
   *
   * {@link offers} must not include any unclaimed offers (i.e. it must be
   * previous offers)
   */
  nextUnplacedOffer(offers: TileOffers): TileOffer | undefined {
    return offers.offers.find((offer) => offer.hasTile());
  }

  /**
   * Returns the player with the next claimed tile that hasn't been placed yet,
   * or undefined if there is no such tile.
   *
   * {@link offers} must not include any unclaimed offers (i.e. it must be
   * previous offers)
   */
  playerWithNextClaim(offers: TileOffers): Player | undefined {
    const firstOfferWithTile = this.nextUnplacedOffer(offers);
    if (firstOfferWithTile == undefined) {
      return undefined;
    }
    return this.requirePlayer(
      requireDefined(firstOfferWithTile.claim).playerId
    );
  }

  canDealNewOffer(): boolean {
    // const gameConfig = this.episodeConfig.gameConfiguration;
    const shuffledTileNumbers = this.kingdominoConfig.shuffledTileNumbers;
    if (shuffledTileNumbers != undefined) {
      return shuffledTileNumbers.length >= this.kingdominoConfig.turnsPerRound;
    } else {
      return this.currentState.canDealNewOffer(
        this.kingdominoConfig.tileCount,
        this.kingdominoConfig.turnsPerRound
      );
    }
  }

  requirePlayer(playerId: string): Player {
    return requireDefined(this.playerIdToPlayer.get(playerId));
  }

  /**
   * @param shuffledTileNumbers The list of tile numbers to use for the whole game
   */
  // *play(
  //   players: Players,
  //   shuffledTileNumbers?: Array<number>
  // ): Generator<KingdominoState, KingdominoState, KingdominoAction> {
  //   let state = KingdominoState.newGame(players);

  // const nextOffers = function (): Array<number> | undefined {
  //   if (shuffledTileNumbers != undefined) {
  //     const result = shuffledTileNumbers.slice(
  //       -state.configuration().turnsPerRound
  //     );
  //     shuffledTileNumbers = shuffledTileNumbers.slice(
  //       0,
  //       -state.configuration().turnsPerRound
  //     );
  //     return result;
  //   } else {
  //     return undefined;
  //   }
  // };

  // const canDealNewOffer = function (): boolean {
  //   if (shuffledTileNumbers != undefined) {
  //     return (
  //       shuffledTileNumbers.length >= state.configuration().turnsPerRound
  //     );
  //   } else {
  //     return state.canDealNewOffer();
  //   }
  // };

  // state = state.withNewNextOffers(nextOffers());

  // // First round
  // for (const playerIndex of state.configuration().firstRoundTurnOrder) {
  //   const player = requireDefined(players.players.get(playerIndex));
  //   state = state.withCurrentPlayer(player);
  //   const action = yield state;
  //   state = this.handleClaim(state, player, action);
  // }

  // // Non-final rounds
  // while (canDealNewOffer()) {
  //   state = state
  //     .withPreviousOffers(requireDefined(state.props.nextOffers))
  //     .withNewNextOffers(nextOffers());

  //   for (const [offerIndex, offer] of requireDefined(
  //     state.props.previousOffers?.offers
  //   ).entries()) {
  //     const player = state.requirePlayer(
  //       requireDefined(offer.claim?.playerId)
  //     );
  //     state = state
  //       .withCurrentPlayer(player)
  //       .withNextAction(NextAction.PLACE);
  //     let action = yield state;
  //     state = this.handlePlacement(state, player, action, offerIndex);
  //     state = state.withNextAction(NextAction.CLAIM);
  //     action = yield state;
  //     state = this.handleClaim(state, player, action);
  //   }
  // }

  // // Final round
  // state = state
  //   .withPreviousOffers(requireDefined(state.props.nextOffers))
  //   .withNextAction(NextAction.PLACE);
  // for (const [offerIndex, offer] of requireDefined(
  //   state.props.previousOffers?.offers
  // ).entries()) {
  //   const player = state.requirePlayer(requireDefined(offer.claim?.playerId));
  //   state = state.withCurrentPlayer(player);
  //   const action = yield state;
  //   state = this.handlePlacement(state, player, action, offerIndex);
  // }

  // // TODO compute bonus scores
  // state = state.withNextAction(undefined);

  // return state;
  // }

  /**
   * Returns {@link state} updated by handling {@link action} which should
   * be a placement or discard of {@link offerIndex}
   */
  // private handlePlacement(
  //   state: KingdominoState,
  //   player: Player,
  //   action: KingdominoAction,
  //   offerIndex: number
  // ): KingdominoState {
  //   if (!action.player.equals(player)) {
  //     throw new Error(`Invalid action ${JSON.stringify(action)}`);
  //   }
  //   const tileNumber = requireDefined(
  //     state.props.previousOffers?.offers.get(offerIndex)?.tileNumber
  //   );
  //   state = state.withPreviousOfferRemoved(offerIndex);
  //   let actionData = action.data;
  //   switch (actionData.case) {
  //     case ActionCase.PLACE:
  //       state = state.withPlacement(player, actionData.data, tileNumber);
  //       const width = state
  //         .requirePlayerState(player)
  //         .board.occupiedRectangle().width;
  //       if (width > maxKingdomSize) {
  //         throw new Error(`Kingdom became too wide (${width})`);
  //       }
  //       break;
  //     case ActionCase.DISCARD:
  //       break;
  //     default:
  //       throw new Error(`Invalid action ${JSON.stringify(action)}`);
  //   }
  //   return state;
  // }

  /**
   * Returns {@link state} updated by handling {@link action} which should be a claim
   */
  // private handleClaim(
  //   state: KingdominoState,
  //   player: Player,
  //   action: KingdominoAction
  // ): KingdominoState {
  //   const actionData = action.data;
  //   if (!action.player.equals(player) || actionData.case != ActionCase.CLAIM) {
  //     throw new Error(`Invalid action ${JSON.stringify(action)}`);
  //   }
  //   return state.withClaim(player, actionData.data);
  // }
}
