import { describe, expect, it } from 'vitest';
import { createInitialState, effectiveRange, startBlockedReason, type AppState } from '../src/renderer/src/state/AppState';

function readyState(): AppState {
  const state = createInitialState();
  return {
    ...state,
    backend: { state: 'running', name: 'test' },
    score: {
      scoreId: 'score-1',
      fileName: 'a.musicxml',
      filePath: '/a.musicxml',
      partId: 'P1',
      musicXml: '',
      warnings: [],
      events: [0, 1, 2].map((i) => ({ index: i, pitches: [60], onsetQ: i, measureIndex: 0, offsetInMeasureQ: i, noteRefs: [] })),
    },
    scoreView: 'ready',
    session: { ...state.session, state: 'ready' },
    source: { ...state.source, deviceId: 0 },
  };
}

describe('AppState selectors', () => {
  it('allows Start only when everything is ready', () => {
    expect(startBlockedReason(readyState())).toBeNull();
    expect(startBlockedReason({ ...readyState(), scoreView: 'rendering' })).not.toBeNull();
    expect(startBlockedReason({ ...readyState(), source: { ...readyState().source, kind: 'wav', wavPath: null } })).toMatch(/WAV/);
    expect(startBlockedReason({ ...createInitialState() })).toMatch(/backend/i);
  });

  it('uses the whole piece when no range is selected', () => {
    expect(effectiveRange(readyState())).toEqual({ start: 0, end: 2 });
    expect(effectiveRange({ ...readyState(), range: { start: 1, end: 1 } })).toEqual({ start: 1, end: 1 });
  });
});
