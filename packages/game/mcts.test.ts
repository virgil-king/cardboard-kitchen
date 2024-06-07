import {
  Player,
  Players,
  scoresToPlayerValues,
  Game,
  Action,
  GameState,
  PlayerValues,
  EpisodeConfiguration,
  Model,
  JsonSerializable,
  ToTensor,
  GameConfiguration,
  EpisodeSnapshot,
} from "./game.js";

import { test } from "vitest";
import { assert } from "chai";
import { Map, Range, Seq, Set } from "immutable";
import { Tensor, Rank } from "@tensorflow/tfjs-node-gpu";
import { requireDefined } from "studio-util";
import { defaultMctsConfig, mcts } from "./mcts.js";

const alice = new Player("alice", "Alice");
const bob = new Player("bob", "Bob");
// const cecile = new Player("cecile", "Cecile");
// const derek = new Player("derek", "Derek");

class NotSerializable implements JsonSerializable, ToTensor {
  static readonly INSTANCE = new NotSerializable();

  toJson(): string {
    throw new Error("Method not implemented.");
  }
  asTensor(): Tensor<Rank> {
    throw new Error("Method not implemented.");
  }
}

class TestAction extends NotSerializable {}

class NumberAction extends TestAction implements Action {
  constructor(readonly number: number) {
    super();
  }
  equals(other: unknown): boolean {
    if (!(other instanceof NumberAction)) {
      return false;
    }
    return this.number == other.number;
  }
  hashCode(): number {
    return this.number;
  }
}

class TestGameState extends NotSerializable {}

// In "Pick One Number", each player gets one turn to pick a number, which equals
// their final score

class PickANumberConfiguration
  extends NotSerializable
  implements GameConfiguration
{
  constructor(readonly availableNumbers: Set<number>) {
    super();
  }
}

class PickANumberState extends TestGameState implements GameState {
  constructor(
    // readonly config: EpisodeConfiguration,
    readonly playerIdToNumber: Map<string, number>,
    readonly remainingNumbers: Set<number>
  ) {
    super();
  }
}

type PickANumberEpisodeSnapshot = EpisodeSnapshot<
  PickANumberConfiguration,
  PickANumberState
>;

class PickANumber
  implements Game<PickANumberConfiguration, PickANumberState, NumberAction>
{
  playerCounts = [2, 3, 4];

  static INSTANCE = new PickANumber();

  newEpisode(config: EpisodeConfiguration): PickANumberEpisodeSnapshot {
    const availableNumbers = Set(Range(1, 10));
    return new EpisodeSnapshot(
      config,
      new PickANumberConfiguration(Set(Range(1, 10))),
      new PickANumberState(Map(), availableNumbers)
    );
  }

  apply(
    snapshot: PickANumberEpisodeSnapshot,
    action: NumberAction
  ): [PickANumberState, any] {
    if (!snapshot.state.remainingNumbers.contains(action.number)) {
      throw new Error(`Chose unavailable number ${action.number}`);
    }
    const currentPlayer = requireDefined(this.currentPlayer(snapshot));
    return [
      new PickANumberState(
        snapshot.state.playerIdToNumber.set(currentPlayer.id, action.number),
        snapshot.state.remainingNumbers.remove(action.number)
      ),
      0,
    ];
  }

  result(snapshot: PickANumberEpisodeSnapshot): PlayerValues | undefined {
    if (
      snapshot.state.playerIdToNumber.count() <
      snapshot.episodeConfiguration.players.players.count()
    ) {
      return undefined;
    }
    return scoresToPlayerValues(snapshot.state.playerIdToNumber);
  }

  currentPlayer(snapshot: PickANumberEpisodeSnapshot): Player | undefined {
    return snapshot.episodeConfiguration.players.players.find(
      (player) => snapshot.state.playerIdToNumber.get(player.id) == undefined
    );
  }

  tensorToAction(tensor: Tensor<Rank>): NumberAction {
    throw new Error("Method not implemented.");
  }
}

/**
 * Fake model for {@link PickANumber}.
 *
 * The policy function is perfect (absolutely prefers '9').
 *
 * The value function acts as if the game will end up tied.
 */
class PickANumberModel
  implements Model<GameConfiguration, PickANumberState, NumberAction>
{
  static INSTANCE = new PickANumberModel();

  static STATE_VALUE = 0.5;

  policy(
    snapshot: EpisodeSnapshot<GameConfiguration, PickANumberState>
  ): Map<NumberAction, number> {
    const greatestRemainingNumber = snapshot.state.remainingNumbers.max();
    return Map(
      snapshot.state.remainingNumbers.map((number) => [
        new NumberAction(number),
        number == greatestRemainingNumber ? 1 : 0,
      ])
    );
  }
  value(
    snapshot: EpisodeSnapshot<GameConfiguration, PickANumberState>
  ): PlayerValues {
    const players = snapshot.episodeConfiguration.players.players;
    if (snapshot.state.playerIdToNumber.count() == players.count()) {
      console.log(`Value function called on finished game`);
    }
    return {
      playerIdToValue: Map(
        players.map((player) => [player.id, PickANumberModel.STATE_VALUE])
      ),
    };
  }
}

test("mcts: single-step deterministic game: explore each possible first action: expected values come from model", () => {
  const players = new Players(alice, bob);
  const mctsConfig = { ...defaultMctsConfig, simulationCount: 9 };
  const result = mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  assert.equal(result.count(), 9);
  for (const actionResult of result.values()) {
    for (const player of players.players) {
      assert.equal(
        actionResult.playerIdToValue.get(player.id),
        PickANumberModel.STATE_VALUE
      );
    }
  }
});

test("mcts: single-step deterministic game: many simulations: best move has highest expected value", () => {
  const players = new Players(alice, bob);
  const mctsConfig = {
    ...defaultMctsConfig,
    simulationCount: 100,
    explorationBias: 0.5,
  };
  const result = mcts(
    mctsConfig,
    PickANumber.INSTANCE,
    PickANumberModel.INSTANCE,
    PickANumber.INSTANCE.newEpisode(new EpisodeConfiguration(players))
  );

  assert.isTrue(
    requireDefined(
      Seq(result.entries()).max(
        (left, right) =>
          requireDefined(left[1].playerIdToValue.get(alice.id)) -
          requireDefined(right[1].playerIdToValue.get(alice.id))
      )
    )[0].equals(new NumberAction(9))
  );
});
