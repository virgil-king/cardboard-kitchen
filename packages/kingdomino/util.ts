import { combineHashes } from "studio-util";

import { Seq, ValueObject, hash } from "immutable";

export class Vector2 implements ValueObject {
  constructor(readonly x: number, readonly y: number) {}

  static origin = new Vector2(0, 0);

  plus(other: Vector2) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  multiply(value: number) {
    return new Vector2(this.x * value, this.y * value);
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Vector2)) {
      return false;
    }
    return this.x == other.x && this.y == other.y;
  }

  hashCode(): number {
    return combineHashes(hash(this.x), hash(this.y));
  }
}

export class Direction {
  private constructor(readonly offset: Vector2) {}
  static readonly LEFT = new Direction(new Vector2(-1, 0));
  static readonly UP = new Direction(new Vector2(0, 1));
  static readonly RIGHT = new Direction(new Vector2(1, 0));
  static readonly DOWN = new Direction(new Vector2(0, -1));
  opposite(): Direction {
    const result = Direction.withOffset(this.offset.multiply(-1));
    if (result == undefined) {
      throw new Error("Direction had no opposite direction!");
    }
    return result;
  }
  static *values(): Generator<Direction> {
    yield this.LEFT;
    yield this.UP;
    yield this.RIGHT;
    yield this.DOWN;
  }
  static withOffset(offset: Vector2) {
    return Seq(Direction.values()).find((d) => d.offset.equals(offset));
  }
}

export function* neighbors(location: Vector2): Generator<Vector2> {
  yield location.plus(Direction.LEFT.offset);
  yield location.plus(Direction.UP.offset);
  yield location.plus(Direction.RIGHT.offset);
  yield location.plus(Direction.DOWN.offset);
}

export class Rectangle implements ValueObject {
  constructor(
    readonly left: number,
    readonly top: number,
    readonly right: number,
    readonly bottom: number
  ) {
    if (left > right || bottom > top) {
      throw new Error(`Invalid rectangle: ${left}/${top}/${right}/${bottom}`);
    }
  }

  get height() {
    return this.top - this.bottom;
  }

  get width() {
    return this.right - this.left;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof Rectangle)) {
      return false;
    }
    return (
      this.left == other.left &&
      this.top == other.top &&
      this.right == other.right &&
      this.bottom == other.bottom
    );
  }
  hashCode(): number {
    return combineHashes(hash(this.left), hash(this.top), hash(this.right), hash(this.bottom));
  }
}

// export function assertDefined<T>(val: T): asserts val is NonNullable<T> {
//   if (val === undefined || val === null) {
//     throw new Error(`Expected 'val' to be defined, but received ${val}`);
//   }
// }

