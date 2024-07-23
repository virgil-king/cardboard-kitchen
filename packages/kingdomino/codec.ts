import { Seq } from "immutable";
import { requireDefined } from "studio-util";

export interface VectorCodec<ValueT> {
  columnCount: number;
  encode(value: ValueT): ReadonlyArray<number>;
  decode(values: ReadonlyArray<number>): ValueT;
}

// The value type of T if it's a TensorCodec or otherwise never
export type CodecValueType<CodecT> = CodecT extends VectorCodec<infer input>
  ? input
  : never;

export class ScalarCodec implements VectorCodec<number> {
  readonly columnCount = 1;
  encode(value: number): number[] {
    return [value];
  }
  decode(values: number[]): number {
    return values[0];
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
  constructor(possibleValueCount: number) {
    this.columnCount = possibleValueCount;
  }
  encode(value: number): ReadonlyArray<number> {
    return oneHotValues(this.columnCount, value);
  }
  decode(values: number[]): number {
    return requireDefined(Seq(values).max());
  }
}

/** Stores an optional non-negative integer */
export class OptionalOneHotCodec implements VectorCodec<number | undefined> {
  readonly columnCount: number;
  private readonly zeros: ReadonlyArray<number>;
  constructor(maxValue: number) {
    this.columnCount = maxValue + 1;
    this.zeros = Array(this.columnCount).fill(0);
  }
  encode(value: number | undefined): ReadonlyArray<number> {
    return value == undefined
      ? this.zeros
      : oneHotValues(this.columnCount, value);
  }
  decode(values: ReadonlyArray<number>): number {
    return requireDefined(Seq(values).max());
  }
}

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
  encode(value: T | undefined): ReadonlyArray<number> {
    return value == undefined ? this.zeros : this.codec.encode(value);
  }
  decode(values: ReadonlyArray<number>): T | undefined {
    throw new Error("Method not implemented.");
  }
}

export class ObjectCodec<T extends { [key: string]: VectorCodec<unknown> }>
  implements
    VectorCodec<{
      [Property in keyof T]: CodecValueType<T[Property]>;
    }>
{
  columnCount: number;
  constructor(readonly props: T) {
    this.columnCount = Seq(Object.values(props))
      .map((value) => value.columnCount)
      .reduce((sum, value) => sum + value, 0);
  }
  encode(value: {
    [Property in keyof T]: CodecValueType<T[Property]>;
  }): ReadonlyArray<number> {
    const result: number[] = [];
    for (const [key, codec] of Object.entries(this.props)) {
      result.push(...codec.encode(value[key]));
    }
    return result;
  }
  decode(values: ReadonlyArray<number>): {
    [Property in keyof T]: CodecValueType<T[Property]>;
  } {
    const result: { [key: string]: any } = {
      ...this.props,
    };
    let columnOffset = 0;
    for (const [key, codec] of Object.entries(this.props)) {
      const columnCount = codec.columnCount;
      result[key] = codec.decode(
        values.slice(columnOffset, columnOffset + columnCount)
      );
      columnOffset += columnCount;
    }
    return result as any;
  }
}

export class ArrayCodec<T> implements VectorCodec<ReadonlyArray<T>> {
  columnCount: number;
  constructor(readonly itemCodec: VectorCodec<T>, readonly length: number) {
    this.columnCount = itemCodec.columnCount * length;
  }
  encode(values: ReadonlyArray<T>): ReadonlyArray<number> {
    if (values.length != this.length) {
      throw new Error(
        `Received ${values.length} items but expected ${this.length}`
      );
    }
    const result: number[] = [];
    for (const item of values) {
      result.push(...this.itemCodec.encode(item));
    }
    return result;
  }
  decode(values: ReadonlyArray<number>): ReadonlyArray<T> {
    const result: T[] = [];
    let columnOffset = 0;
    for (const item of values) {
      result.push(
        this.itemCodec.decode(
          values.slice(columnOffset, columnOffset + this.itemCodec.columnCount)
        )
      );
      columnOffset += this.itemCodec.columnCount;
    }
    return result;
  }
}

/** Codec that passes through the array of numbers in both directions */
export class RawCodec implements VectorCodec<ReadonlyArray<number>> {
  constructor(readonly columnCount: number) {}
  encode(value: readonly number[]): readonly number[] {
    return value;
  }
  decode(values: readonly number[]): readonly number[] {
    return values;
  }
}
