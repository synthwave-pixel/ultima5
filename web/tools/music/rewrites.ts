/**
 * rewrites.ts
 *
 * Tunes played otherwise than the Upgrade wrote them, in every version but
 * Original (which keeps to the Upgrade's notes).
 *
 * REUNION, as the Upgrade has it, is a held dominant chord, stately stabs of
 * one chord and a march stepping down beneath them: Mendelssohn's Wedding
 * March, to any ear. Here it is Lord British's own theme instead - MONARCH's
 * opening phrase (a climb from the tonic to its octave), turned from F minor
 * to F major - for the moment he is found: about as long, in the same key,
 * on the same trumpet, trombones and bass.
 */

import type { XmiEvent, XmiSequence } from '../../src/audio/xmi.ts';

/** A note by beat: where it starts, how many beats it holds, its pitch (MIDI). */
type Beat = [at: number, beats: number, note: number];

const BEAT = 0.42;
/** Where the first beat falls: a breath before the pickup. */
const FIRST = 0.3;

// prettier-ignore
const MELODY: Beat[] = [
  [0, 1, 60],                                                     // C, the pickup, as Monarch's
  [1, 3, 65], [4, 0.5, 67], [4.5, 0.5, 69],                       // F . . G A
  [5, 1, 70], [6, 1, 72], [7, 2, 69],                             // Bb C A
  [9, 0.5, 67], [9.5, 0.5, 69], [10, 1, 70], [11, 2, 74],         // G A Bb D
  [13, 3, 72], [16, 0.5, 70], [16.5, 0.5, 69],                    // C . . Bb A
  [17, 1, 67], [18, 1, 69], [19, 1, 70], [20, 1, 67],             // G A Bb G
  [21, 6, 65],                                                    // F
];

/** The chords beneath, each voiced below the melody: where, how long, its three upper notes and its bass. */
// prettier-ignore
const CHORDS: [at: number, beats: number, upper: [number, number, number], bass: number][] = [
  [1, 2, [53, 57, 60], 29],   // F
  [3, 2, [53, 57, 60], 33],   // F/A
  [5, 2, [58, 62, 65], 34],   // Bb
  [7, 2, [57, 60, 65], 36],   // F/C
  [9, 2, [58, 62, 65], 31],   // Gm7
  [11, 2, [58, 62, 65], 38],  // Bb/D
  [13, 3, [55, 60, 64], 36],  // C
  [16, 1, [58, 60, 64], 36],  // C7
  [17, 2, [58, 62, 65], 31],  // Gm7
  [19, 2, [58, 60, 64], 36],  // C7
  [21, 6, [48, 53, 57], 29],  // F
];

/** The tune's channels, as the Upgrade's REUNION has them: a trumpet's melody, three trombones, a bass. */
const TRUMPET = 1;
const TROMBONES = [2, 4, 6];
const BASS = 3;

/** A tune's events from its notes: in time order, an end before a start at the same moment. */
function sequence(programs: [channel: number, program: number][], notes: [channel: number, Beat, velocity: number][]): XmiSequence {
  const events: XmiEvent[] = programs.map(([channel, program]) => ({ time: 0, kind: 'program', channel, program }));
  for (const [channel, [at, beats, note], velocity] of notes) {
    const time = FIRST + at * BEAT;
    events.push({ time, kind: 'on', channel, note, velocity });
    events.push({ time: time + beats * BEAT, kind: 'off', channel, note });
  }
  const order = (e: XmiEvent): number => (e.kind === 'program' ? 0 : e.kind === 'off' ? 1 : 2);
  events.sort((a, b) => a.time - b.time || order(a) - order(b));
  return { events, length: events[events.length - 1].time };
}

function reunion(): XmiSequence {
  return sequence(
    [[TRUMPET, 56], ...TROMBONES.map((c): [number, number] => [c, 57]), [BASS, 35]],
    [
      ...MELODY.map((b): [number, Beat, number] => [TRUMPET, b, 100]),
      ...CHORDS.flatMap(([at, beats, upper, bass]): [number, Beat, number][] => [
        ...upper.map((note, i): [number, Beat, number] => [TROMBONES[i], [at, beats, note], 80]),
        [BASS, [at, beats, bass], 95],
      ]),
    ],
  );
}

const REWRITES: Record<string, () => XmiSequence> = { 'REUNION.XMI': reunion };

/** The tune `tune` as a version other than Original plays it: its rewrite, or the Upgrade's own notes. */
export function rewritten(tune: string, upgrade: XmiSequence): XmiSequence {
  return REWRITES[tune]?.() ?? upgrade;
}
