import { test } from "vitest";
import { assert } from "chai";
import { EpisodeTrainingData, StateSearchData } from "./train.js";
import { EpisodeConfiguration, Player, PlayerValues, Players } from "./game.js";
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
      Map([
        [new NumberAction(3), 1],
        [new NumberAction(5), 1],
      ])
    )
  );
  let [state] = PickANumber.INSTANCE.apply(snapshot, new NumberAction(3));
  dataPoints.push(
    new StateSearchData(
      state,
      Map([
        [new NumberAction(6), 1],
        [new NumberAction(2), 1],
      ])
    )
  );
  const trainingData = new EpisodeTrainingData(
    new EpisodeConfiguration(new Players(alice, bob)),
    new PickANumberConfiguration(Set(Range(0, 10))),
    new PlayerValues(
      Map([
        [alice.id, 1],
        [bob.id, 0],
      ])
    ),
    dataPoints
  );

  const copy = EpisodeTrainingData.decode(
    PickANumber.INSTANCE,
    trainingData.toJson()
  );

  assert.isTrue(copy.episodeConfig.players.equals(trainingData.episodeConfig.players));
  assert.isTrue(copy.gameConfig.availableNumbers.equals(trainingData.gameConfig.availableNumbers));
  assert.isTrue(copy.terminalValues.playerIdToValue.equals(trainingData.terminalValues.playerIdToValue));
});
