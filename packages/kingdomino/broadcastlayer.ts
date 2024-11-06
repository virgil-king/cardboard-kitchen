import tf from "@tensorflow/tfjs-node-gpu";

export interface BroadcastArgs {
  name?: string;
  /**
   * Null values will cause the input tensor to retain its size in that dimension.
   *
   * Unlike broadcastTo, the number of dimensions in this shape must equal the
   * number of dimensions in the input tensor's shape.
   */
  shape: ReadonlyArray<number | null>;
}

/** See {@link tf.broadcastTo} */
export class BroadcastLayer extends tf.layers.Layer {
  /** @nocollapse */
  static className = "BroadcastLayer";
  readonly shape: ReadonlyArray<number | null>;

  constructor(args: BroadcastArgs) {
    super(args);
    this.shape = args.shape;
  }

  override computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return this.shape.map((value, index) => {
      if (value == null) {
        return inputShape[index];
      } else {
        return value;
      }
    });
  }

  override call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor | tf.Tensor[] {
    return tf.tidy(() => {
      const derivedInput = this.getSingleTensor(inputs);
      const inputShape = derivedInput.shape;
      const nonNullShape = this.shape.map((value, index) => {
        if (value == null) {
          return inputShape[index];
        } else {
          return value;
        }
      });
      return derivedInput.broadcastTo([...nonNullShape]);
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
      shape: [...this.shape],
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
tf.serialization.registerClass(BroadcastLayer);
