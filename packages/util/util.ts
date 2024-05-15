/**
 * @param low inclusive lower bound
 * @param high exclusive upper bound
 * @returns a random number >= low and < high
 */
export function randomBetween(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low));
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
