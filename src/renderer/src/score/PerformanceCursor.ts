import type { TrackingStatus } from "../../../shared/protocol";
import type { ScoreViewAdapter } from "./ScoreViewAdapter";

export class PerformanceCursor {
  private readonly element: HTMLDivElement;
  private eventIndex: number | null = null;

  constructor(private readonly adapter: ScoreViewAdapter) {
    this.element = document.createElement("div");
    this.element.className = "performance-cursor";
    this.element.hidden = true;
    adapter.overlay.append(this.element);
    adapter.onLayoutChanged(() => this.reposition());
  }

  show(eventIndex: number | null, status: TrackingStatus | undefined): void {
    this.eventIndex = eventIndex;
    this.element.classList.toggle("uncertain", status === "uncertain");
    this.reposition();
  }

  private reposition(): void {
    const box =
      this.eventIndex === null
        ? undefined
        : this.adapter.boxOf(this.eventIndex);
    if (!box) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    this.element.style.height = `${box.height}px`;
    this.element.style.transform = `translate(${box.x}px, ${box.top}px)`;
  }
}
