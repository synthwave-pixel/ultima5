/**
 * harmony.ts (an experiment: tools/music/styles)
 *
 * A tune understood as an arranger understands it, so that an arrangement
 * can write new parts rather than only re-voice the old: its key, its
 * chords beat by beat, its phrases and which of them repeat (its form),
 * and how much is happening where (an energy over the piece). And the
 * arranger's tools: chords voiced with smooth voice-leading, a
 * counter-melody, the melody harmonised in thirds within the key, bass
 * lines, ornaments, a little human looseness.
 */

import type { Note } from '../../../src/audio/remaster.ts';
import type { Grid, Role } from './analysis.ts';

/** A pitch class (0 = C). */
const pc = (note: number): number => ((note % 12) + 12) % 12;

// --- Key ----------------------------------------------------------------------------------------

/** Krumhansl-Kessler key profiles: how much each degree belongs to a major and a minor key. */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface Key {
  tonic: number;
  minor: boolean;
  /** Its scale's pitch classes, from the tonic (natural minor for a minor key). */
  scale: number[];
}

/** The key that best fits how long each pitch class sounds over the tune. */
export function findKey(notes: Note[]): Key {
  const weight = new Array<number>(12).fill(0);
  for (const n of notes) weight[pc(n.note)] += (n.end - n.start) * n.velocity;
  const corr = (profile: number[], tonic: number): number => {
    const xs = weight.map((_, i) => weight[(i + tonic) % 12]);
    const mx = xs.reduce((a, b) => a + b) / 12;
    const my = profile.reduce((a, b) => a + b) / 12;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < 12; i++) {
      num += (xs[i] - mx) * (profile[i] - my);
      dx += (xs[i] - mx) ** 2;
      dy += (profile[i] - my) ** 2;
    }
    return num / Math.sqrt(dx * dy || 1);
  };
  let best: Key = { tonic: 0, minor: false, scale: [] };
  let score = -Infinity;
  for (let t = 0; t < 12; t++)
    for (const minor of [false, true]) {
      const c = corr(minor ? MINOR : MAJOR, t);
      if (c > score) {
        score = c;
        best = { tonic: t, minor, scale: [] };
      }
    }
  const steps = best.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  best.scale = steps.map((s) => (best.tonic + s) % 12);
  return best;
}

/** `note` moved by `steps` degrees of `key`'s scale (a third below is -2), its octave kept as it goes. */
export function diatonic(note: number, steps: number, key: Key): number {
  // The nearest scale degree at or below the note, then counted along the scale.
  let n = note;
  while (!key.scale.includes(pc(n))) n--;
  let degree = key.scale.indexOf(pc(n));
  let octave = Math.floor(n / 12);
  degree += steps;
  octave += Math.floor(degree / 7);
  degree = ((degree % 7) + 7) % 7;
  let out = octave * 12 + key.scale[degree];
  // Keep it on the right side of where it began.
  if (steps < 0 && out >= note) out -= 12;
  if (steps > 0 && out <= note) out += 12;
  return out;
}

// --- Chords -------------------------------------------------------------------------------------

export interface Chord {
  start: number;
  end: number;
  root: number;
  /** Its pitch classes, the root first. */
  tones: number[];
  quality: string;
}

const SHAPES: [string, number[]][] = [
  ['maj', [0, 4, 7]],
  ['min', [0, 3, 7]],
  ['dim', [0, 3, 6]],
  ['sus4', [0, 5, 7]],
  ['7', [0, 4, 7, 10]],
  ['m7', [0, 3, 7, 10]],
  ['maj7', [0, 4, 7, 11]],
];

/**
 * The chord of each beat: the shape whose tones the notes sounding through it (weighted by how long and how loud) best
 * fill, and least leave out - the bass's note the likeliest root; a beat with nothing new keeps the chord before;
 * like chords running on are one.
 */
