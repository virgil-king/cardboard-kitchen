import { Map, Seq, ValueObject } from "immutable";
import * as io from "io-ts";
import * as fp from "fp-ts";

/**
 * @param low inclusive lower bound
 * @param high exclusive upper bound
 * @returns a random number >= low and < high
 */
export function randomBetween(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low));
}

export function randomBelow(high: number): number {
  return randomBetween(0, high);
}

export function randomBoolean(): boolean {
  return Math.random() > 0.5;
}

// export function shuffle<T>(items: ReadonlyArray<T>): Array<T> {
//   const length = items.length;
//   const result = Array.from(items);
//   for (let i = 0; i < length - 1; i++) {
//     const dest = randomBetween(i, length - 1);
//     [result[i], result[dest]] = [result[dest], result[i]];
//   }
//   return result;
// }

export function combineHashes(...hashes: Array<number>): number {
  let result = hashes[0];
  for (let hash of hashes.slice(1)) {
    result = 31 * result + hash;
  }
  return result;
}

export function requireDefined<T>(
  val: T,
  message: string = "Unexpected undefined value"
): NonNullable<T> {
  if (val == undefined) {
    throw new Error(message);
  }
  return val;
}

export function requireNotDone<T>(result: IteratorResult<T>): T {
  if (result.done) {
    throw new Error("Iterator completed unexpectedly");
  }
  return result.value;
}

// export function apply<T, U>(value: T, func: (it: T) => U) {
//   return func(value);
// }

/**
 * Returns N items drawn randomly from {@link items}.
 *
 * Warning: {@link items} will be mutated by repositioning the drawn items to
 * the front
 */
export function drawN<T>(items: Array<T>, count: number) {
  const result = new Array<T>(count);
  for (let i = 0; i < count; i++) {
    const index = randomBetween(i, items.length);
    const temp = items[i];
    items[i] = items[index];
    items[index] = temp;
  }
  return items.slice(0, count);
}

/**
 * Returns a map whose values are the weighted average of the values from
 * {@link a} and {@link b}
 */
export function weightedMerge<K>(
  a: Map<K, number>,
  aWeight: number,
  b: Map<K, number>,
  bWeight: number
) {
  const weightSum = aWeight + bWeight;
  const normalizedAWeight = aWeight / weightSum;
  const normalizedBWeight = bWeight / weightSum;
  let result = Map<K, number>();
  for (const [key, value] of a.entries()) {
    const bValue = b.get(key);
    const mergedValue =
      bValue == undefined
        ? value
        : value * normalizedAWeight + bValue * normalizedBWeight;
    result = result.set(key, mergedValue);
    if (Number.isNaN(mergedValue)) {
      throw new Error("In both maps");
    }
  }
  // Keys in b but not in a
  for (const [key, value] of b.removeAll(a.keys())) {
    result = result.set(key, value);
    if (Number.isNaN(value)) {
      throw new Error("In b but not a");
    }
  }
  return result;
}

/**
 * Returns the result of decoding {@link json} using {@link decoder} or throws
 * an error that caused decoding to fail
 */
export function decodeOrThrow<DecodedT>(
  decoder: io.Decoder<unknown, DecodedT>,
  json: unknown
): DecodedT {
  const decodeResult = decoder.decode(json);
  if (fp.either.isLeft(decodeResult)) {
    console.log(`Failed to decode ${json} using ${decoder}`);
    console.log(new Error().stack);
    throw decodeResult.left[0];
  }
  return decodeResult.right;
}

export class SettablePromise<T> {
  private resolve: ((t: T) => void) | undefined = undefined;
  promise = new Promise<T>((r) => (this.resolve = r));
  fulfill(t: T) {
    requireDefined(this.resolve)(t);
  }
}

export async function sleep(durationMs: number) {
  await new Promise((r) => setTimeout(r, durationMs));
}

export function valueObjectsEqual(
  a: ValueObject | undefined,
  b: ValueObject | undefined
): boolean {
  if (a == undefined) {
    return b == undefined;
  }
  return a.equals(b);
}

export function proportionalRandom<K>(options: Seq.Keyed<K, number>): K {
  const sum = options.reduce((reduction, value) => reduction + value, 0);
  const random = Math.random();
  let skipped = 0;
  for (const [key, value] of options.entries()) {
    const threshold = skipped + value / sum;
    if (threshold > random) {
      return key;
    }
    skipped = threshold;
  }
  throw new Error("Unreachable");
}

type Indexed<T> = { index: number; value: T };

/**
 * Drives {@link generators} to completion, using {@link f} to provide the
 * parameters to {@link Generator.next} for batches of generators that yield
 * intermediate values
 *
 * @return the return values of {@link generators}
 */
export function driveGenerators<ItemT, ReturnT, NextT>(
  generators: ReadonlyArray<Generator<ItemT, ReturnT, NextT>>,
  f: (items: ReadonlyArray<ItemT>) => ReadonlyArray<NextT>
): ReadonlyArray<ReturnT> {
  // Pairs consisting of a generator and the latest question from that generator
  let generatorToNext = generators.map<
    [Generator<ItemT, ReturnT, NextT>, Indexed<IteratorResult<ItemT, ReturnT>>]
  >((generator, index) => {
    return [generator, { index: index, value: generator.next() }];
  });

  // Generator return values
  const results = new Array<ReturnT>(generators.length);

  // While there are any remaining generators (as opposed to return values)...
  while (generatorToNext.length != 0) {
    // Collect the generators and questions. The list may be shorter than
    // generatorToNext if some generators were completed on this step.
    const generatorToQuestion = new Array<
      [Generator<ItemT, ReturnT, NextT>, Indexed<ItemT>]
    >();
    for (const [generator, iteratorResult] of generatorToNext) {
      if (iteratorResult.value.done) {
        results[iteratorResult.index] = iteratorResult.value.value;
      } else {
        generatorToQuestion.push([
          generator,
          { index: iteratorResult.index, value: iteratorResult.value.value },
        ]);
      }
    }
    // Fetch answers
    // const startMs = performance.now();
    const responses =
      generatorToQuestion.length == 0
        ? []
        : f(generatorToQuestion.map(([, snapshot]) => snapshot.value));
    // Supply answers to the waiting generators yielding the next list of
    // iterator results to scan
    const newGeneratorToNext = new Array<
      [
        Generator<ItemT, ReturnT, NextT>,
        Indexed<IteratorResult<ItemT, ReturnT>>
      ]
    >();
    for (let i = 0; i < generatorToQuestion.length; i++) {
      const [generator, question] = generatorToQuestion[i];
      const next = generator.next(responses[i]);
      newGeneratorToNext.push([
        generatorToQuestion[i][0],
        { index: question.index, value: next },
      ]);
    }
    generatorToNext = newGeneratorToNext;
  }

  return results;
}

export function driveGenerator<OutT, ReturnT, InT>(
  generator: Generator<OutT, ReturnT, InT>,
  func: (_: OutT) => InT
): ReturnT {
  let item = generator.next();
  while (!item.done) {
    item = generator.next(func(item.value));
  }
  return item.value;
}
