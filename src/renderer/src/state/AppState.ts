import type { BackendStatus } from '../../../shared/ipc';
import type {
  AudioDevice,
  AudioSourceConfig,
  Range,
  ScoreEvent,
  SessionStateName,
  StopReason,
  TrackingPosition,
} from '../../../shared/protocol';

export interface LoadedScore {
  scoreId: string;
  fileName: string;
  filePath: string;
  partId: string;
  musicXml: string;
  events: ScoreEvent[];
  warnings: string[];
}

export type ScoreViewStatus = 'empty' | 'rendering' | 'ready' | 'failed';

export type SourceKind = AudioSourceConfig['kind'];

export interface SourceSelection {
  kind: SourceKind;
  deviceId: number | null;
  wavPath: string | null;
  wavStartOffsetSec: number;
}

export interface SessionView {
  state: SessionStateName;
  sessionId: string | null;
  trackingStartedAtMs: number | null;
  lastStopReason: StopReason | null;
}

export type NoticeKind = 'error' | 'warning' | 'info';

export interface Notice {
  kind: NoticeKind;
  message: string;
}

export interface LogEntry {
  time: number;
  source: 'app' | 'backend';
  message: string;
}

export interface AppState {
  backend: BackendStatus;
  devices: AudioDevice[];
  score: LoadedScore | null;
  scoreView: ScoreViewStatus;
  /** null = whole piece. */
  range: Range | null;
  source: SourceSelection;
  session: SessionView;
  position: TrackingPosition | null;
  autoScroll: boolean;
  busyMessage: string | null;
  notice: Notice | null;
  logs: LogEntry[];
  diagnosticsOpen: boolean;
}

export const MAX_LOG_ENTRIES = 300;

export function createInitialState(): AppState {
  return {
    backend: { state: 'starting', name: '' },
    devices: [],
    score: null,
    scoreView: 'empty',
    range: null,
    source: { kind: 'microphone', deviceId: null, wavPath: null, wavStartOffsetSec: 0 },
    session: { state: 'noScore', sessionId: null, trackingStartedAtMs: null, lastStopReason: null },
    position: null,
    autoScroll: true,
    busyMessage: null,
    notice: null,
    logs: [],
    diagnosticsOpen: false,
  };
}

export function isSessionActive(state: AppState): boolean {
  return state.session.state === 'preparing' || state.session.state === 'tracking' || state.session.state === 'stopping';
}

export function effectiveRange(state: AppState): Range | null {
  if (state.range) return state.range;
  if (!state.score || state.score.events.length === 0) return null;
  return { start: 0, end: state.score.events.length - 1 };
}

export function sourceConfig(state: AppState): AudioSourceConfig | null {
  const { source } = state;
  if (source.kind === 'microphone') {
    return source.deviceId === null ? null : { kind: 'microphone', deviceId: source.deviceId };
  }
  return source.wavPath ? { kind: 'wav', path: source.wavPath, startOffsetSec: source.wavStartOffsetSec } : null;
}

export function startBlockedReason(state: AppState): string | null {
  if (state.backend.state !== 'running') return 'The backend is not running.';
  if (!state.score) return 'Open a MusicXML score first.';
  if (state.scoreView !== 'ready') return 'The score is not ready yet.';
  if (state.session.state !== 'ready') return isSessionActive(state) ? 'A session is already running.' : 'The backend is not ready.';
  if (!sourceConfig(state)) return state.source.kind === 'wav' ? 'Choose a WAV file.' : 'Choose an input device.';
  return null;
}

export function canStop(state: AppState): boolean {
  return (state.session.state === 'preparing' || state.session.state === 'tracking') && state.session.sessionId !== null;
}
