import type { BackendEvent, BackendStatus, IpcResult, WindowApi } from '../../../shared/ipc';
import type {
  AudioDevice,
  AudioSourceConfig,
  BackendErrorCode,
  Range,
  ScoreLoadResult,
  SessionSnapshot,
} from '../../../shared/protocol';

export class BackendCallError extends Error {
  constructor(
    readonly code: BackendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackendCallError';
  }
}

export class BackendService {
  constructor(private readonly api: WindowApi = window.api) {}

  async loadScore(path: string): Promise<ScoreLoadResult> {
    return unwrap(await this.api.score.load(path));
  }

  async listDevices(): Promise<AudioDevice[]> {
    return unwrap(await this.api.audio.listDevices()).devices;
  }

  async startSession(scoreId: string, source: AudioSourceConfig, range?: Range): Promise<{ sessionId: string; range: Range }> {
    const result = unwrap(await this.api.session.start({ scoreId, source, ...(range ? { range } : {}) }));
    return { sessionId: result.sessionId, range: result.range };
  }

  async stopSession(sessionId: string): Promise<boolean> {
    return unwrap(await this.api.session.stop(sessionId)).accepted;
  }

  async getSessionState(): Promise<SessionSnapshot> {
    return unwrap(await this.api.session.getState());
  }

  chooseScoreFile(): Promise<string | null> {
    return this.api.dialogs.openScoreFile();
  }

  chooseWavFile(): Promise<string | null> {
    return this.api.dialogs.openWavFile();
  }

  getBackendStatus(): Promise<BackendStatus> {
    return this.api.backend.getStatus();
  }

  onEvent(listener: (event: BackendEvent) => void): () => void {
    return this.api.backend.onEvent(listener);
  }
}

function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.value;
  throw new BackendCallError(result.error.code, result.error.message);
}
