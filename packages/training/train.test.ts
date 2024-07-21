import { test } from "vitest";
import { assert } from "chai";
import { ActionStatistics, EpisodeTrainingData, StateSearchData } from "training-data";
import { EpisodeConfiguration, Player, PlayerValues, Players } from "game";
import {
  NumberAction,
  PickANumber,
  PickANumberConfiguration,
  PickANumberState,
} from "./mcts.test.js";
import { Map, Range, Set } from "immutable";
import * as _ from "lodash";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");

test("EpisodeTrainingData: codec round trip", () => {
  const episodeConfig = new EpisodeConfiguration(new Players(alice, bob));
  let snapshot = PickANumber.INSTANCE.newEpisode(episodeConfig);
  const dataPoints = new Array<
    StateSearchData<PickANumberState, NumberAction>
  >();
  dataPoints.push(
    new StateSearchData(
      snapshot.state,
      new PlayerValues(Map([[alice.id, 0], [bob.id, 1]])),
      Map([
        [new NumberAction(3), new ActionStatistics(0.5, 1, new PlayerValues(Map([[alice.id, 1], [bob.id, 2]])))],
        [new NumberAction(5), new ActionStatistics(0.5, 1, new PlayerValues(Map([[alice.id, 1], [bob.id, 2]])))],
      ])
    )
  );
  let [state] = PickANumber.INSTANCE.apply(snapshot, new NumberAction(3));
  dataPoints.push(
    new StateSearchData(
      state,
      new PlayerValues(Map([[alice.id, 0], [bob.id, 1]])),
      Map([
        [new NumberAction(6), new ActionStatistics(0.5, 1, new PlayerValues(Map([[alice.id, 1], [bob.id, 2]])))],
        [new NumberAction(2), new ActionStatistics(0.5, 1, new PlayerValues(Map([[alice.id, 1], [bob.id, 2]])))],
      ])
    )
  );
  const trainingData = new EpisodeTrainingData(
    new EpisodeConfiguration(new Players(alice, bob)),
    new PickANumberConfiguration(Set(Range(0, 10))),
    dataPoints,
    state,
    new PlayerValues(
      Map([
        [alice.id, 1],
        [bob.id, 0],
      ])
    ),
  );

  const copy = EpisodeTrainingData.decode(
    PickANumber.INSTANCE,
    trainingData.toJson()
  );

  assert.isTrue(copy.episodeConfig.players.equals(trainingData.episodeConfig.players));
  assert.isTrue(copy.gameConfig.availableNumbers.equals(trainingData.gameConfig.availableNumbers));
  assert.isTrue(copy.terminalValues.playerIdToValue.equals(trainingData.terminalValues.playerIdToValue));
});
