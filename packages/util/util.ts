/**
 * @param low inclusive lower bound
 * @param high inclusive upper bound
 * @returns a random number between `low` and `high`
 */
function randomBetween(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high + 1 - low));
}

export function shuffle<T>(items: ReadonlyArray<T>): Array<T> {
  const length = items.length;
  const result = Array.from(items);
  for (let i = 0; i < length - 1; i++) {
    const dest = randomBetween(i, length - 1);
    [result[i], result[dest]] = [result[dest], result[i]];
  }
  return result;
}
