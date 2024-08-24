import { Range } from "immutable";
import { SettablePromise } from "studio-util";

// This file contains a prototype of a pattern that coud be used to perform
// batched, single-threaded MCTS. Multiple branches may be taken concurrently
// at each node with each leaf submitting a query to a buffer and returning a
// promise. After all leaves have returned, all queries are satisfied as a
// batch and all leaf promises are fulfilled.

interface ValueLookup {
  lookup(): Promise<number>;
}

class Node {
  readonly selfValue: number | undefined = undefined;
  value = this.selfValue;
  readonly children = Array<Node>();
  visitCount = 0;
  visit(count: number, valueLookup: ValueLookup): Promise<number> {
    console.log(`Count is ${count}`);
    this.visitCount += count;
    var childVisitCount = count;
    const promises = Array<Promise<number>>();
    if (this.children.length == 0) {
      this.children.push(
        ...Range(0, 9)
          .map((i) => new Node())
          .toArray()
      );
      childVisitCount--;
      promises.push(valueLookup.lookup());
    }

    const childToCount = new Map<Node, number>();
    for (const i of Range(0, childVisitCount)) {
      const childIndex = Math.floor(Math.random() * this.children.length);
      const child = this.children[childIndex];
      childToCount.set(child, 1 + (childToCount.get(child) ?? 0));
    }
    for (const [child, childCount] of childToCount.entries()) {
      console.log(`Child count is ${childCount}`);
      promises.push(
        child.visit(childCount, valueLookup).then((value) => value * childCount)
      );
    }

    return Promise.allSettled(promises).then((results) => {
      let sum = 0;
      for (const result of results) {
        if (result.status == "rejected") {
          return Promise.reject("Child visit failed");
        }
        sum += result.value;
      }
      const visitAverage = sum / count;
      console.log(`visitAverage is ${visitAverage} (${sum} / ${count})`);
      this.value =
        (this.value ?? 0) * ((this.visitCount - count) / this.visitCount) +
        visitAverage * (count / this.visitCount);
      return Promise.resolve(this.value);
    });
  }
}

class ValueLookupImpl implements ValueLookup {
  readonly promises = new Array<SettablePromise<number>>();
  lookup(): Promise<number> {
    const result = new SettablePromise<number>();
    this.promises.push(result);
    return result.promise;
  }
}

async function main() {
  const count = 128;
  const root = new Node();
  const lookup = new ValueLookupImpl();
  const result = root.visit(count, lookup);
  if (lookup.promises.length != count) {
    throw new Error(
      `Lookup received ${lookup.promises.length} instead of ${count}`
    );
  }
  for (const promise of lookup.promises) {
    promise.fulfill(Math.random());
  }
  console.log(`Final result is ${await result}`);
}

main();
