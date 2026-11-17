import type { ScoreEvent } from '../../../shared/protocol';

export function formatEventPosition(event: ScoreEvent | undefined, short = false): string {
  if (!event) return '—';
  const measure = event.measureIndex + 1;
  const beat = formatNumber(event.offsetInMeasureQ + 1);
  return short ? `m. ${measure}, beat ${beat}` : `Measure ${measure}, beat ${beat}`;
}

export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour12: false });
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
