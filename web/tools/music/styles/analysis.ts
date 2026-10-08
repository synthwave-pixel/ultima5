/**
 * analysis.ts (an experiment: tools/music/styles)
 *
 * What a style needs of a tune that its file does not say: its beat (XMI
 * keeps time in ticks, not bars - found here from the rhythm of its note
 * starts) and what each channel is to it - the melody, the bass, or the
 * harmony between - found from each part's range and how many notes it
 * sounds at once.
 */

import type { Note } from '../../../src/audio/remaster.ts';

export type Role = 'melody' | 'bass' | 'harmony' | 'percussion';

/** Programs that are struck or swept, not sung: timpani, the reverse cymbal. Never the bass or the melody. */
const STRUCK = [47, 119];

/** A tune's grid: the beat's length (seconds) and where the first beat falls. */
export interface Grid {
  beat: number;
  first: number;
}

/**
 * The beat, from the note starts: the lag (0.3 to 1.2 seconds) at which the starts most repeat themselves, the lags
 * of a moderate tempo (80 to 140 a minute) favoured, as a musician hearing the tune would count it.
 */
export function findGrid(notes: Note[]): Grid {
  const bin = 0.01;
  const starts = [...new Set(notes.map((n) => Math.round(n.start / bin)))];
  const last = Math.max(...starts);
  const train = new Float32Array(last + 1);
  for (const s of starts) train[s] = 1;
  let best = 50;
  let bestScore = -1;
  for (let lag = 30; lag <= 120; lag++) {
    let score = 0;
    for (let i = 0; i + lag < train.length; i++) if (train[i]) score += train[i + lag] + 0.5 * (train[i + lag - 1] + train[i + lag + 1]);
    const bpm = 60 / (lag * bin);
    score *= bpm >= 80 && bpm <= 140 ? 1.25 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  return { beat: best * bin, first: Math.min(...notes.map((n) => n.start)) };
}

/** Each channel's role: the lowest-sounding part the bass, the highest single line the melody, the rest harmony. */
export function findRoles(notes: Note[]): Map<number, Role> {
  const stats = new Map<number, { pitch: number; count: number; overlap: number }>();
  const byChannel = new Map<number, Note[]>();
  const roles = new Map<number, Role>();
  for (const n of notes) {
    if (STRUCK.includes(n.program)) roles.set(n.channel, 'percussion');
    else byChannel.set(n.channel, [...(byChannel.get(n.channel) ?? []), n]);
  }
  for (const [ch, ns] of byChannel) {
    let overlap = 0;
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length && ns[j].start < ns[i].end; j++) overlap++;
    stats.set(ch, { pitch: ns.reduce((a, n) => a + n.note, 0) / ns.length, count: ns.length, overlap: overlap / ns.length });
  }
  const channels = [...stats.keys()];
  if (channels.length === 0) return roles;
  const bass = channels.reduce((a, b) => (stats.get(a)!.pitch <= stats.get(b)!.pitch ? a : b));
  if (stats.get(bass)!.pitch < 58) roles.set(bass, 'bass');
  const lines = channels.filter((c) => !roles.has(c) && stats.get(c)!.overlap < 0.5 && stats.get(c)!.count >= 16);
  const melody = (lines.length ? lines : channels.filter((c) => !roles.has(c))).reduce(
    (a, b) => (stats.get(a)!.pitch >= stats.get(b)!.pitch ? a : b),
    channels.find((c) => !roles.has(c)) ?? bass,
  );
  if (!roles.has(melody)) roles.set(melody, 'melody');
  for (const c of channels) if (!roles.has(c)) roles.set(c, 'harmony');
  return roles;
}
