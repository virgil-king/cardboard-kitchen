import { InferenceModel, InferenceResult } from "training";
import { KingdominoConfiguration } from "./base.js";
import { KingdominoAction } from "./action.js";
import { KingdominoState } from "./state.js";
import { EpisodeSnapshot, PlayerValues } from "game";
import { Kingdomino } from "./kingdomino.js";
import { Map } from "immutable";

class NeutralKingdominoModel
  implements
    InferenceModel<KingdominoConfiguration, KingdominoState, KingdominoAction>
{
  infer(
    snapshots: readonly EpisodeSnapshot<
      KingdominoConfiguration,
      KingdominoState
    >[]
  ): readonly InferenceResult<KingdominoAction>[] {
    return snapshots.map((snapshot) => {
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
        policy: policy,
      };
    });
  }
}
