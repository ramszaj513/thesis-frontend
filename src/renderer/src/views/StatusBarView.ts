import type { SessionStateName } from '../../../shared/protocol';
import type { AppController } from '../controllers/AppController';
import { isSessionActive, type AppState } from '../state/AppState';
import type { Store } from '../state/Store';
import { el, setText, setVisible } from '../util/dom';
import { formatClock, formatEventPosition } from '../util/format';

const STATE_LABELS: Record<SessionStateName, string> = {
  noScore: 'No score',
  ready: 'Ready',
  preparing: 'Getting ready…',
  tracking: 'Following',
  stopping: 'Stopping…',
};

export class StatusBarView {
  readonly element: HTMLElement;

  private readonly stateIndicator: HTMLSpanElement;
  private readonly stateLabel: HTMLSpanElement;
  private readonly position: HTMLSpanElement;
  private readonly clock: HTMLSpanElement;
  private readonly sectionGroup: HTMLElement;
  private readonly section: HTMLSpanElement;
  private readonly resetSection: HTMLButtonElement;
  private readonly hint: HTMLSpanElement;
  private readonly autoScroll: HTMLInputElement;
  private readonly logButton: HTMLButtonElement;
  private readonly demoNote: HTMLSpanElement;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: Store<AppState>,
    controller: AppController,
  ) {
    this.stateLabel = el('span', {});
    this.stateIndicator = el('span', { className: 'state' }, el('span', { className: 'state-dot' }), this.stateLabel);
    this.position = el('span', { className: 'status-position' });
    this.clock = el('span', { className: 'clock muted' });

    this.section = el('span', {});
    this.resetSection = el(
      'button',
      { className: 'icon-button', title: 'Use the whole piece', onclick: () => controller.resetRangeToWholePiece() },
      '✕',
    );
    this.hint = el('span', { className: 'muted small' });

    this.autoScroll = el('input', { type: 'checkbox', onchange: () => controller.setAutoScroll(this.autoScroll.checked) });
    this.demoNote = el(
      'span',
      { className: 'demo-note small', title: 'No analysis backend connected: Start plays the section back at a fixed tempo.' },
      'Demo mode',
    );
    this.logButton = el('button', { className: 'link-button small', onclick: () => controller.toggleDiagnostics() }, 'Log');

    this.element = el(
      'div',
      { className: 'status-bar' },
      el('div', { className: 'group' }, this.stateIndicator, this.position, this.clock),
      (this.sectionGroup = el(
        'div',
        { className: 'group section' },
        el('span', { className: 'muted' }, 'Section:'),
        this.section,
        this.resetSection,
        this.hint,
      )),
      el(
        'div',
        { className: 'group push-right' },
        this.demoNote,
        el('label', { className: 'muted small check' }, this.autoScroll, 'Auto-scroll'),
        this.logButton,
      ),
    );

    store.subscribe((state) => this.render(state));
  }

  private render(state: AppState): void {
    setText(this.stateLabel, STATE_LABELS[state.session.state]);
    this.stateIndicator.dataset['state'] = state.session.state;

    const event = state.position ? state.score?.events[state.position.eventIndex] : undefined;
    const uncertain = state.position?.status === 'uncertain';
    const positionText = event ? formatEventPosition(event) + (uncertain ? ' (unsure)' : '') : '';
    setText(this.position, state.busyMessage ?? positionText);
    this.position.classList.toggle('warn', uncertain && !state.busyMessage);

    const events = state.score?.events ?? [];
    const scoreReady = state.scoreView === 'ready';
    let sectionText = '—';
    if (scoreReady) {
      sectionText = state.range
        ? `${formatEventPosition(events[state.range.start], true)} → ${formatEventPosition(events[state.range.end], true)}`
        : 'Whole piece';
    }
    setText(this.section, sectionText);
    setVisible(this.sectionGroup, state.score !== null);

    const editable = scoreReady && !isSessionActive(state);
    setVisible(this.resetSection, editable && state.range !== null);
    setVisible(this.hint, editable);
    let hint = 'click a note to start from there';
    if (state.range) hint = state.range.end === events.length - 1 ? 'click a note to set the end' : 'click or drag the markers to adjust';
    setText(this.hint, hint);

    setVisible(this.demoNote, state.backend.name === 'demo');
    this.autoScroll.checked = state.autoScroll;
    this.logButton.classList.toggle('active', state.diagnosticsOpen);
    this.logButton.title =
      state.backend.state === 'running' ? 'Technical log' : `Technical log (backend: ${state.backend.state})`;

    this.updateClockTimer(state);
  }

  private updateClockTimer(state: AppState): void {
    const running = state.session.state === 'tracking' && state.session.trackingStartedAtMs !== null;
    if (running && !this.clockTimer) {
      this.clockTimer = setInterval(() => this.updateClock(), 1000);
    } else if (!running && this.clockTimer) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
    this.updateClock();
  }

  private updateClock(): void {
    const { session, position } = this.store.get();
    if (session.state === 'tracking' && session.trackingStartedAtMs !== null) {
      setText(this.clock, formatClock((Date.now() - session.trackingStartedAtMs) / 1000));
    } else if (position === null && session.state !== 'preparing') {
      setText(this.clock, '');
    }
  }
}
