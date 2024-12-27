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

export function requireFulfilled<T>(result: PromiseSettledResult<T>): T {
  if (result.status == "rejected") {
    throw new Error(
      `Promise result was unexpectedly 'rejected': ${JSON.stringify(result)}`
    );
  }
  return result.value;
}

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

export function sum(seq: Seq<unknown, number>): number {
  return seq.reduce((result, value) => result + value, 0);
}

export async function throwFirstRejection(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status == "rejected") {
      throw new Error(`Promise was rejected with ${result.reason}`);
    }
  }
}

export function intersperse<T>(
  items: ReadonlyArray<T>,
  separator: T
): Array<T> {
  if (items.length == 0) {
    return [];
  }
  const result = new Array<T>();
  result.push(items[0]);
  for (const item of items.slice(1)) {
    result.push(separator);
    result.push(item);
  }
  return result;
}
