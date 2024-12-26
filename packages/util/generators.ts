
type Indexed<T> = { index: number; value: T };

/**
 * Drives {@link generators} to completion, using {@link f} to provide the
 * parameters to {@link Generator.next} for batches of generators that yield
 * intermediate values
 *
 * @return the return values of {@link generators}
 */
export async function driveGenerators<ItemT, ReturnT, NextT>(
  generators: ReadonlyArray<Generator<ItemT, ReturnT, NextT>>,
  f: (items: ReadonlyArray<ItemT>) => Promise<ReadonlyArray<NextT>>
): Promise<ReadonlyArray<ReturnT>> {
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
        : await f(generatorToQuestion.map(([, snapshot]) => snapshot.value));
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

/**
 * Drives {@link generators} to completion, using {@link f} to provide the
 * parameters to {@link Generator.next} for batches of generators that yield
 * intermediate values
 *
 * @return the return values of {@link generators}
 */
export async function driveAsyncGenerators<ItemT, ReturnT, NextT>(
  generators: ReadonlyArray<AsyncGenerator<ItemT, ReturnT, NextT>>,
  f: (items: ReadonlyArray<ItemT>) => Promise<ReadonlyArray<NextT>>
): Promise<ReadonlyArray<ReturnT>> {
  // Pairs consisting of a generator and the latest question from that generator
  let generatorToNext = generators.map<
    [
      AsyncGenerator<ItemT, ReturnT, NextT>,
      Indexed<Promise<IteratorResult<ItemT, ReturnT>>>
    ]
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
      [AsyncGenerator<ItemT, ReturnT, NextT>, Indexed<ItemT>]
    >();
    for (const [generator, indexedIteratorResult] of generatorToNext) {
      const iteratorResult = await indexedIteratorResult.value;
      if (iteratorResult.done) {
        results[indexedIteratorResult.index] = iteratorResult.value;
      } else {
        generatorToQuestion.push([
          generator,
          { index: indexedIteratorResult.index, value: iteratorResult.value },
        ]);
      }
    }
    // Fetch answers
    // const startMs = performance.now();
    const responses =
      generatorToQuestion.length == 0
        ? []
        : await f(generatorToQuestion.map(([, snapshot]) => snapshot.value));
    // Supply answers to the waiting generators yielding the next list of
    // iterator results to scan
    const newGeneratorToNext = new Array<
      [
        AsyncGenerator<ItemT, ReturnT, NextT>,
        Indexed<Promise<IteratorResult<ItemT, ReturnT>>>
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

export async function driveAsyncGenerator<OutT, ReturnT, InT>(
  generator: AsyncGenerator<OutT, ReturnT, InT>,
  func: (_: OutT) => Promise<InT>
): Promise<ReturnT> {
  let item = await generator.next();
  while (!item.done) {
    item = await generator.next(await func(item.value));
  }
  return item.value;
}