export function findChords(notes: Note[], roles: Map<number, Role>, grid: Grid, end: number): Chord[] {
  const pitched = notes.filter((n) => roles.get(n.channel) !== 'percussion');
  const chords: Chord[] = [];
  let last = null as Chord | null;
  for (let t = grid.first; t < end; t += grid.beat) {
    const until = t + grid.beat;
    const weight = new Array<number>(12).fill(0);
    let bassNote = -1;
    let bassLow = 999;
    for (const n of pitched) {
      const overlap = Math.min(n.end, until) - Math.max(n.start, t);
      if (overlap <= 0) continue;
      weight[pc(n.note)] += overlap * n.velocity * (roles.get(n.channel) === 'melody' ? 0.6 : 1);
      if (roles.get(n.channel) === 'bass' && n.note < bassLow) {
        bassLow = n.note;
        bassNote = pc(n.note);
      }
    }
    const total = weight.reduce((a, b) => a + b, 0);
    let chord: Chord | null = null;
    if (total > 0) {
      let best = -Infinity;
      for (let root = 0; root < 12; root++)
        for (const [quality, shape] of SHAPES) {
          const tones = shape.map((s) => (root + s) % 12);
          let score = 0;
          for (let p = 0; p < 12; p++) score += tones.includes(p) ? weight[p] : -0.6 * weight[p];
          if (root === bassNote) score += total * 0.25;
          if (shape.length === 4) score -= total * 0.08; // a seventh only where it is heard
          if (score > best) {
            best = score;
            chord = { start: t, end: until, root, tones, quality };
          }
        }
    }
    const next: Chord | null = chord ?? (last ? { ...last, start: t, end: until } : null);
    if (!next) continue;
    if (last && last.root === next.root && last.quality === next.quality) last.end = until;
    else {
      chords.push(next);
      last = next;
    }
  }
  return chords;
}

/** The chord sounding at `t`, or the nearest. */
export function chordAt(chords: Chord[], t: number): Chord {
  return chords.find((c) => c.start <= t + 1e-6 && c.end > t + 1e-6) ?? chords[chords.length - 1];
}

// --- Form ---------------------------------------------------------------------------------------

export interface Phrase {
  start: number;
  end: number;
  /** Its place in the tune, from 0. */
  index: number;
  /** A for the first material, B for the next new, and so on; a phrase like an earlier one shares its label. */
  label: string;
  /** How many times its label has been heard before it (0: the first statement). */
  repeat: number;
  /** How much is happening here, 0.35 to 1: rising through the tune, highest near its end. */
  energy: number;
  /** Whether it is the last of the tune. */
  last: boolean;
}

/**
 * The tune's phrases, four bars of four beats each, and its form: each phrase's melody (pitch classes on a sixteenth
 * grid) compared with those before it, alike when most of the grid agrees.
 */
export function findPhrases(melody: Note[], grid: Grid, end: number): Phrase[] {
  const len = grid.beat * 16;
  const sigs: string[][] = [];
  const phrases: Phrase[] = [];
  const count = Math.max(1, Math.round((end - grid.first) / len));
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const start = grid.first + i * len;
    const stop = i === count - 1 ? end : start + len;
    const sig = new Array<string>(64).fill('.');
    for (const n of melody) {
      if (n.start < start || n.start >= stop) continue;
      const slot = Math.floor(((n.start - start) / len) * 64);
      if (slot >= 0 && slot < 64) sig[slot] = String(pc(n.note));
    }
    let label = '';
    for (let j = 0; j < sigs.length; j++) {
      const agree = sig.filter((s, k) => s === sigs[j][k]).length / 64;
      if (agree > 0.7) {
        label = labels[j];
        break;
      }
    }
    if (!label) label = String.fromCharCode(65 + new Set(labels).size);
    labels.push(label);
    sigs.push(sig);
    phrases.push({
      start,
      end: stop,
      index: i,
      label,
      repeat: labels.slice(0, i).filter((l) => l === label).length,
      energy: 0,
      last: i === count - 1,
    });
  }
  // The arc: quiet to begin, building, highest in the last third, easing a little at the very end.
  for (const p of phrases) {
    const x = count === 1 ? 1 : p.index / (count - 1);
    p.energy = Math.max(0.35, Math.min(1, 0.4 + 0.75 * x - (x > 0.92 ? 0.15 : 0) + (p.repeat > 0 ? 0.08 : 0)));
  }
  return phrases;
}

/** The phrase at `t`. */
export function phraseAt(phrases: Phrase[], t: number): Phrase {
  return phrases.find((p) => p.start <= t + 1e-6 && p.end > t + 1e-6) ?? phrases[phrases.length - 1];
}

// --- Writing parts ------------------------------------------------------------------------------

/**
 * A chord voiced in `voices` notes within [low, high], each as near the voice before as it can be (smooth
 * voice-leading): every tone of the chord used once before any is doubled.
 */
