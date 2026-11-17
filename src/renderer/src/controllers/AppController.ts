import type { BackendEvent, BackendStatus } from "../../../shared/ipc";
import type {
  SessionStateChanged,
  TrackingPosition,
} from "../../../shared/protocol";
import type { RenderOutcome } from "../score/ScoreViewAdapter";
import {
  BackendCallError,
  type BackendService,
} from "../services/BackendService";
import {
  MAX_LOG_ENTRIES,
  sourceConfig,
  startBlockedReason,
  type AppState,
  type LogEntry,
  type Notice,
  type SourceKind,
} from "../state/AppState";
import type { Store } from "../state/Store";
import { fileNameOf, formatEventPosition } from "../util/format";

const REQUIRE_COMPLETE_EVENT_MAP = true;

export class AppController {
  private startInFlight = false;
  private queuedSessionEvents: BackendEvent[] = [];

  constructor(
    private readonly store: Store<AppState>,
    private readonly backend: BackendService,
  ) {}

  async initialize(): Promise<void> {
    this.backend.onEvent((event) => this.handleBackendEvent(event));
    const status = await this.backend.getBackendStatus();
    this.applyBackendStatus(status);
    this.log("app", "UI initialised");
  }

  async openScore(): Promise<void> {
    const path = await this.backend.chooseScoreFile();
    if (path) await this.loadScore(path);
  }

  async loadScore(path: string): Promise<void> {
    this.store.update({
      busyMessage: `Loading ${fileNameOf(path)}…`,
      notice: null,
    });
    try {
      const result = await this.backend.loadScore(path);
      this.log(
        "app",
        `Imported ${result.fileName}: ${result.events.length} events (${result.scoreId})`,
      );
      this.store.update({
        score: {
          scoreId: result.scoreId,
          fileName: result.fileName,
          filePath: path,
          partId: result.partId,
          musicXml: result.musicXml,
          events: result.events,
          warnings: result.warnings,
        },
        scoreView: "rendering",
        range: null,
        position: null,
        session: {
          state: "ready",
          sessionId: null,
          trackingStartedAtMs: null,
          lastStopReason: null,
        },
        busyMessage: "Rendering score…",
        notice:
          result.warnings.length > 0
            ? { kind: "warning", message: result.warnings.join(" ") }
            : null,
      });
    } catch (error) {
      this.store.update({ busyMessage: null });
      this.showError(`Could not load the score: ${errorText(error)}`);
    }
  }

  onScoreRendered(scoreId: string, outcome: RenderOutcome): void {
    if (this.store.get().score?.scoreId !== scoreId) return;
    const missing = outcome.unmappedEvents.length;
    if (missing > 0) {
      this.log(
        "app",
        `${missing} score event(s) not found in the rendered score: ${outcome.unmappedEvents.slice(0, 20).join(", ")}`,
      );
    }
    if (missing > 0 && REQUIRE_COMPLETE_EVENT_MAP) {
      this.store.update({ scoreView: "failed", busyMessage: null });
      this.showError(
        `The score was drawn, but ${missing} event(s) could not be located in it, so tracking cannot be shown.`,
      );
      return;
    }
    this.store.update({ scoreView: "ready", busyMessage: null });
  }

  onScoreRenderFailed(scoreId: string, error: unknown): void {
    if (this.store.get().score?.scoreId !== scoreId) return;
    this.store.update({ scoreView: "failed", busyMessage: null });
    this.showError(`The score could not be displayed: ${errorText(error)}`);
  }

  pickRangeBoundary(boundary: "start" | "end", eventIndex: number): void {
    const state = this.store.get();
    if (!state.score) return;
    const current = state.range ?? {
      start: 0,
      end: state.score.events.length - 1,
    };
    const range =
      boundary === "start"
        ? { start: eventIndex, end: Math.max(current.end, eventIndex) }
        : { start: Math.min(current.start, eventIndex), end: eventIndex };
    const isWholePiece =
      range.start === 0 && range.end === state.score.events.length - 1;
    this.store.update({ range: isWholePiece ? null : range });
  }

  resetRangeToWholePiece(): void {
    this.store.update({ range: null });
  }

  setSourceKind(kind: SourceKind): void {
    this.store.update((s) => ({ source: { ...s.source, kind } }));
  }

  setInputDevice(deviceId: number): void {
    this.store.update((s) => ({ source: { ...s.source, deviceId } }));
  }

  async chooseWavFile(): Promise<void> {
    const path = await this.backend.chooseWavFile();
    if (path)
      this.store.update((s) => ({ source: { ...s.source, wavPath: path } }));
  }

  setWavStartOffset(seconds: number): void {
    const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    this.store.update((s) => ({
      source: { ...s.source, wavStartOffsetSec: value },
    }));
  }

  async refreshDevices(): Promise<void> {
    try {
      const devices = await this.backend.listDevices();
      this.store.update((s) => {
        const stillThere = devices.some((d) => d.id === s.source.deviceId);
        const fallback = devices.find((d) => d.isDefault) ?? devices[0];
        return {
          devices,
          source: {
            ...s.source,
            deviceId: stillThere ? s.source.deviceId : (fallback?.id ?? null),
          },
        };
      });
    } catch (error) {
      this.showError(`Could not list audio devices: ${errorText(error)}`);
    }
  }

