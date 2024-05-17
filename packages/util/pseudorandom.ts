import { prng_alea } from "esm-seedrandom";

interface Pseudorandom {
  float(): number;
}

class AleaPseudorandom implements Pseudorandom {
  readonly alea: prng_alea;
  constructor(seed: string) {
    this.alea = prng_alea(seed);
  }
  float(): number {
    return this.alea();
  }
}
