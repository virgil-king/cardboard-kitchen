import tfTypes from "@tensorflow/tfjs";
import { TfModule } from "./tf.js";

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

export interface BroadcastLayerFactory {
  create(args: BroadcastArgs): tfTypes.layers.Layer;
}

let _factory: BroadcastLayerFactory | undefined = undefined;
let _tfRuntime: TfModule | undefined = undefined;

/**
 * Creates and registers the broadcast table type if needed and returns a
 * factory for creating broadcast tables.
 */
export function getBroadcastLayerFactory(
  tfRuntime: TfModule
): BroadcastLayerFactory {
  if (_factory != null) {
    if (_tfRuntime != tfRuntime) {
      throw new Error(
        `getBroadcastLayerFactory called with different TF module arguments`
      );
    }
    return _factory;
  }
  const result = createBroadcastLayerFactory(tfRuntime);
  _factory = result;
  _tfRuntime = tfRuntime;
  return result;
}

function createBroadcastLayerFactory(
  tfRuntime: TfModule
): BroadcastLayerFactory {
  /** See {@link tfRuntime.broadcastTo} */
  class BroadcastLayer extends tfRuntime.layers.Layer {
    /** @nocollapse */
    static className = "BroadcastLayer";
    readonly shape: ReadonlyArray<number | null>;

    constructor(args: BroadcastArgs) {
      super(args);
      this.shape = args.shape;
    }

    override computeOutputShape(inputShape: tfTypes.Shape): tfTypes.Shape {
      return this.shape.map((value, index) => {
        if (value == null) {
          return inputShape[index];
        } else {
          return value;
        }
      });
    }

    override call(
      inputs: tfTypes.Tensor | tfTypes.Tensor[]
    ): tfTypes.Tensor | tfTypes.Tensor[] {
      return tfTypes.tidy(() => {
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

    getSingleTensor(
      input: tfTypes.Tensor | tfTypes.Tensor[]
    ): tfTypes.Tensor {
      if (input instanceof tfRuntime.Tensor) {
        return input;
      } else if (Array.isArray(input) && input.length == 1) {
        return input[0];
      } else {
        throw new Error(`Expected one tensor but received ${input.length}`);
      }
    }

    override getConfig(): tfTypes.serialization.ConfigDict {
      const config = {
        shape: [...this.shape],
      };
      const baseConfig = super.getConfig();
      Object.assign(config, baseConfig);
      return config;
    }

    static override fromConfig<T extends tfTypes.serialization.Serializable>(
      cls: tfTypes.serialization.SerializableConstructor<T>,
      config: tfTypes.serialization.ConfigDict
    ): T {
      return new cls(config);
    }
  }
  tfRuntime.serialization.registerClass(BroadcastLayer);

  return {
    create: (args: BroadcastArgs) => new BroadcastLayer(args),
  };
}
