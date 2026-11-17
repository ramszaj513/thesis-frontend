import type { AppController } from '../controllers/AppController';
import type { AppState } from '../state/AppState';
import type { Store } from '../state/Store';
import { el, setText, setVisible } from '../util/dom';

export class NoticeBannerView {
  readonly element: HTMLElement;

  private readonly message: HTMLSpanElement;

  constructor(store: Store<AppState>, controller: AppController) {
    this.message = el('span', { className: 'notice-message' });
    const close = el('button', { className: 'notice-close', title: 'Dismiss', onclick: () => controller.dismissNotice() }, '×');

    this.element = el('div', { className: 'notice', role: 'status' }, this.message, close);
    store.subscribe((state) => this.render(state));
  }

  private render(state: AppState): void {
    const notice = state.notice;
    setVisible(this.element, notice !== null);
    if (!notice) return;
    this.element.dataset['kind'] = notice.kind;
    setText(this.message, notice.message);
  }
}
