import type { AppController } from '../controllers/AppController';
import { PerformanceCursor } from '../score/PerformanceCursor';
import { RangeSelection } from '../score/RangeSelection';
import { ScoreViewAdapter } from '../score/ScoreViewAdapter';
import { effectiveRange, isSessionActive, type AppState } from '../state/AppState';
import type { Store } from '../state/Store';
import { el, setVisible } from '../util/dom';

export class ScorePanelView {
  readonly element: HTMLElement;

  private readonly adapter: ScoreViewAdapter;
  private readonly cursor: PerformanceCursor;
  private readonly rangeSelection: RangeSelection;
  private readonly placeholder: HTMLElement;
  private renderedScoreId: string | null = null;

  constructor(store: Store<AppState>, controller: AppController) {
    const scroller = el('div', { className: 'score-scroller' });
    this.placeholder = el(
      'div',
      { className: 'score-placeholder' },
      el('div', { className: 'placeholder-staff' }),
      el('div', { className: 'placeholder-title' }, 'Open a score to begin'),
      el('div', { className: 'placeholder-text' }, 'Uncompressed MusicXML (.musicxml or .xml)'),
      el('button', { className: 'button strong', onclick: () => void controller.openScore() }, 'Open score…'),
    );
    this.element = el('main', { className: 'score-panel' }, scroller, this.placeholder);

    this.adapter = new ScoreViewAdapter(scroller);
    this.cursor = new PerformanceCursor(this.adapter);
    this.rangeSelection = new RangeSelection(this.adapter, (boundary, index) => controller.pickRangeBoundary(boundary, index));

    store.subscribe((state, previous) => this.render(state, previous, controller));
  }

  private render(state: AppState, previous: AppState, controller: AppController): void {
    setVisible(this.placeholder, state.score === null);

    const score = state.score;
    if (!score && this.renderedScoreId !== null) {
      this.adapter.clear();
      this.renderedScoreId = null;
    }
    if (score && state.scoreView === 'rendering' && score.scoreId !== this.renderedScoreId) {
      this.renderedScoreId = score.scoreId;
      this.adapter
        .load(score.musicXml, score.events)
        .then((outcome) => controller.onScoreRendered(score.scoreId, outcome))
        .catch((error: unknown) => controller.onScoreRenderFailed(score.scoreId, error));
    }

    this.rangeSelection.render({
      range: state.scoreView === 'ready' ? effectiveRange(state) : null,
      isWholePiece: state.range === null,
      lastIndex: (state.score?.events.length ?? 1) - 1,
      enabled: state.scoreView === 'ready' && !isSessionActive(state),
    });

    if (state.position !== previous.position || state.scoreView !== previous.scoreView) {
      const index = state.scoreView === 'ready' ? (state.position?.eventIndex ?? null) : null;
      this.cursor.show(index, state.position?.status);
      if (index !== null && state.autoScroll && state.position !== previous.position) {
        this.adapter.scrollIntoView(index);
      }
    }
    if (state.session.state === 'preparing' && previous.session.state !== 'preparing' && state.autoScroll) {
      const range = effectiveRange(state);
      if (range) this.adapter.scrollIntoView(range.start);
    }
  }
}
