import type {
  AudioDevice,
  AudioSourceConfig,
  BackendErrorCode,
  Range,
  ScoreLoadResult,
  SessionSnapshot,
  SessionStateChanged,
  TrackingPosition,
} from './protocol';

export const IpcChannel = {
  BackendInvoke: 'backend:invoke',
  BackendGetStatus: 'backend:get-status',
  BackendEvent: 'backend:event',
  DialogOpenScore: 'dialog:open-score',
  DialogOpenWav: 'dialog:open-wav',
} as const;

export interface BackendStatus {
  state: 'starting' | 'running';
  name: string;
}

export type BackendEvent =
  | { method: 'tracking.position'; params: TrackingPosition }
  | { method: 'session.stateChanged'; params: SessionStateChanged }
  | { method: 'backend.statusChanged'; params: BackendStatus }
  | { method: 'backend.log'; params: { line: string } };

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: BackendErrorCode; message: string } };

export interface WindowApi {
  score: {
    load(path: string): Promise<IpcResult<ScoreLoadResult>>;
  };
  audio: {
    listDevices(): Promise<IpcResult<{ devices: AudioDevice[] }>>;
  };
  session: {
    start(params: { scoreId: string; source: AudioSourceConfig; range?: Range }): Promise<
      IpcResult<{ sessionId: string; state: 'preparing'; range: Range }>
    >;
    stop(sessionId: string): Promise<IpcResult<{ accepted: boolean }>>;
    getState(): Promise<IpcResult<SessionSnapshot>>;
  };
  dialogs: {
    openScoreFile(): Promise<string | null>;
    openWavFile(): Promise<string | null>;
  };
  backend: {
    getStatus(): Promise<BackendStatus>;
    onEvent(listener: (event: BackendEvent) => void): () => void;
  };
}
