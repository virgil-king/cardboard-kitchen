import { TransferableBatch } from "agent";
import * as worker_threads from "node:worker_threads";

export type LogMessage = {
  type: "log";
  message: string;
};

export type BatchRequestMessage = { type: "batch_request" };

export type NewModelAvailableMessage = { type: "new_model_available" };

export type TrainingBatchMessage<T extends TransferableBatch> = {
  type: "training_batch";
  batch: T;
};

export type TrainingBatchCompleteMessage = {
  type: "training_batch_complete";
  loss: ReadonlyArray<number>;
};

export type EpisodesBatchMessage = {
  type: "episode_batch";
  batch: ReadonlyArray<any>;
};

export type ControllerMessage =
  | LogMessage
  | BatchRequestMessage
  | TrainingBatchCompleteMessage
  | EpisodesBatchMessage
  | NewModelAvailableMessage;

export type SelfPlayWorkerMessage = NewModelAvailableMessage;

export type TrainingWorkerMessage<T extends TransferableBatch> =
  TrainingBatchMessage<T>;

export type EvalWorkerMessage = NewModelAvailableMessage;

export class TypedMessagePort<ReceiveT, SendT> {
  constructor(private readonly port: worker_threads.MessagePort) {}
  onMessage(listener: (message: ReceiveT) => void) {
    this.port.on("message", (message: any) => listener(message as ReceiveT));
  }
  postMessage(message: SendT, transfers?: ReadonlyArray<any>) {
    this.port.postMessage(message, transfers);
  }
}

export function createPorts<ReceiveT, SendT>(): {
  localPort: TypedMessagePort<ReceiveT, SendT>;
  remotePort: worker_threads.MessagePort;
} {
  const channel = new worker_threads.MessageChannel();
  return {
    localPort: new TypedMessagePort(channel.port1),
    remotePort: channel.port2,
  };
}
