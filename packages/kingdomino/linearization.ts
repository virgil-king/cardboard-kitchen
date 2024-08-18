import { array } from "io-ts";

/**
 * Linearizes 2-5 dimensional fixed-size rectangular number matrices into
 * {@link Float32Array}.
 *
 * It would be simpler and more flexible to take coordinate arrays instead of a
 * fixed number of method parameters but it would add an array allocation per call
 * which may be too expensive.
 */
export class Linearization {
  private static readonly maxDimensions = 5;
  private readonly dimensionToWidth = Array<number>();
  readonly arrayLength: number;
  constructor(readonly shape: ReadonlyArray<number>, readonly strict = true) {
    if (shape.length > Linearization.maxDimensions) {
      throw new Error(
        `Too many dimensions (${shape.length}); max is ${Linearization.maxDimensions}.`
      );
    }
    if (shape.length < 2) {
      throw new Error(`Too few dimensions (${shape.length}); min is 2.`);
    }
    if (shape.find((value) => value <= 1)) {
      throw new Error(`Dimension value was less than 2`);
    }
    let product = 1;
    for (let index = shape.length - 1; index >= 0; index--) {
      this.dimensionToWidth.unshift(product);
      const dimensionLength = shape[index];
      product *= dimensionLength;
    }
    this.arrayLength = product;
  }

  set(
    into: Float32Array,
    value: number,
    dim0: number,
    dim1: number,
    dim2?: number,
    dim3?: number,
    dim4?: number
  ) {
    let index = this.dimensionsToIndex(dim0, dim1, dim2, dim3, dim4);
    into[index] = value;
  }

  get(
    from: Float32Array,
    dim0: number,
    dim1: number,
    dim2?: number,
    dim3?: number,
    dim4?: number
  ): number {
    let index = this.dimensionsToIndex(dim0, dim1, dim2, dim3, dim4);
    return from[index];
  }

  /**
   * May be called with fewer than the total dimensions of this linearization.
   *
   * @returns the array offset where the remaining dimensions of data would be stored
   */
  getOffset(
    dim0: number,
    dim1?: number,
    dim2?: number,
    dim3?: number,
    dim4?: number
  ): number {
    let result = dim0 * this.dimensionToWidth[0];
    if (dim1 != undefined) {
      result += dim1 * this.dimensionToWidth[1];
    }
    if (dim2 != undefined) {
      result += dim2 * this.dimensionToWidth[2];
    }
    if (dim3 != undefined) {
      result += dim3 * this.dimensionToWidth[3];
    }
    if (dim4 != undefined) {
      result += dim4 * this.dimensionToWidth[4];
    }
    return result;
  }

  /**
   * Invokes {@link func} with each value in {@link array} and the
   * corresponding indices in each dimension.
   *
   * A value must be provided for every dimension of this linearization.
   */
  scan(
    array: Float32Array,
    func: (
      value: number,
      dim0: number,
      dim1: number,
      dim2?: number,
      dim3?: number,
      dim4?: number
    ) => void
  ) {
    if (array.length != this.arrayLength) {
      throw new Error(
        `Array length is ${array.length} instead of ${this.arrayLength}`
      );
    }
    for (let i = 0; i < this.shape[0]; i++) {
      const iOffset = i * this.dimensionToWidth[0];
      for (let j = 0; j < this.shape[1]; j++) {
        const jOffset = j * this.dimensionToWidth[1];
        if (this.dimensionToWidth.length == 2) {
          func(array[iOffset + jOffset], i, j);
        } else {
          for (let k = 0; k < this.shape[2]; k++) {
            const kOffset = k * this.dimensionToWidth[2];
            if (this.dimensionToWidth.length == 3) {
              func(array[iOffset + jOffset + kOffset], i, j, k);
            } else {
              throw new Error("Not yet implemented");
            }
          }
        }
      }
    }
  }

  private dimensionsToIndex(
    dim0: number,
    dim1: number,
    dim2?: number,
    dim3?: number,
    dim4?: number
  ): number {
    // Check dimension bounds
    if (this.strict) {
      if (dim0 >= this.shape[0]) {
        throw new Error(`Dimension 1 value too large: ${dim0}`);
      }
      if (dim1 >= this.shape[1]) {
        throw new Error(`Dimension 2 value too large: ${dim1}`);
      }
      if ((dim2 == undefined) != this.shape.length < 3) {
        throw new Error(`Dimension 3 was provided incorrectly`);
      }
      if (dim2 != undefined && dim2 >= this.shape[2]) {
        throw new Error(`Dimension 3 value too large: ${dim2}`);
      }
      if ((dim3 == undefined) != this.shape.length < 4) {
        throw new Error(`Dimension 4 was provided incorrectly`);
      }
      if (dim3 != undefined && dim3 >= this.shape[3]) {
        throw new Error(`Dimension 4 value too large: ${dim3}`);
      }
      if ((dim4 == undefined) != this.shape.length < 5) {
        throw new Error(`Dimension 5 was provided incorrectly`);
      }
      if (dim4 != undefined && dim4 >= this.shape[4]) {
        throw new Error(`Dimension 5 value too large: ${dim4}`);
      }
    }

    let index =
      dim0 * this.dimensionToWidth[0] + dim1 * this.dimensionToWidth[1];
    if (dim2 != undefined) {
      index += dim2 * this.dimensionToWidth[2];
    }
    if (dim3 != undefined) {
      index += dim3 * this.dimensionToWidth[3];
    }
    if (dim4 != undefined) {
      index += dim4 * this.dimensionToWidth[4];
    }
    return index;
  }
}