export function voice(chord: Chord, low: number, high: number, voices: number, previous: number[] | null): number[] {
  const candidates: number[][] = [];
  const tones = chord.tones;
  const want = Array.from({ length: voices }, (_, i) => tones[i % tones.length]);
  // Every placing of each wanted tone in range, searched for the arrangement nearest the last voicing.
  const placings = want.map((p) => {
    const out: number[] = [];
    for (let n = low; n <= high; n++) if (pc(n) === p) out.push(n);
    return out;
  });
  const walk = (i: number, acc: number[]): void => {
    if (candidates.length > 4000) return;
    if (i === placings.length) {
      candidates.push([...acc].sort((a, b) => a - b));
      return;
    }
    for (const n of placings[i]) if (!acc.includes(n)) walk(i + 1, [...acc, n]);
  };
  walk(0, []);
  // Too few places in range for every voice: the chord's tones once each, wherever they fit.
  if (!candidates.length)
    return [...new Set(tones.map((p) => low + ((p - pc(low) + 12) % 12)))].filter((n) => n <= high).sort((a, b) => a - b);
  const spread = (v: number[]): number => v[v.length - 1] - v[0];
  const cost = (v: number[]): number =>
    previous && previous.length === v.length ? v.reduce((a, n, i) => a + Math.abs(n - previous[i]), 0) : Math.abs(spread(v) - 9);
  return candidates.reduce((a, b) => (cost(b) < cost(a) || (cost(b) === cost(a) && spread(b) < spread(a)) ? b : a));
}

/**
 * A counter-melody against `melody`, in [low, high]: through each chord it holds a chord tone where the melody is
 * busy, and steps through the scale toward the next chord's tone where the melody holds; moving against the
 * melody where it can, never on the melody's own note.
 */
export function counterMelody(melody: Note[], chords: Chord[], key: Key, grid: Grid, low: number, high: number): Note[] {
  const out: Note[] = [];
  let prev = Math.round((low + high) / 2);
  const melodyAt = (t: number): Note | undefined => melody.find((n) => n.start <= t + 1e-3 && n.end > t + 1e-3);
  for (const c of chords) {
    const onsets = melody.filter((n) => n.start >= c.start && n.start < c.end).length;
    const beats = Math.max(1, Math.round((c.end - c.start) / grid.beat));
    const nearestTone = (target: number, avoid?: number): number => {
      let best = target;
      let d = 99;
      for (let n = low; n <= high; n++) {
        if (!c.tones.includes(pc(n)) || (avoid !== undefined && pc(n) === pc(avoid))) continue;
        if (Math.abs(n - target) < d) {
          d = Math.abs(n - target);
          best = n;
        }
      }
      return best;
    };
    const m0 = melodyAt(c.start);
    const mBefore = melodyAt(c.start - grid.beat);
    // Against the melody: where it rose, the counter-line falls a step's worth, and the other way.
    const contrary = m0 && mBefore ? Math.sign(mBefore.note - m0.note) * 2 : 0;
    const first = nearestTone(prev + contrary, m0?.note);
    if (onsets > beats || beats === 1) {
      out.push({ channel: 0, program: 0, note: first, velocity: 80, start: c.start, end: c.end });
      prev = first;
    } else {
      // The melody holds: the counter-line walks the scale a beat at a time toward the next chord.
      let n = first;
      for (let k = 0; k < beats; k++) {
        const t = c.start + k * grid.beat;
        const m = melodyAt(t);
        if (m && pc(m.note) === pc(n)) n = diatonic(n, -1, key);
        n = Math.max(low, Math.min(high, n));
        out.push({ channel: 0, program: 0, note: n, velocity: k === 0 ? 82 : 70, start: t, end: Math.min(c.end, t + grid.beat) });
        n = diatonic(n, contrary <= 0 ? 1 : -1, key);
      }
      prev = out[out.length - 1].note;
    }
  }
  return out;
}

/** `melody` a third below within the key - as a second voice sings along. */
export function inThirds(melody: Note[], key: Key): Note[] {
  return melody.map((n) => ({ ...n, note: diatonic(n.note, -2, key) }));
}

/**
 * A bass line on the chords: `style` 'root' (the root on each beat, the fifth on the off-beat in folk fashion),
 * 'walking' (four to the bar, chord tones and a chromatic step into the next root), 'pulse' (the root in eighths).
 */
