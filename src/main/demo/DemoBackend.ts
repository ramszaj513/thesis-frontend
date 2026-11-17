import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Emitter } from '../../shared/Emitter';
import type { BackendEvent, BackendStatus } from '../../shared/ipc';
import type {
  BackendMethodName,
  MethodParams,
  MethodResult,
  Range,
  ScoreEvent,
  SessionStateName,
  StopReason,
  TrackingPosition,
} from '../../shared/protocol';
import type { Backend } from '../backend/Backend';
import { BackendError } from '../backend/BackendError';
import { extractScoreEvents } from './extractScoreEvents';

const DEMO_TEMPO_BPM = 80;
const LEAD_IN_MS = 1000;

type Handlers = { [M in BackendMethodName]: (params: MethodParams<M>) => MethodResult<M> | Promise<MethodResult<M>> };

interface DemoSession {
  id: string;
  range: Range;
  timers: ReturnType<typeof setTimeout>[];
}

export class DemoBackend implements Backend {
  private status: BackendStatus = { state: 'starting', name: 'demo' };
  private readonly emitter = new Emitter<{ event: BackendEvent }>();

  private state: SessionStateName = 'noScore';
  private score: { scoreId: string; events: ScoreEvent[] } | null = null;
  private session: DemoSession | null = null;
  private lastPosition: TrackingPosition | null = null;
  private lastStopReason: StopReason | null = null;
  private scoreCounter = 0;
  private sessionCounter = 0;

  async start(): Promise<BackendStatus> {
    this.setStatus({ state: 'running' });
    return this.getStatus();
  }

  async request<M extends BackendMethodName>(method: M, params: MethodParams<M>): Promise<MethodResult<M>> {
    const handler = this.handlers[method] as (params: MethodParams<M>) => MethodResult<M> | Promise<MethodResult<M>>;
    return handler(params);
  }

  async shutdown(): Promise<void> {
    this.cancelSession();
  }

  getStatus(): BackendStatus {
    return { ...this.status };
  }

  onEvent(listener: (event: BackendEvent) => void): () => void {
    return this.emitter.on('event', listener);
  }

  private readonly handlers: Handlers = {
    'score.load': async ({ path }) => {
      if (this.state !== 'noScore' && this.state !== 'ready') {
        throw new BackendError('invalidState', 'Stop the session before opening another score.');
      }
      const extension = extname(path).toLowerCase();
      if (extension !== '.musicxml' && extension !== '.xml') {
        throw new BackendError('scoreLoadFailed', 'Choose an uncompressed MusicXML file (.musicxml or .xml).');
      }

      let musicXml: string;
      let extracted: ReturnType<typeof extractScoreEvents>;
      try {
        musicXml = await readFile(path, 'utf8');
        extracted = extractScoreEvents(musicXml);
      } catch (error) {
        throw new BackendError('scoreLoadFailed', (error as Error).message);
      }

      this.scoreCounter++;
      this.score = { scoreId: `score-${this.scoreCounter}`, events: extracted.events };
      this.state = 'ready';
      this.lastPosition = null;
      this.lastStopReason = null;
      this.log(`Loaded ${basename(path)}: ${extracted.events.length} events`);

      return {
        scoreId: this.score.scoreId,
        contentHash: createHash('sha256').update(musicXml).digest('hex'),
        fileName: basename(path),
        partId: extracted.partId,
        musicXml,
        events: extracted.events,
        warnings: [],
      };
    },

    'audio.listDevices': () => ({
      devices: [{ id: 0, name: 'Default input', channels: 1, defaultSampleRate: 48_000, isDefault: true }],
    }),

    'session.start': async ({ scoreId, source, range }) => {
      if (!this.score || this.state !== 'ready') {
        throw new BackendError('invalidState', 'Open a score first, or wait for the current session to end.');
      }
      if (scoreId !== this.score.scoreId) {
        throw new BackendError('staleScore', 'The score changed. Open it again.');
      }
      if (source.kind === 'wav') {
        await access(source.path).catch(() => {
          throw new BackendError('audioSourceError', `Recording not found: ${source.path}`);
        });
      }

      const lastIndex = this.score.events.length - 1;
      const accepted = range ?? { start: 0, end: lastIndex };
      if (accepted.start < 0 || accepted.end > lastIndex || accepted.start > accepted.end) {
        throw new BackendError('invalidParams', 'The selected section is not valid.');
      }

      this.sessionCounter++;
      const session: DemoSession = { id: `session-${this.sessionCounter}`, range: accepted, timers: [] };
      this.session = session;
      this.state = 'preparing';
      this.lastPosition = null;
      this.lastStopReason = null;
      this.log(`${session.id}: demo playback of events ${accepted.start}–${accepted.end}`);

      session.timers.push(setTimeout(() => this.beginPlayback(session), 300));
      return { sessionId: session.id, state: 'preparing', range: accepted };
    },

    'session.stop': ({ sessionId }) => {
      if (!this.session || this.session.id !== sessionId) return { accepted: false };
      this.endSession({ code: 'userStop' });
      return { accepted: true };
    },

    'session.getState': () => ({
      state: this.state,
      scoreId: this.score?.scoreId ?? null,
      sessionId: this.session?.id ?? null,
      range: this.session?.range ?? null,
      lastPosition: this.lastPosition,
      lastStopReason: this.lastStopReason,
    }),
  };

  private beginPlayback(session: DemoSession): void {
    if (this.session !== session) return;
    this.setSessionState('tracking');

    const events = this.score!.events;
    const msPerQuarter = 60_000 / DEMO_TEMPO_BPM;
    const firstOnset = events[session.range.start]!.onsetQ;

    for (let index = session.range.start; index <= session.range.end; index++) {
      const delayMs = LEAD_IN_MS + (events[index]!.onsetQ - firstOnset) * msPerQuarter;
      session.timers.push(
        setTimeout(() => {
          if (this.session !== session) return;
          this.lastPosition = {
            sessionId: session.id,
            eventIndex: index,
            inputTimeSec: Math.round(delayMs) / 1000,
            matchQuality: 1,
            status: 'tracking',
          };
          this.emit({ method: 'tracking.position', params: this.lastPosition });
          if (index === session.range.end) this.endSession({ code: 'rangeCompleted' });
        }, delayMs),
      );
    }
  }

  private endSession(reason: StopReason): void {
    const session = this.session;
    if (!session) return;
    session.timers.forEach(clearTimeout);
    session.timers = [];
    this.lastStopReason = reason;
    this.setSessionState('stopping', reason);

    setTimeout(() => {
      if (this.session !== session) return;
      this.session = null;
      this.state = 'ready';
      this.emit({ method: 'session.stateChanged', params: { sessionId: session.id, state: 'ready' } });
    }, 150);
  }

  private cancelSession(): void {
    this.session?.timers.forEach(clearTimeout);
    this.session = null;
    if (this.state !== 'noScore') this.state = 'ready';
  }

  private setSessionState(state: SessionStateName, reason?: StopReason): void {
    this.state = state;
    this.emit({
      method: 'session.stateChanged',
      params: { sessionId: this.session?.id ?? null, state, ...(reason ? { reason } : {}) },
    });
  }

  private setStatus(patch: Partial<BackendStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit({ method: 'backend.statusChanged', params: this.getStatus() });
  }

  private emit(event: BackendEvent): void {
    this.emitter.emit('event', event);
  }

  private log(line: string): void {
    this.emit({ method: 'backend.log', params: { line: `[demo] ${line}` } });
  }
}
