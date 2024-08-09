import { Range } from "immutable";
import { SettablePromise } from "studio-util";
import { createSignal, main, Operation, Signal, Stream } from "effection";

interface ValueLookup {
  lookup(): Stream<number, unknown>;
}

// class Node {
//   readonly selfValue: number | undefined = undefined;
//   value = this.selfValue;
//   readonly children = Array<Node>();
//   visitCount = 0;
//   *visit(count: number, valueLookup: ValueLookup): Operation<number> {
//     console.log(`Count is ${count}`);
//     this.visitCount += count;
//     var childVisitCount = count;
//     const signals = Array<Stream<number, unknown>>();
//     if (this.children.length == 0) {
//       this.children.push(
//         ...Range(0, 9)
//           .map((i) => new Node())
//           .toArray()
//       );
//       childVisitCount--;
//       signals.push(valueLookup.lookup());
//     }

//     const childToCount = new Map<Node, number>();
//     for (const i of Range(0, childVisitCount)) {
//       const childIndex = Math.floor(Math.random() * this.children.length);
//       const child = this.children[childIndex];
//       childToCount.set(child, 1 + (childToCount.get(child) ?? 0));
//     }
//     for (const [child, childCount] of childToCount.entries()) {
//       console.log(`Child count is ${childCount}`);
//       signals.push(
//         child.visit(childCount, valueLookup).then((value) => value * childCount)
//       );
//     }

//     return Promise.allSettled(signals).then((results) => {
//       let sum = 0;
//       for (const result of results) {
//         if (result.status == "rejected") {
//           return Promise.reject("Child visit failed");
//         }
//         sum += result.value;
//       }
//       const visitAverage = sum / count;
//       console.log(`visitAverage is ${visitAverage} (${sum} / ${count})`);
//       this.value =
//         (this.value ?? 0) * ((this.visitCount - count) / this.visitCount) +
//         visitAverage * (count / this.visitCount);
//       return Promise.resolve(this.value);
//     });
//   }
// }

// class ValueLookupImpl implements ValueLookup {
//   readonly signals = new Array<Signal<number, never>>();
//   lookup(): Stream<number, unknown> {
//     const result = createSignal<number>();
//     this.signals.push(result);
//     return result;
//   }
// }

// function* run() {
//   const count = 128;
//   const root = new Node();
//   const lookup = new ValueLookupImpl();
//   const result = root.visit(count, lookup);
//   if (lookup.signals.length != count) {
//     throw new Error(
//       `Lookup received ${lookup.signals.length} instead of ${count}`
//     );
//   }
//   for (const signal of lookup.signals) {
//     signal.send(Math.random());
//   }
//   console.log(`Final result is ${yield* result}`);
// }

// main(function* () {
//   yield* run();
// });
// // main();