  async start(): Promise<void> {
    const state = this.store.get();
    const blocked = startBlockedReason(state);
    if (blocked || !state.score) {
      if (blocked) this.showError(blocked);
      return;
    }
    const source = sourceConfig(state)!;

    this.startInFlight = true;
    this.store.update({ notice: null, position: null });
    try {
      const { sessionId, range } = await this.backend.startSession(
        state.score.scoreId,
        source,
        state.range ?? undefined,
      );
      this.log(
        "app",
        `Session ${sessionId} started (events ${range.start}–${range.end}, ${source.kind})`,
      );
      this.store.update({
        session: {
          state: "preparing",
          sessionId,
          trackingStartedAtMs: null,
          lastStopReason: null,
        },
      });
    } catch (error) {
      this.showError(`Could not start: ${errorText(error)}`);
      if (
        error instanceof BackendCallError &&
        error.code === "staleScore"
      ) {
        this.store.update({
          session: { ...this.store.get().session, state: "noScore" },
        });
      }
    } finally {
      this.startInFlight = false;
      const queued = this.queuedSessionEvents;
      this.queuedSessionEvents = [];
      queued.forEach((event) => this.handleBackendEvent(event));
    }
  }

  async toggleSession(): Promise<void> {
    const { state } = this.store.get().session;
    if (state === "preparing" || state === "tracking") await this.stop();
    else if (state === "ready") await this.start();
  }

  async stop(): Promise<void> {
    const { sessionId } = this.store.get().session;
    if (!sessionId) return;
    try {
      const accepted = await this.backend.stopSession(sessionId);
      if (!accepted)
        this.log(
          "app",
          `Stop for ${sessionId} was not accepted (session already finished)`,
        );
    } catch (error) {
      this.showError(`Could not stop: ${errorText(error)}`);
    }
  }

  setAutoScroll(enabled: boolean): void {
    this.store.update({ autoScroll: enabled });
  }

  toggleDiagnostics(): void {
    this.store.update((s) => ({ diagnosticsOpen: !s.diagnosticsOpen }));
  }

  dismissNotice(): void {
    this.store.update({ notice: null });
  }

  private handleBackendEvent(event: BackendEvent): void {
    const isSessionEvent =
      event.method === "tracking.position" ||
      event.method === "session.stateChanged";
    if (isSessionEvent && this.startInFlight) {
      this.queuedSessionEvents.push(event);
      return;
    }

    switch (event.method) {
      case "tracking.position":
        this.handlePosition(event.params);
        break;
      case "session.stateChanged":
        this.handleStateChanged(event.params);
        break;
      case "backend.statusChanged":
        this.applyBackendStatus(event.params);
        break;
      case "backend.log":
        this.log("backend", event.params.line);
        break;
    }
  }

  private handlePosition(position: TrackingPosition): void {
    if (position.sessionId !== this.store.get().session.sessionId) return;
    this.store.update({ position });
  }

  private handleStateChanged(change: SessionStateChanged): void {
    const state = this.store.get();
    if (
      change.sessionId !== null &&
      change.sessionId !== state.session.sessionId
    )
      return;

    switch (change.state) {
      case "tracking":
        this.store.update((s) => ({
          session: {
            ...s.session,
            state: "tracking",
            trackingStartedAtMs: Date.now(),
          },
        }));
        break;
      case "stopping": {
        const reason = change.reason ?? null;
        this.store.update((s) => ({
          session: { ...s.session, state: "stopping", lastStopReason: reason },
          notice: reason ? this.noticeForStopReason(s, reason) : s.notice,
        }));
        break;
      }
      case "ready":
        this.store.update((s) => ({
          session: { ...s.session, state: "ready", sessionId: null },
        }));
        break;
      default:
        this.store.update((s) => ({
          session: { ...s.session, state: change.state },
        }));
    }
    this.log(
      "app",
      `Session state → ${change.state}${change.reason ? ` (${change.reason.code})` : ""}`,
    );
  }

  private noticeForStopReason(
    state: AppState,
    reason: NonNullable<SessionStateChanged["reason"]>,
  ): Notice | null {
    switch (reason.code) {
      case "rangeCompleted": {
        const last = state.position
          ? state.score?.events[state.position.eventIndex]
          : undefined;
        return {
          kind: "info",
          message: `Range completed (${formatEventPosition(last, true)}). Press Start to play it again.`,
        };
      }
      case "endOfFile":
        return { kind: "info", message: "End of the WAV recording reached." };
      case "error":
        return {
          kind: "error",
          message: `Session stopped because of an error: ${reason.message ?? "unknown error"}`,
        };
      default:
        return null;
    }
  }

  private applyBackendStatus(status: BackendStatus): void {
    const wasRunning = this.store.get().backend.state === "running";
    this.store.update({ backend: status });
    if (status.state === "running" && !wasRunning) void this.refreshDevices();
  }

  private showError(message: string): void {
    this.log("app", `Error: ${message}`);
    this.store.update({ notice: { kind: "error", message } });
  }

  private log(source: LogEntry["source"], message: string): void {
    this.store.update((s) => ({
      logs: [...s.logs, { time: Date.now(), source, message }].slice(
        -MAX_LOG_ENTRIES,
      ),
    }));
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
