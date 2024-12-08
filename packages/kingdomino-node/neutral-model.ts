import {
  Kingdomino,
  KingdominoAction,
  KingdominoConfiguration,
  KingdominoState,
} from "kingdomino";
import { EpisodeSnapshot, PlayerValues } from "game";
import { Map } from "immutable";
import { InferenceModel, InferenceResult } from "mcts";

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
        const players = snapshot.episodeConfiguration.players;
        const playerValue = players.players.count() * 0.5;
        const playerValues = new PlayerValues(
          Map(players.players.map((player) => [player.id, playerValue]))
        );
        const possibleActions = [...snapshot.state.possibleActions()];
        const actionValue = 1 / possibleActions.length;
        const policy = Map(
          possibleActions.map((action) => [action, actionValue])
        );
        return {
          value: playerValues,
          policyLogits: policy,
        };
      })
    );
  }
}
