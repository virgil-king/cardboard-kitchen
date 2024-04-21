import { Player } from "game";
import * as Proto from "kingdomino-proto";

import { hash, ValueObject } from "immutable";

export class Vector2 implements ValueObject {
  constructor(readonly x: number, readonly y: number) {}

  equals(other: unknown): boolean {
    if (!(other instanceof Vector2)) {
      return false;
    }
    return this.x == other.x && this.y == other.y;
  }

  hashCode(): number {
    return hash(this.x) ^ hash(this.y);
  }

  plus(other: Vector2) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }
}

export class Direction {
  constructor(readonly offset: Vector2) {}
  static readonly LEFT = new Direction(new Vector2(-1, 0));
  static readonly UP = new Direction(new Vector2(0, 1));
  static readonly RIGHT = new Direction(new Vector2(1, 0));
  static readonly DOWN = new Direction(new Vector2(0, -1));
  static *values(): Generator<Direction> {
    yield this.LEFT;
    yield this.UP;
    yield this.RIGHT;
    yield this.DOWN;
  }
}

export function* neighbors(location: Vector2): Generator<Vector2> {
  yield location.plus(Direction.LEFT.offset);
  yield location.plus(Direction.UP.offset);
  yield location.plus(Direction.RIGHT.offset);
  yield location.plus(Direction.DOWN.offset);
}

export class Rectangle {
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

  extend(location: Vector2) {
    return new Rectangle(
      Math.min(this.left, location.x),
      Math.max(this.top, location.y),
      Math.max(this.right, location.x),
      Math.min(this.bottom, location.y)
    );
  }

  get height() {
    return this.top - this.bottom;
  }

  get width() {
    return this.right - this.left;
  }
}
