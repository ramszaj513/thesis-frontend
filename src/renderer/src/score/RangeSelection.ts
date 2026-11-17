import type { Range } from '../../../shared/protocol';
import type { ScoreViewAdapter } from './ScoreViewAdapter';

type Boundary = 'start' | 'end';

export interface RangeSelectionView {
  range: Range | null;
  isWholePiece: boolean;
  lastIndex: number;
  enabled: boolean;
}

export class RangeSelection {
  private readonly markers: Record<Boundary, HTMLDivElement>;
  private view: RangeSelectionView = { range: null, isWholePiece: true, lastIndex: 0, enabled: false };
  private drag: { boundary: Boundary; eventIndex: number } | null = null;

  constructor(
    private readonly adapter: ScoreViewAdapter,
    private readonly onPick: (boundary: Boundary, eventIndex: number) => void,
  ) {
    this.markers = { start: this.createMarker('start', 'Start'), end: this.createMarker('end', 'End') };
    adapter.onLayoutChanged(() => this.draw());

    adapter.stage.addEventListener('click', (event) => {
      const { range, enabled } = this.view;
      if (!enabled || !range) return;
      const index = this.eventAt(event);
      if (index === null) return;
      this.onPick(this.boundaryFor(index, range), index);
    });
  }

  render(view: RangeSelectionView): void {
    this.view = view;
    this.adapter.stage.classList.toggle('selectable', view.enabled && view.range !== null);
    this.draw();
  }

  private createMarker(boundary: Boundary, label: string): HTMLDivElement {
    const marker = document.createElement('div');
    marker.className = `range-marker range-marker-${boundary}`;
    marker.hidden = true;
    const flag = document.createElement('span');
    flag.className = 'range-marker-flag';
    flag.textContent = label;
    marker.append(flag);
    this.adapter.overlay.append(marker);

    marker.addEventListener('pointerdown', (event) => {
      if (!this.view.enabled || !this.view.range) return;
      event.preventDefault();
      marker.setPointerCapture(event.pointerId);
      this.drag = { boundary, eventIndex: this.view.range[boundary] };
      marker.classList.add('dragging');
    });
    marker.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.boundary !== boundary) return;
      const index = this.eventAt(event);
      if (index !== null && index !== this.drag.eventIndex) {
        this.drag.eventIndex = index;
        this.draw();
      }
    });
    const finish = () => {
      if (!this.drag || this.drag.boundary !== boundary) return;
      const { eventIndex } = this.drag;
      this.drag = null;
      marker.classList.remove('dragging');
      this.onPick(boundary, eventIndex);
    };
    marker.addEventListener('pointerup', finish);
    marker.addEventListener('pointercancel', finish);
    return marker;
  }

  private boundaryFor(index: number, range: Range): Boundary {
    if (this.view.isWholePiece || index <= range.start) return 'start';
    if (index >= range.end || range.end === this.view.lastIndex) return 'end';
    return index - range.start <= range.end - index ? 'start' : 'end';
  }

  private eventAt(event: MouseEvent): number | null {
    const rect = this.adapter.stage.getBoundingClientRect();
    return this.adapter.nearestEvent(event.clientX - rect.left, event.clientY - rect.top);
  }

  private draw(): void {
    for (const boundary of ['start', 'end'] as const) {
      const marker = this.markers[boundary];
      const range = this.view.range;
      const index = this.drag?.boundary === boundary ? this.drag.eventIndex : range?.[boundary];
      const box = index === undefined ? undefined : this.adapter.boxOf(index);
      if (!box) {
        marker.hidden = true;
        continue;
      }
      marker.hidden = false;
      marker.classList.toggle('locked', !this.view.enabled);
      marker.style.height = `${box.height}px`;
      marker.style.transform = `translate(${box.x}px, ${box.top}px)`;
    }
  }
}
