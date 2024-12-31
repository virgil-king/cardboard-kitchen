import { ValueObject, hash } from "immutable";
import * as io from "io-ts";
import { JsonSerializable } from "../game.js";
import { combineHashes, decodeOrThrow } from "./util.js";

export const vector2Codec = io.type({
  x: io.number,
  y: io.number,
});

type Vector2Message = io.TypeOf<typeof vector2Codec>;

export class Vector2 implements ValueObject, JsonSerializable {
  private readonly _hashCode: number;
  constructor(readonly x: number, readonly y: number) {
    this._hashCode = combineHashes(hash(this.x), hash(this.y));
  }
  static origin = new Vector2(0, 0);

  static decode(message: unknown): Vector2 {
    const parsed = decodeOrThrow(vector2Codec, message);
    return new Vector2(parsed.x, parsed.y);
  }

  plus(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  minus(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
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

  encode(): Vector2Message {
    return { x: this.x, y: this.y };
  }
}
