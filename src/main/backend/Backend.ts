import type { BackendEvent, BackendStatus } from '../../shared/ipc';
import type { BackendMethodName, MethodParams, MethodResult } from '../../shared/protocol';

export interface Backend {
  start(): Promise<BackendStatus>;
  request<M extends BackendMethodName>(method: M, params: MethodParams<M>): Promise<MethodResult<M>>;
  shutdown(): Promise<void>;
  getStatus(): BackendStatus;
  onEvent(listener: (event: BackendEvent) => void): () => void;
}
