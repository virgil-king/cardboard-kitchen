import tf from "@tensorflow/tfjs-node-gpu";

export interface BroadcastArgs {
  name?: string;
  shape: ReadonlyArray<number>;
}

/** See {@link tf.broadcastTo} */
export class BroadcastLayer extends tf.layers.Layer {
  /** @nocollapse */
  static className = "BroadcastLayer";
  readonly shape: ReadonlyArray<number>;

  constructor(args: BroadcastArgs) {
    super(args);
    this.shape = args.shape;
  }

  override computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return [inputShape[0], ...this.shape, ...inputShape.slice(1)];
  }

  override call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor | tf.Tensor[] {
    return tf.tidy(() => {
      if (inputs instanceof tf.Tensor) {
        return inputs.broadcastTo([...this.shape]);
      } else {
        throw new Error(
          `Expected one input tensor but received ${inputs.length}`
        );
      }
    });
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
