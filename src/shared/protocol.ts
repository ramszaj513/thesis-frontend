export type SessionStateName = 'noScore' | 'ready' | 'preparing' | 'tracking' | 'stopping';

export type TrackingStatus = 'waiting' | 'tracking' | 'uncertain';

export interface NoteRef {
  partId: string;
  voice: number;
  staff: number;
// MIDI number
  pitch: number;
  chordIndex: number;
}

export interface ScoreEvent {
  index: number;
  pitches: number[];
// Quarter notes from the start
  onsetQ: number;
// 0-based; may differ from the printed measure number.
  measureIndex: number;
// Quarter notes from the start of the measure.
  offsetInMeasureQ: number;
  noteRefs: NoteRef[];
}

export interface Range {
  start: number;
  end: number;
}

export type AudioSourceConfig =
  | { kind: 'microphone'; deviceId: number }
  | { kind: 'wav'; path: string; startOffsetSec?: number };

export interface AudioDevice {
  id: number;
  name: string;
  channels: number;
  defaultSampleRate: number;
  isDefault: boolean;
}

export interface TrackingPosition {
  sessionId: string;
  eventIndex: number;
  inputTimeSec: number;
  matchQuality?: number;
  status?: TrackingStatus;
}

export type StopReasonCode = 'userStop' | 'rangeCompleted' | 'endOfFile' | 'error';

export interface StopReason {
  code: StopReasonCode;
  message?: string;
}

export interface SessionStateChanged {
  sessionId: string | null;
  state: SessionStateName;
  reason?: StopReason;
}

export interface ScoreLoadResult {
  scoreId: string;
  contentHash: string;
  fileName: string;
  partId: string;
  musicXml: string;
  events: ScoreEvent[];
  warnings: string[];
}

export interface SessionSnapshot {
  state: SessionStateName;
  scoreId: string | null;
  sessionId: string | null;
  range: Range | null;
  lastPosition: TrackingPosition | null;
  lastStopReason: StopReason | null;
}

export interface BackendMethods {
  'score.load': { params: { path: string }; result: ScoreLoadResult };
  'audio.listDevices': { params: Record<string, never>; result: { devices: AudioDevice[] } };
  'session.start': {
    params: { scoreId: string; source: AudioSourceConfig; range?: Range };
    result: { sessionId: string; state: 'preparing'; range: Range };
  };
  'session.stop': { params: { sessionId: string }; result: { accepted: boolean } };
  'session.getState': { params: Record<string, never>; result: SessionSnapshot };
}

export type BackendMethodName = keyof BackendMethods;
export type MethodParams<M extends BackendMethodName> = BackendMethods[M]['params'];
export type MethodResult<M extends BackendMethodName> = BackendMethods[M]['result'];

export const BACKEND_METHODS: readonly BackendMethodName[] = [
  'score.load',
  'audio.listDevices',
  'session.start',
  'session.stop',
  'session.getState',
];

export type BackendErrorCode =
  | 'unknownMethod'
  | 'invalidParams'
  | 'internal'
  | 'scoreLoadFailed'
  | 'invalidState'
  | 'staleScore'
  | 'audioSourceError';
