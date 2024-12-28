import { Action, EpisodeSnapshot, GameConfiguration, GameState, SettablePromise } from "game";
import { InferenceModel, InferenceResult } from "./model.js";

type InferenceRequest<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> = {
  snapshots: ReadonlyArray<EpisodeSnapshot<C, S>>;
  results: SettablePromise<ReadonlyArray<InferenceResult<A>>>;
};

/**
 * Inference model wrapper that enqueues inference requests and fulfills them
 * all in `fulfillRequests`
 */
export class BatchingModel<
  C extends GameConfiguration,
  S extends GameState,
  A extends Action
> implements InferenceModel<C, S, A>
{
  constructor(readonly delegate: InferenceModel<C, S, A>) {}

  requests = new Array<InferenceRequest<C, S, A>>();

  infer(
    snapshots: ReadonlyArray<EpisodeSnapshot<C, S>>
  ): Promise<ReadonlyArray<InferenceResult<A>>> {
    if (snapshots.length == 0) {
      throw new Error(`BatchingModel#infer called with no snapshots`);
    }

    const promise = new SettablePromise<ReadonlyArray<InferenceResult<A>>>();

    this.requests.push({ snapshots: snapshots, results: promise });

    return promise.promise;
  }

  /**
   * If any requests are pending, issues them all as a single batch and
   * fulfills the promises associated with each request.
   */
  async fulfillRequests() {
    if (this.requests.length == 0) {
      return;
    }
    const allRequests = new Array<EpisodeSnapshot<C, S>>();
    for (const request of this.requests) {
      allRequests.push(...request.snapshots);
    }
    const allResults = await this.delegate.infer(allRequests);
    let allResultsOffset = 0;
    for (const request of this.requests) {
      const requestCount = request.snapshots.length;
      request.results.fulfill(
        allResults.slice(allResultsOffset, allResultsOffset + requestCount)
      );
      allResultsOffset += requestCount;
    }
    this.requests = [];
  }
}
