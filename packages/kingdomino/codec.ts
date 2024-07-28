import { Seq } from "immutable";
import { requireDefined } from "studio-util";

export interface VectorCodec<ValueT> {
  columnCount: number;
  encode(value: ValueT, into: Float32Array, offset: number): void;
  decode(from: Float32Array, offset: number): ValueT;
}

// The value type of T if it's a TensorCodec or otherwise never
export type CodecValueType<CodecT> = CodecT extends VectorCodec<infer input>
  ? input
  : never;

export class ScalarCodec implements VectorCodec<number> {
  readonly columnCount = 1;
  encode(value: number, into: Float32Array, offset: number): void {
    into[offset] = value;
  }
  decode(from: Float32Array, offset: number): number {
    return from[offset];
  }
}

function oneHotValues(count: number, hot: number): Array<number> {
  const result = new Array<number>(count);
  result.fill(0);
  result[hot] = 1;
  return result;
}

/** Stores a required non-negative integer */
export class OneHotCodec implements VectorCodec<number> {
  readonly columnCount: number;
  constructor(size: number) {
    this.columnCount = size;
  }
  encode(value: number, into: Float32Array, offset: number): void {
    for (let index = offset; index < offset + this.columnCount; index++) {
      const arrayValue = index - offset == value ? 1 : 0;
      into[index] = arrayValue;
    }
  }
  decode(from: Float32Array, offset: number): number {
    // Return the index with the greatest value
    let max = Number.NEGATIVE_INFINITY;
    let maxIndex = offset;
    for (let index = offset; index < offset + this.columnCount; index++) {
      if (from[index] > max) {
        maxIndex = index;
        max = from[index];
      }
    }
    return maxIndex - offset;
  }
}

/** Stores an optional non-negative integer */
// export class OptionalOneHotCodec implements VectorCodec<number | undefined> {
//   readonly columnCount: number;
//   private readonly zeros: ReadonlyArray<number>;
//   constructor(maxValue: number) {
//     this.columnCount = maxValue + 1;
//     this.zeros = Array(this.columnCount).fill(0);
//   }
//   encode(value: number | undefined, into: Float32Array, offset: number): void {
//     return value == undefined
//       ? this.zeros
//       : oneHotValues(this.columnCount, value);
//   }
//   decode(values: ReadonlyArray<number>): number {
//     return requireDefined(Seq(values).max());
//   }
// }

/**
 * Encodes defined inputs using a delegate codec and encodes undefined input as
 * all zeros
 */
export class OptionalCodec<T> implements VectorCodec<T | undefined> {
  private zeros: ReadonlyArray<number>;
  constructor(readonly codec: VectorCodec<T>) {
    this.zeros = Array(codec.columnCount).fill(0);
  }
  get columnCount(): number {
    return this.codec.columnCount;
  }
  encode(value: T | undefined, into: Float32Array, offset: number): void {
    if (value == undefined) {
      into.set(this.zeros, offset);
    } else {
      this.codec.encode(value, into, offset);
    }
  }
  decode(from: Float32Array, offset: number): T | undefined {
    throw new Error("Method not implemented.");
  }
}

export class ObjectCodec<T extends { [key: string]: VectorCodec<unknown> }>
  implements
    VectorCodec<{
      [Property in keyof T]: CodecValueType<T[Property]>;
    }>
{
  readonly columnCount: number;
  constructor(readonly props: T) {
    this.columnCount = Seq(Object.values(props))
      .map((value) => value.columnCount)
      .reduce((sum, value) => sum + value, 0);
  }
  encode(
    value: {
      [Property in keyof T]: CodecValueType<T[Property]>;
    },
    into: Float32Array,
    offset: number
  ): void {
    let propertyOffset = offset;
    for (const [key, codec] of Object.entries(this.props)) {
      codec.encode(value[key], into, propertyOffset);
      propertyOffset += codec.columnCount;
    }
  }
  decode(
    from: Float32Array,
    offset: number
  ): {
    [Property in keyof T]: CodecValueType<T[Property]>;
  } {
    const result: { [key: string]: any } = {
      ...this.props,
    };
    let propertyOffset = offset;
    for (const [key, codec] of Object.entries(this.props)) {
      result[key] = codec.decode(from, propertyOffset);
      propertyOffset += codec.columnCount;
    }
    return result as any;
  }
}

export class ArrayCodec<T> implements VectorCodec<ReadonlyArray<T>> {
  columnCount: number;
  constructor(readonly itemCodec: VectorCodec<T>, readonly length: number) {
    this.columnCount = itemCodec.columnCount * length;
  }
  encode(value: ReadonlyArray<T>, into: Float32Array, offset: number): void {
    // if (values.length != this.length) {
    //   throw new Error(
    //     `Received ${values.length} items but expected ${this.length}`
    //   );
    // }
    // const result: number[] = [];
    let itemOffset = offset;
    for (const item of value) {
      this.itemCodec.encode(item, into, itemOffset);
      itemOffset += this.itemCodec.columnCount;
      // result.push(...this.itemCodec.encode(item));
    }
    // return result;
  }
  decode(from: Float32Array, offset: number): ReadonlyArray<T> {
    const result: T[] = [];
    let itemOffset = offset;
    for (let i = 0; i < this.length; i++) {
      result.push(this.itemCodec.decode(from, itemOffset));
      itemOffset += this.itemCodec.columnCount;
    }
    return result;
  }
}

/** Codec that passes through the array of numbers in both directions */
export class RawCodec implements VectorCodec<ReadonlyArray<number>> {
  constructor(readonly columnCount: number) {}
  encode(value: readonly number[], into: Float32Array, offset: number): void {
    into.set(value, offset);
  }
  decode(from: Float32Array, offset: number): readonly number[] {
    return [...from.slice(offset, offset + this.columnCount)];
  }
}
