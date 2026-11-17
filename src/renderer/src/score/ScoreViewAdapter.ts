import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { Emitter } from "../../../shared/Emitter";
import type { ScoreEvent } from "../../../shared/protocol";

export interface EventBox {
  x: number;
  top: number;
  height: number;
}

export interface RenderOutcome {
  unmappedEvents: number[];
}

interface OsmdIterator {
  EndReached: boolean;
  CurrentMeasureIndex: number;
  CurrentSourceTimestamp: { RealValue: number };
  CurrentRelativeInMeasureTimestamp?: { RealValue: number };
}

const TICKS_PER_QUARTER = 960;
const MAX_CURSOR_STEPS = 200_000;

export class ScoreViewAdapter {
  readonly stage: HTMLDivElement;
  readonly overlay: HTMLDivElement;

  private readonly osmdHost: HTMLDivElement;
  private osmd: OpenSheetMusicDisplay | null = null;
  private events: readonly ScoreEvent[] = [];
  private boxes: (EventBox | undefined)[] = [];
  private lastWidth = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly emitter = new Emitter<{ layoutChanged: void }>();

  constructor(private readonly scrollContainer: HTMLElement) {
    this.stage = document.createElement("div");
    this.stage.className = "score-stage";
    this.osmdHost = document.createElement("div");
    this.osmdHost.className = "score-osmd-host";
    this.overlay = document.createElement("div");
    this.overlay.className = "score-overlay";
    this.stage.append(this.osmdHost, this.overlay);
    scrollContainer.append(this.stage);

    new ResizeObserver(() => this.scheduleRelayout()).observe(scrollContainer);
  }

  onLayoutChanged(listener: () => void): () => void {
    return this.emitter.on("layoutChanged", listener);
  }

  get hasScore(): boolean {
    return this.osmd !== null;
  }

  async load(
    musicXml: string,
    events: readonly ScoreEvent[],
  ): Promise<RenderOutcome> {
    this.clear();
    this.osmd = new OpenSheetMusicDisplay(this.osmdHost, {
      backend: "svg",
      autoResize: false,
      drawTitle: true,
      drawPartNames: false,
      followCursor: false,
    });
    this.events = events;
    await this.osmd.load(musicXml);
    return this.renderAndMap();
  }

  clear(): void {
    this.osmd?.clear();
    this.osmd = null;
    this.osmdHost.replaceChildren();
    this.events = [];
    this.boxes = [];
  }

  boxOf(eventIndex: number): EventBox | undefined {
    return this.boxes[eventIndex];
  }

  nearestEvent(x: number, y: number): number | null {
    let best: number | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    this.boxes.forEach((box, index) => {
      if (!box) return;
      const dy =
        y < box.top
          ? box.top - y
          : y > box.top + box.height
            ? y - (box.top + box.height)
            : 0;
      const score = dy * 10_000 + Math.abs(x - box.x);
      if (score < bestScore) {
        bestScore = score;
        best = index;
      }
    });
    return best;
  }

  scrollIntoView(eventIndex: number): void {
    const box = this.boxes[eventIndex];
    if (!box) return;
    const container = this.scrollContainer;
    const top = box.top + this.stage.offsetTop;
    const margin = 24;
    const visibleTop = container.scrollTop + margin;
    const visibleBottom = container.scrollTop + container.clientHeight - margin;
    if (top < visibleTop || top + box.height > visibleBottom) {
      container.scrollTo({
        top: Math.max(0, top - container.clientHeight / 3),
        behavior: "smooth",
      });
    }
  }

  private scheduleRelayout(): void {
    const width = this.scrollContainer.clientWidth;
    if (!this.osmd || Math.abs(width - this.lastWidth) < 2) return;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      if (!this.osmd) return;
      try {
        this.renderAndMap();
      } catch (error) {
        console.error("Score re-layout failed", error);
      }
    }, 200);
  }

  private renderAndMap(): RenderOutcome {
    const osmd = this.osmd!;
    this.lastWidth = this.scrollContainer.clientWidth;
    osmd.render();

    const positions = new Map<string, EventBox>();
    const cursor = osmd.cursor;
    cursor.show();
    cursor.reset();
    const iterator = cursor.iterator as unknown as OsmdIterator;

    for (
      let step = 0;
      !iterator.EndReached && step < MAX_CURSOR_STEPS;
      step++
    ) {
      const measureIndex = iterator.CurrentMeasureIndex;
      const offsetWhole =
        iterator.CurrentRelativeInMeasureTimestamp?.RealValue ??
        iterator.CurrentSourceTimestamp.RealValue -
          (osmd.Sheet.SourceMeasures[measureIndex]?.AbsoluteTimestamp
            .RealValue ?? 0);
      const key = positionKey(measureIndex, offsetWhole * 4);

      if (!positions.has(key)) {
        const element = cursor.cursorElement;
        positions.set(key, {
          x: parseFloat(element.style.left) || 0,
          top: parseFloat(element.style.top) || 0,
          height: parseFloat(element.style.height) || element.clientHeight || 0,
        });
      }
      cursor.next();
    }
    cursor.hide();

    const unmappedEvents: number[] = [];
    this.boxes = this.events.map((event) => {
      const box = positions.get(
        positionKey(event.measureIndex, event.offsetInMeasureQ),
      );
      if (!box) unmappedEvents.push(event.index);
      return box;
    });

    this.emitter.emit("layoutChanged", undefined);
    return { unmappedEvents };
  }
}

function positionKey(measureIndex: number, offsetQuarters: number): string {
  return `${measureIndex}:${Math.round(offsetQuarters * TICKS_PER_QUARTER)}`;
}
