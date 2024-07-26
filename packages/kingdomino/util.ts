import { combineHashes, decodeOrThrow } from "studio-util";
import { Seq, ValueObject, hash } from "immutable";
import * as io from "io-ts";
import { JsonSerializable } from "game";

export const vector2Json = io.type({
  x: io.number,
  y: io.number,
});

type Vector2Json = io.TypeOf<typeof vector2Json>;

export class Vector2 implements ValueObject, JsonSerializable {
  private readonly _hashCode: number;
  constructor(readonly x: number, readonly y: number) {
    this._hashCode = combineHashes(hash(this.x), hash(this.y));
  }
  static origin = new Vector2(0, 0);

  static fromJson(json: unknown): Vector2 {
    const parsed = decodeOrThrow(vector2Json, json);
    return new Vector2(parsed.x, parsed.y);
  }

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
    return this._hashCode;
  }

  toJson(): Vector2Json {
    return { x: this.x, y: this.y };
  }
}

export class Direction {
  private constructor(readonly offset: Vector2, readonly label: string) {}
  static readonly LEFT = new Direction(new Vector2(-1, 0), "left");
  static readonly UP = new Direction(new Vector2(0, 1), "up");
  static readonly RIGHT = new Direction(new Vector2(1, 0), "right");
  static readonly DOWN = new Direction(new Vector2(0, -1), "down");
  opposite(): Direction {
    return Direction.opposites[Direction.valuesArray.indexOf(this)];
  }
  index(): number {
    return Direction.valuesArray.indexOf(this);
  }
  static fromIndex(index: number): Direction {
    return Direction.valuesArray[index];
  }
  static *values(): Generator<Direction> {
    yield this.LEFT;
    yield this.UP;
    yield this.RIGHT;
    yield this.DOWN;
  }
  static valuesArray: ReadonlyArray<Direction> = [
    Direction.LEFT,
    Direction.UP,
    Direction.RIGHT,
    Direction.DOWN,
  ];
  static readonly opposites: ReadonlyArray<Direction> = [
    Direction.RIGHT,
    Direction.DOWN,
    Direction.LEFT,
    Direction.UP,
  ];
  static withOffset(offset: Vector2) {
    return Seq(Direction.values()).find((d) => d.offset.equals(offset));
  }
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

  center(): Vector2 {
    return new Vector2(
      (this.right + this.left) / 2,
      (this.top + this.bottom) / 2
    );
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
    return combineHashes(
      hash(this.left),
      hash(this.top),
      hash(this.right),
      hash(this.bottom)
    );
  }
}

// export function assertDefined<T>(val: T): asserts val is NonNullable<T> {
//   if (val === undefined || val === null) {
//     throw new Error(`Expected 'val' to be defined, but received ${val}`);
//   }
// }
