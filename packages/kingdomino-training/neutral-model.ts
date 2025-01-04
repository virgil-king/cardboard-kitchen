import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
} from "kingdomino";
import {
  Action,
  EpisodeSnapshot,
  Game,
  GameConfiguration,
  GameState,
  PlayerValues,
} from "game";
import { Map } from "immutable";
import { InferenceModel, InferenceResult } from "agent";

export class NeutralKingdominoModel
  implements
    InferenceModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  infer(
    snapshots: readonly EpisodeSnapshot<
      KingdominoConfiguration,
      KingdominoState
    >[]
  ): Promise<InferenceResult<KingdominoAction>[]> {
    return Promise.resolve(
      snapshots.map((snapshot) => {
        if (Kingdomino.INSTANCE.result(snapshot) != undefined) {
          throw new Error(`infer() called on completed game`);
        }
        return neutralInference(Kingdomino.INSTANCE, snapshot);
      })
    );
  }
}

/**
 * Returns an inference result for {@link snapshot} predicting that all players
 * tie and all actions have equal probability
 */
export function neutralInference<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
>(game: Game<C, S, A>, snapshot: EpisodeSnapshot<C, S>): InferenceResult<A> {
  const players = snapshot.episodeConfiguration.players;
  const playerValue = 0.5;
  const playerValues = new PlayerValues(
    Map(players.players.map((player) => [player.id, playerValue]))
  );
  const possibleActions = [...game.legalActions(snapshot)];
  const actionValue = 1 / possibleActions.length;
  const policy = Map(possibleActions.map((action) => [action, actionValue]));
  return {
    value: playerValues,
    policyLogits: policy,
  } satisfies InferenceResult<A>;
}
