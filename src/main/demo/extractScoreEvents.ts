import type { NoteRef, ScoreEvent } from '../../shared/protocol';

const TICKS_PER_QUARTER = 960;
const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface ExtractedScore {
  partId: string;
  events: ScoreEvent[];
}

export function extractScoreEvents(musicXml: string): ExtractedScore {
  if (!/<score-partwise\b/.test(musicXml)) {
    throw new Error('This is not a partwise MusicXML score.');
  }
  const part = /<part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/part>/.exec(musicXml);
  if (!part) throw new Error('The score does not contain any part.');
  const partId = part[1]!;

  const notesByTick = new Map<number, { measureIndex: number; offsetTicks: number; refs: NoteRef[] }>();
  let divisions = 1;
  let measureStart = 0;

  const measures = [...part[2]!.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)];
  measures.forEach((measure, measureIndex) => {
    let position = 0;
    let measureLength = 0;
    let lastOnset = 0;
    let chordIndex = 0;

    for (const element of measure[1]!.matchAll(/<(note|backup|forward|attributes)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const [, tag, body = ''] = element;
      const duration = Math.round((Number(text(body, 'duration') ?? 0) * TICKS_PER_QUARTER) / divisions) || 0;

      if (tag === 'attributes') {
        divisions = Number(text(body, 'divisions')) || divisions;
      } else if (tag === 'backup') {
        position = Math.max(0, position - duration);
      } else if (tag === 'forward') {
        position += duration;
        measureLength = Math.max(measureLength, position);
      } else if (!/<grace\b/.test(body)) {
        const isChordNote = /<chord\s*\/?>/.test(body);
        const onset = isChordNote ? lastOnset : position;
        chordIndex = isChordNote ? chordIndex + 1 : 0;
        if (!isChordNote) {
          lastOnset = position;
          position += duration;
          measureLength = Math.max(measureLength, position);
        }

        const pitch = midiPitch(body);
        const skip = pitch === null || /<rest\b/.test(body) || /<cue\b/.test(body) || /<tie\s+type="stop"/.test(body);
        if (!skip) {
          const tick = measureStart + onset;
          const entry = notesByTick.get(tick) ?? { measureIndex, offsetTicks: onset, refs: [] };
          entry.refs.push({
            partId,
            voice: Number(text(body, 'voice')) || 1,
            staff: Number(text(body, 'staff')) || 1,
            pitch: pitch!,
            chordIndex,
          });
          notesByTick.set(tick, entry);
        }
      }
    }
    measureStart += measureLength;
  });

  const events = [...notesByTick.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tick, entry], index) => ({
      index,
      pitches: [...new Set(entry.refs.map((ref) => ref.pitch))].sort((a, b) => a - b),
      onsetQ: tick / TICKS_PER_QUARTER,
      measureIndex: entry.measureIndex,
      offsetInMeasureQ: entry.offsetTicks / TICKS_PER_QUARTER,
      noteRefs: entry.refs,
    }));

  if (events.length === 0) throw new Error('The score does not contain any playable notes.');
  return { partId, events };
}

function text(xml: string, tag: string): string | undefined {
  return new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`).exec(xml)?.[1]?.trim();
}

function midiPitch(note: string): number | null {
  const step = STEP_SEMITONES[(text(note, 'step') ?? '').toUpperCase()];
  const octave = Number(text(note, 'octave'));
  if (step === undefined || !Number.isFinite(octave)) return null;
  const alter = Math.round(Number(text(note, 'alter') ?? 0)) || 0;
  return (octave + 1) * 12 + step + alter;
}
