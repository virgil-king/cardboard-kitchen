
import { Player } from "game";
import * as Proto from "kingdomino-proto";

export class Vector2 {
  constructor(readonly x: number, readonly y: number) {}

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
