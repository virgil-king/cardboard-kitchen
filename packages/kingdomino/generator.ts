import { ActionCase, KingdominoAction } from "./action.js";
import { KingdominoState, NextAction } from "./state.js";
import { Episode, Player, Players, Transcript } from "game";
import { requireDefined } from "./util.js";
import _ from "lodash";
import { maxKingdomSize } from "./base.js";

export class KingdominoEpisode
  implements Episode<KingdominoState, KingdominoAction>
{
  transcript: Transcript<KingdominoState, KingdominoAction>;
  currentState: KingdominoState;
  generator: Generator<KingdominoState, KingdominoState, KingdominoAction>;
  constructor(players: Players, shuffledTileNumbers?: Array<number>) {
    this.generator = this.play(players, shuffledTileNumbers);
    const state = this.generator.next().value;
    this.transcript = new Transcript(state);
    this.currentState = state;
  }

  apply(action: KingdominoAction): KingdominoState {
    const result = this.generator.next(action).value;
    this.currentState = result;
    this.transcript.steps.push([action, result]);
    return result;
  }

  *play(
    players: Players,
    shuffledTileNumbers?: Array<number>
  ): Generator<KingdominoState, KingdominoState, KingdominoAction> {
    let state = KingdominoState.newGame(players, shuffledTileNumbers);

    // First round
    for (const playerIndex of state.configuration().firstRoundTurnOrder) {
      const player = state.props.players.players[playerIndex];
      state = state.withCurrentPlayer(player);
      const action = yield state;
      state = this.handleClaim(state, player, action);
    }

    // Non-final rounds
    while (!state.props.remainingTiles.isEmpty()) {
      state = state
        .withPreviousOffers(requireDefined(state.props.nextOffers))
        .withNewNextOffers();

      for (const [offerIndex, offer] of requireDefined(
        state.props.previousOffers?.offers
      ).entries()) {
        const player = state.requirePlayer(
          requireDefined(offer.claim?.playerId)
        );
        state = state
          .withCurrentPlayer(player)
          .withNextAction(NextAction.PLACE);
        let action = yield state;
        state = this.handlePlacement(state, player, action, offerIndex);
        state = state.withNextAction(NextAction.CLAIM);
        action = yield state;
        state = this.handleClaim(state, player, action);
      }
    }

    // Final round
    state = state
      .withPreviousOffers(requireDefined(state.props.nextOffers))
      .withNextAction(NextAction.PLACE);
    for (const [offerIndex, offer] of requireDefined(
      state.props.previousOffers?.offers
    ).entries()) {
      const player = state.requirePlayer(requireDefined(offer.claim?.playerId));
      state = state.withCurrentPlayer(player);
      const action = yield state;
      state = this.handlePlacement(state, player, action, offerIndex);
    }

    // TODO compute bonus scores
    state = state.withNextAction(undefined);

    return state;
  }

  /**
   * Returns {@link state} updated by handling {@link action} which should
   * be a placement or discard of {@link offerIndex}
   */
  private handlePlacement(
    state: KingdominoState,
    player: Player,
    action: KingdominoAction,
    offerIndex: number
  ): KingdominoState {
    if (!action.player.equals(player)) {
      throw new Error(`Invalid action ${JSON.stringify(action)}`);
    }
    const tileNumber = requireDefined(
      state.props.previousOffers?.offers.get(offerIndex)?.tileNumber
    );
    state = state.withPreviousOfferRemoved(offerIndex);
    let actionData = action.data;
    switch (actionData.case) {
      case ActionCase.PLACE:
        state = state.withPlacement(player, actionData.data, tileNumber);
        const width = state.requirePlayerState(player).board.occupiedRectangle().width;
        if (width > maxKingdomSize) {
          throw new Error(`Kingdom became too wide (${width})`);
        }
        break;
      case ActionCase.DISCARD:
        break;
      default:
        throw new Error(`Invalid action ${JSON.stringify(action)}`);
    }
    return state;
  }

  /**
   * Returns {@link state} updated by handling {@link action} which should be a claim
   */
  private handleClaim(
    state: KingdominoState,
    player: Player,
    action: KingdominoAction
  ): KingdominoState {
    const actionData = action.data;
    if (!action.player.equals(player) || actionData.case != ActionCase.CLAIM) {
      throw new Error(`Invalid action ${JSON.stringify(action)}`);
    }
    return state.withClaim(player, actionData.data);
  }
}
