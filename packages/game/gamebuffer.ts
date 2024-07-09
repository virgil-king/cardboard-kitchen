import { List } from "immutable";
import { Action, GameConfiguration, GameState } from "./game.js";
import { StateTrainingData } from "./model.js";
import { randomBelow, requireDefined } from "studio-util";

export class GameBuffer<
  //   C extends GameConfiguration,
  //   S extends GameState,
  //   A extends Action
  T
> {
  private buffer = List<ReadonlyArray<T>>();
  private itemCount = 0;

  constructor(private readonly maxItems: number) {}

  addGame(states: ReadonlyArray<T>) {
    this.buffer = this.buffer.push(states);
    this.itemCount += states.length;

    while (this.itemCount > this.maxItems) {
      this.itemCount -= requireDefined(this.buffer.first()).length;
      this.buffer = this.buffer.shift();
    }
  }

  sampleCount(): number {
    return this.buffer.reduce((reduction, game) => reduction + game.length, 0);
  }

  randomGame(): ReadonlyArray<T> {
    return requireDefined(this.buffer.get(randomBelow(this.buffer.count())));
  }

  sample(count: number): ReadonlyArray<T> {
    if (count > this.itemCount) {
      throw new Error(
        `Requested more states (${count}) than available (${this.itemCount})}`
      );
    }

    // Sample randomly from games, then moves. This method is biased toward
    // shorter games but it doesn't seem worth doing better.
    const result = new Array<T>();
    for (let i = 0; i < count; i++) {
      const gameIndex = randomBelow(this.buffer.count());
      const game = requireDefined(this.buffer.get(gameIndex));
      result.push(requireDefined(game[randomBelow(game.length)]));
    }
    return result;
  }
}
