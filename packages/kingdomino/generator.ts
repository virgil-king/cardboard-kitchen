import { KingdominoAction } from "./action.js";
import { KingdominoState, NextAction } from "./state.js";
import { Episode, Players, Transcript } from "game";
import { requireDefined } from "./util.js";
import _ from "lodash";

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
      if (
        !action.player.equals(player) ||
        !action.claimTile ||
        action.placeTile
      ) {
        throw new Error(`Invalid action ${JSON.stringify(action)}`);
      }
      state = state.withClaim(action.claimTile);
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
        if (!action.player.equals(player) || !action.placeTile) {
          throw new Error(`Invalid action ${JSON.stringify(action)}`);
        }
        state = state
          .withPlacement(action.placeTile, offerIndex)
          .withNextAction(NextAction.CLAIM);
        action = yield state;
        if (!action.player.equals(player) || !action.claimTile) {
          throw new Error(`Invalid action ${JSON.stringify(action)}`);
        }
        state = state.withClaim(action.claimTile);
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
      if (
        !action.player.equals(player) ||
        !action.placeTile ||
        action.claimTile
      ) {
        throw new Error(`Invalid action ${JSON.stringify(action)}`);
      }
      state = state.withPlacement(action.placeTile, offerIndex);
    }

    // TODO compute scores
    state = state.withNextAction(undefined);

    return state;
  }
}
