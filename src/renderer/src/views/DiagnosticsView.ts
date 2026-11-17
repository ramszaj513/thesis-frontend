import type { AppState, LogEntry } from '../state/AppState';
import type { Store } from '../state/Store';
import { el, setVisible } from '../util/dom';
import { formatTime } from '../util/format';

export class DiagnosticsView {
  readonly element: HTMLElement;

  private readonly list: HTMLElement;
  private renderedLogs: readonly LogEntry[] = [];

  constructor(store: Store<AppState>) {
    this.list = el('div', { className: 'log-list mono' });
    this.element = el('section', { className: 'diagnostics' }, this.list);
    store.subscribe((state) => this.render(state));
  }

  private render(state: AppState): void {
    setVisible(this.element, state.diagnosticsOpen);
    if (!state.diagnosticsOpen || state.logs === this.renderedLogs) return;
    this.renderedLogs = state.logs;

    const stickToBottom = this.list.scrollTop + this.list.clientHeight >= this.list.scrollHeight - 4;
    this.list.replaceChildren(
      ...state.logs.map((entry) =>
        el(
          'div',
          { className: `log-entry log-${entry.source}` },
          el('span', { className: 'log-time' }, formatTime(entry.time)),
          el('span', { className: 'log-source' }, entry.source),
          el('span', { className: 'log-message' }, entry.message),
        ),
      ),
    );
    if (stickToBottom) this.list.scrollTop = this.list.scrollHeight;
  }
}
