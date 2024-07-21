import { List } from "immutable";
import { Action, GameConfiguration, GameState } from "game";
import { randomBelow, requireDefined } from "studio-util";
import { ReadonlyArrayLike } from "training-data";

export class EpisodeBuffer<
  //   C extends GameConfiguration,
  //   S extends GameState,
  //   A extends Action
  ItemT,
  ArrayT extends ReadonlyArrayLike<ItemT>
> {
  private buffer = List<ArrayT>();
  private itemCount = 0;

  constructor(private readonly targetItemCount: number) {}

  addEpisode(episode: ArrayT) {
    this.buffer = this.buffer.push(episode);
    this.itemCount += episode.count();

    let purgedEpisodeCount = 0;
    while (this.itemCount > this.targetItemCount) {
      const excessItemCount = this.itemCount - this.targetItemCount;
      const firstEpisode = requireDefined(this.buffer.first());
      // If removing the first episode would take us below the target, don't
      if (firstEpisode.count() > excessItemCount) {
        break;
      }
      this.itemCount -= firstEpisode.count();
      this.buffer = this.buffer.shift();
      purgedEpisodeCount++;
    }

    if (purgedEpisodeCount > 0) {
      console.log(`Purged ${purgedEpisodeCount} episodes from buffer`);
    }
  }

  sampleCount(): number {
    return this.buffer.reduce(
      (reduction, episode) => reduction + episode.count(),
      0
    );
  }

  randomGame(): ArrayT {
    return requireDefined(this.buffer.get(randomBelow(this.buffer.count())));
  }

  sample(count: number): ReadonlyArray<ItemT> {
    if (count > this.itemCount) {
      throw new Error(
        `Requested more states (${count}) than available (${this.itemCount})}`
      );
    }

    // Sample randomly from games, then moves. This method is biased toward
    // shorter games but it doesn't seem worth doing better.
    const result = new Array<ItemT>();
    for (let i = 0; i < count; i++) {
      const episodeIndex = randomBelow(this.buffer.count());
      const episode = requireDefined(this.buffer.get(episodeIndex));
      result.push(requireDefined(episode.get(randomBelow(episode.count()))));
    }
    return result;
  }
}