export function bassLine(chords: Chord[], grid: Grid, style: 'root' | 'walking' | 'pulse', low = 36): Note[] {
  const out: Note[] = [];
  const at = (p: number): number => low + ((p - pc(low) + 12) % 12);
  chords.forEach((c, ci) => {
    const root = at(c.root);
    const fifth = at(c.tones[2] ?? c.root);
    const next = chords[ci + 1];
    if (style === 'pulse') {
      for (let t = c.start; t < c.end - 1e-3; t += grid.beat / 2)
        out.push({ channel: 0, program: 0, note: root, velocity: 90, start: t, end: t + grid.beat * 0.4 });
      return;
    }
    let k = 0;
    for (let t = c.start; t < c.end - 1e-3; t += grid.beat, k++) {
      let note: number;
      if (style === 'root') note = k % 2 === 0 ? root : fifth > root ? fifth - 12 : fifth;
      else {
        const lastBeat = t + grid.beat >= c.end - 1e-3;
        if (k === 0) note = root;
        else if (lastBeat && next)
          note = at(next.root) + (k % 2 ? 1 : -1); // a chromatic step into the next root
        else note = at(c.tones[k % c.tones.length]);
      }
      out.push({
        channel: 0,
        program: 0,
        note,
        velocity: k === 0 ? 95 : 80,
        start: t,
        end: t + grid.beat * (style === 'walking' ? 0.92 : 0.9),
      });
    }
  });
  return out;
}

/** A small, repeatable looseness: a note's time shifted a few milliseconds and its velocity a few steps. */
export function humanize(notes: Note[], seed: number, ms = 8, vel = 6): Note[] {
  let s = seed;
  const r = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  return notes.map((n) => {
    const dt = (r() * ms) / 1000;
    return {
      ...n,
      start: Math.max(0, n.start + dt),
      end: n.end + dt,
      velocity: Math.max(1, Math.min(127, n.velocity + Math.round(r() * vel))),
    };
  });
}

/**
 * Grace notes before the longer notes, as a fiddler's cut or a recorder's: a quick note a step above (`steps` degrees)
 * just before the note, every `every`th long note.
 */
export function graces(melody: Note[], key: Key, beat: number, every = 2, steps = 1): Note[] {
  const out: Note[] = [];
  let k = 0;
  for (const n of melody) {
    if (n.end - n.start < beat * 0.9) continue;
    if (k++ % every) continue;
    const g = Math.min(0.06, beat / 8);
    out.push({
      ...n,
      note: diatonic(n.note, steps, key),
      start: Math.max(0, n.start - g),
      end: n.start,
      velocity: Math.round(n.velocity * 0.7),
    });
  }
  return out;
}

/** A trill on the longest notes: the note and the next step above it alternating in sixteenths, then the note held. */
export function trill(n: Note, key: Key, beat: number): Note[] {
  const out: Note[] = [];
  const upper = diatonic(n.note, 1, key);
  const stop = n.start + Math.min(n.end - n.start, beat * 1.5) * 0.7;
  let k = 0;
  for (let t = n.start; t < stop; t += beat / 4, k++) out.push({ ...n, note: k % 2 ? upper : n.note, start: t, end: t + beat / 4.2 });
  out.push({ ...n, start: stop, end: n.end });
  return out;
}

/** Where a gentle tune's melody sits at most, on average: the D above middle C's octave. */
export const SETTLED = 74;
/** Where an ominous tune's melody sits at most, on average: the D below middle C's octave. */
export const LOW = 62;

/** `notes` an octave lower, and lower again, until their average sits at `ceiling` or below. */
export function settled(notes: Note[], ceiling = SETTLED): Note[] {
  if (!notes.length) return notes;
  const mean = notes.reduce((a, n) => a + n.note, 0) / notes.length;
  const down = 12 * Math.max(0, Math.ceil((mean - ceiling) / 12));
  return down ? notes.map((n) => ({ ...n, note: n.note - down })) : notes;
}

/** The pitch class the bass dwells on longest: the note a drone holds beneath the tune. */
export function pedalOf(bass: Note[]): number {
  const weight = new Array<number>(12).fill(0);
  for (const n of bass) weight[pc(n.note)] += n.end - n.start;
  return weight.indexOf(Math.max(...weight));
}
