import * as tf from "@tensorflow/tfjs";

export interface ExpandDimsArgs {
  name?: string;
  /**
   * Dimension indices at which to insert new dimensions.
   *
   * Dimensions are inserted in forward order.
   */
  shape: ReadonlyArray<number>;
}

/** See {@link tf.Tensor.expandDims} */
export class ExpandDimsLayer extends tf.layers.Layer {
  static className = "ExpandDimsLayer";
  readonly dimensionIndices: ReadonlyArray<number>;

  constructor(args: ExpandDimsArgs) {
    super(args);
    this.dimensionIndices = args.shape;
  }

  override computeOutputShape(inputShape: tf.Shape): tf.Shape {
    let result = [...inputShape];
    for (const index of this.dimensionIndices) {
      result.splice(index, 0, 1);
    }
    return result;
  }

  override call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor | tf.Tensor[] {
    return tf.tidy(() => {
      let result = this.getSingleTensor(inputs);
      for (const index of this.dimensionIndices) {
        result = result.expandDims(index);
      }
      return result;
    });
  }

  getSingleTensor(input: tf.Tensor | tf.Tensor[]): tf.Tensor {
    if (input instanceof tf.Tensor) {
      return input;
    } else if (Array.isArray(input) && input.length == 1) {
      return input[0];
    } else {
      throw new Error(`Expected one tensor but received ${input.length}`);
    }
  }

  override getConfig(): tf.serialization.ConfigDict {
    const config = {
      shape: [...this.dimensionIndices],
    };
    const baseConfig = super.getConfig();
    Object.assign(config, baseConfig);
    return config;
  }

  static override fromConfig<T extends tf.serialization.Serializable>(
    cls: tf.serialization.SerializableConstructor<T>,
    config: tf.serialization.ConfigDict
  ): T {
    return new cls(config);
  }
}
tf.serialization.registerClass(ExpandDimsLayer);
