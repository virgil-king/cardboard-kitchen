import { test } from "vitest";
import { assert } from "chai";
import {
  ActionStatistics,
  EpisodeTrainingData,
  StateSearchData,
} from "training-data";
import { EpisodeConfiguration, Player, PlayerValues, Players } from "game";
import { Map, Range, Set } from "immutable";
import * as _ from "lodash";
import { NumberAction, PickANumber, PickANumberConfiguration, PickANumberState } from "agent";

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
      new PlayerValues(
        Map([
          [alice.id, 0],
          [bob.id, 1],
        ])
      ),
      Map([
        [
          new NumberAction(3),
          new ActionStatistics(
            0.5,
            0.5,
            1,
            new PlayerValues(
              Map([
                [alice.id, 1],
                [bob.id, 2],
              ])
            )
          ),
        ],
        [
          new NumberAction(5),
          new ActionStatistics(
            0.5,
            0.5,
            1,
            new PlayerValues(
              Map([
                [alice.id, 1],
                [bob.id, 2],
              ])
            )
          ),
        ],
      ]),
      2
    )
  );
  let [state] = PickANumber.INSTANCE.apply(snapshot, new NumberAction(3));
  dataPoints.push(
    new StateSearchData(
      state,
      new PlayerValues(
        Map([
          [alice.id, 0],
          [bob.id, 1],
        ])
      ),
      Map([
        [
          new NumberAction(6),
          new ActionStatistics(
            0.5,
            0.5,
            1,
            new PlayerValues(
              Map([
                [alice.id, 1],
                [bob.id, 2],
              ])
            )
          ),
        ],
        [
          new NumberAction(2),
          new ActionStatistics(
            0.5,
            0.5,
            1,
            new PlayerValues(
              Map([
                [alice.id, 1],
                [bob.id, 2],
              ])
            )
          ),
        ],
      ]),
      3
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
    )
  );

  const jsonObject = trainingData.encode();
  const fromJsonObject = EpisodeTrainingData.decode(PickANumber.INSTANCE, jsonObject);
  const jsonString = JSON.stringify(jsonObject);
  const fromJsonString = EpisodeTrainingData.decode(PickANumber.INSTANCE, JSON.parse(jsonString));
  const secondJsonString = JSON.stringify(fromJsonString.encode());

  assert.isTrue(
    fromJsonObject.episodeConfig.players.equals(trainingData.episodeConfig.players)
  );
  assert.isTrue(
    fromJsonObject.gameConfig.availableNumbers.equals(
      trainingData.gameConfig.availableNumbers
    )
  );
  assert.isTrue(
    fromJsonObject.terminalValues.playerIdToValue.equals(
      trainingData.terminalValues.playerIdToValue
    )
  );
  assert.equal(jsonString, secondJsonString);
});
