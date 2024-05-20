import { create, RandomSeed } from "random-seed";

interface Pseudorandom {
  random(): number;
}

class RandomSeedPseudorandom implements Pseudorandom {
  readonly prng: RandomSeed;
  constructor(seed: string) {
    this.prng = create(seed);
  }
  /**
   * Returns a random number between 0 and 1
   */
  random(): number {
    return this.prng.random();
  }
}
