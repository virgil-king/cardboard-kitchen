import { Map, Seq } from "immutable";
import { Vector2 } from "game";
import { Linearization } from "./linearization.js";

/**
 * Codec from {@link ValueT} to and from {@link Float32Array}.
 *
 * Some implementations may not support decoding.
 */
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

// TODO consider changing to IterableCodec
export class ArrayCodec<T> implements VectorCodec<ReadonlyArray<T>> {
  columnCount: number;
  constructor(readonly itemCodec: VectorCodec<T>, readonly length: number) {
    this.columnCount = itemCodec.columnCount * length;
  }
  encode(value: ReadonlyArray<T>, into: Float32Array, offset: number): void {
    let itemOffset = offset;
    for (const item of value) {
      this.itemCodec.encode(item, into, itemOffset);
      itemOffset += this.itemCodec.columnCount;
    }
  }
  decode(from: Float32Array, offset: number): ReadonlyArray<T> {
    const result: T[] = [];
    for (const item of this.decodeAsGenerator(from, offset)) {
      result.push(item);
    }
    return result;
  }

  /**
   * Returns an {@link Iterable<T>} that yields the items from {@link from}
   * starting at {@link offset}
   */
  *decodeAsGenerator(from: Float32Array, offset: number): Iterable<T> {
    let itemOffset = offset;
    for (let i = 0; i < this.length; i++) {
      yield this.itemCodec.decode(from, itemOffset);
      itemOffset += this.itemCodec.columnCount;
    }
  }
}

/** Codec that passes through the array of numbers in both directions */
export class RawCodec implements VectorCodec<Float32Array> {
  constructor(readonly columnCount: number) {}
  encode(value: Float32Array, into: Float32Array, offset: number): void {
    into.set(value, offset);
  }
  decode(from: Float32Array, offset: number): Float32Array {
    return from.slice(offset, offset + this.columnCount);
  }
}

/**
 * Codec for 2D maps of {@link T}.
 *
 * Coordinates with no corresponding entry are left as zeros.
 */
export class Sparse2dCodec<T> implements VectorCodec<Map<Vector2, T>> {
  readonly columnCount: number;
  readonly linearization: Linearization;
  constructor(
    /** Inclusive start of the range of x */
    readonly xStart: number,
    /** Exclusive end of the range of x */
    readonly xEnd: number,
    /** Inclusive start of the range of y */
    readonly yStart: number,
    /** Exclusive end of the range of y */
    readonly yEnd: number,
    readonly itemCodec: VectorCodec<T>
  ) {
    const xLength = xEnd - xStart;
    const yLength = yEnd - yStart;
    this.linearization = new Linearization(
      [xLength, yLength, itemCodec.columnCount],
      /* strict= */ true
    );
    this.columnCount = this.linearization.arrayLength;
  }
  encode(value: Map<Vector2, T>, into: Float32Array, offset: number): void {
    for (const [key, v] of value.entries()) {
      const relativeX = key.x - this.xStart;
      const relativeY = key.y - this.yStart;
      const itemOffset = this.linearization.getOffset(relativeX, relativeY);
      this.itemCodec.encode(v, into, offset + itemOffset);
    }
  }
  decode(from: Float32Array, offset: number): Map<Vector2, T> {
    throw new Error("Method not implemented.");
  }
}

export function* decodeAsGenerator<T>(
  itemCodec: VectorCodec<T>,
  itemCount: number,
  from: Float32Array,
  offset: number = 0
) {
  const arrayCodec = new ArrayCodec(itemCodec, itemCount);
  yield* arrayCodec.decodeAsGenerator(from, offset);
}
