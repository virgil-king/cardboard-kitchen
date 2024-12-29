import { Seq, ValueObject, hash } from "immutable";
import { combineHashes } from "game";
import { Vector2 } from "game";

export class Direction {
  private constructor(
    readonly index: number,
    readonly offset: Vector2,
    readonly label: string
  ) {}
  static readonly LEFT = new Direction(0, new Vector2(-1, 0), "left");
  static readonly UP = new Direction(1, new Vector2(0, 1), "up");
  static readonly RIGHT = new Direction(2, new Vector2(1, 0), "right");
  static readonly DOWN = new Direction(3, new Vector2(0, -1), "down");
  opposite(): Direction {
    return Direction.opposites[Direction.valuesArray.indexOf(this)];
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
  static readonly toOneQuarterRotation: ReadonlyArray<Direction> = [
    Direction.UP,
    Direction.RIGHT,
    Direction.DOWN,
    Direction.LEFT,
  ];
  static readonly toLeftRightMirror: ReadonlyArray<Direction> = [
    Direction.RIGHT,
    Direction.UP,
    Direction.LEFT,
    Direction.DOWN,
  ];
  transform(transformation: BoardTransformation): Direction {
    var result: Direction = this;
    if (transformation.mirror) {
      result = Direction.toLeftRightMirror[result.index];
    }
    for (let i = 0; i < (transformation.quarterTurns || 0); i++) {
      result = Direction.toOneQuarterRotation[result.index];
    }
    return result;
  }
  static withOffset(offset: Vector2): Direction | undefined {
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

export type BoardTransformation = {
  /**
   * Whether to mirror around the Y axis (left/right).
   *
   * Mirroring must be performed before rotation.
   */
  readonly mirror?: boolean;
  readonly quarterTurns?: number;
};

export const NO_TRANSFORM: BoardTransformation = {};
