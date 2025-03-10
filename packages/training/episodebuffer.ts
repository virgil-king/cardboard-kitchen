import { requireDefined, randomBelow } from "game";
import { List } from "immutable";
import { LazyArray } from "agent";

/**
 * A size-capped buffer of lists.
 */
export class EpisodeBuffer<ItemT, ArrayT extends LazyArray<ItemT>> {
  // Use List instead of Array for efficient `shift`
  private buffer = List<ArrayT>();
  private itemCount = 0;

  constructor(private readonly targetItemCount: number) {}

  addEpisode(episode: ArrayT) {
    this.buffer = this.buffer.push(episode);
    this.itemCount += episode.count();

    while (this.itemCount > this.targetItemCount) {
      const excessItemCount = this.itemCount - this.targetItemCount;
      const firstEpisode = requireDefined(this.buffer.first());
      // If removing the first episode would take us below the target, don't
      if (firstEpisode.count() > excessItemCount) {
        break;
      }
      this.itemCount -= firstEpisode.count();
      this.buffer = this.buffer.shift();
    }
  }

  sampleCount(): number {
    return this.itemCount;
  }

  sample(
    count: number,
    predicate: (item: ItemT) => boolean = () => true
  ): ReadonlyArray<ItemT> {
    if (count > this.itemCount) {
      throw new Error(
        `Requested more samples (${count}) than available (${this.itemCount})}`
      );
    }

    // Sample randomly from episodes, then moves. This method is biased toward
    // shorter episodes but it doesn't seem worth doing better.
    const result = new Array<ItemT>();
    while (result.length < count) {
      const episodeIndex = randomBelow(this.buffer.count());
      const episode = requireDefined(this.buffer.get(episodeIndex));
      const sample = requireDefined(episode.get(randomBelow(episode.count())));
      if (predicate(sample)) {
        result.push(sample);
      }
    }
    return result;
  }
}
