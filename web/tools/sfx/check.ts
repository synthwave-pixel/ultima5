/**
 * check.ts
 *
 * The suites' effects held to the design's two rules (docs/superpowers/specs/2026-10-27-unified-sound-design.md),
 * at the game's default levels (Sound FX 80%, where a suite plays at its own level; Music 60%):
 *
 * - loudness: an effect's loudest 100 ms (RMS, both channels summed to one) at most 6 dB above the music's average
 *   (the tunes are levelled at -20 dBFS RMS, then the Music level's gain), a moment meant to stand out at most 10 dB;
 * - harshness: its presence (2-5 kHz) and sibilance (5-10 kHz) no higher, and its tilt no less steep, than the gentlest
 *   of its soundtrack's music on each measure (tools/music/spectrum.ts); one shorter than the spectrum's frame is
 *   measured zero-padded to a frame.
 */

import { levelGain } from '../../src/game/settings.ts';
import { type Fatigue, measure } from '../music/spectrum.ts';
import type { Stereo } from '../music/pcm.ts';

const RATE = 44100;
const dB = (x: number): number => 20 * Math.log10(Math.max(1e-12, x));

/** The music's average loudness at the default Music level (dBFS): its -20 dBFS RMS at the level's gain (ui/sound.ts musicGain). */
export const MUSIC_DB = -20 + dB(levelGain(6));
/** The loudest an effect may be (its loudest 100 ms RMS, dBFS): an everyday one, and one meant to stand out. */
export const LIMITS = { everyday: MUSIC_DB + 6, standout: MUSIC_DB + 10 };

/** Both channels as one, their mean. */
export function mono(pcm: Stereo): Float32Array {
  const out = new Float32Array(pcm[0].length);
  for (let i = 0; i < out.length; i++) out[i] = (pcm[0][i] + pcm[1][i]) / 2;
  return out;
}

/** The loudest 100 ms of `pcm` (RMS in 10 ms hops, dBFS). */
export function loudest(pcm: Stereo, rate = RATE): number {
  const m = mono(pcm);
  const win = Math.round(rate * 0.1);
  const hop = Math.round(rate * 0.01);
  let best = 0;
  for (let at = 0; at < Math.max(1, m.length - win + 1); at += hop) {
    let sum = 0;
    const end = Math.min(m.length, at + win);
    for (let i = at; i < end; i++) sum += m[i] * m[i];
    best = Math.max(best, sum / win);
  }
  return dB(Math.sqrt(best));
}

/** The spectrum's measures of `pcm`, zero-padded to one frame where shorter. */
export function harshness(pcm: Stereo, rate = RATE): Fatigue {
  const m = mono(pcm);
  const padded = m.length >= 8192 ? m : Float32Array.from({ length: 8192 }, (_, i) => m[i] ?? 0);
  return measure(padded, rate);
}

/** The gentlest of `all` on each measure: the least presence, the least sibilance, the steepest tilt. */
export function gentlest(all: Fatigue[]): Pick<Fatigue, 'presence' | 'sibilance' | 'tilt'> {
  return {
    presence: Math.min(...all.map((f) => f.presence)),
    sibilance: Math.min(...all.map((f) => f.sibilance)),
    tilt: Math.min(...all.map((f) => f.tilt)),
  };
}

/** A slice to check: its key, its sound, and whether it is meant to stand out. */
export interface Checked {
  key: string;
  pcm: Stereo;
  standout: boolean;
}

/**
 * What in `slices` of `suite` breaks the rules, a line each, the worst first: louder than its limit, or (given its
 * soundtrack's gentlest music, `reference`) harsher on a measure.
 */
export function checkSuite(suite: string, slices: Checked[], reference?: Pick<Fatigue, 'presence' | 'sibilance' | 'tilt'>): string[] {
  const out: [number, string][] = [];
  for (const s of slices) {
    const limit = s.standout ? LIMITS.standout : LIMITS.everyday;
    const loud = loudest(s.pcm);
    if (loud > limit + 0.05) out.push([loud - limit, `${suite} ${s.key}: ${loud.toFixed(1)} dBFS, over ${limit.toFixed(1)}`]);
    if (!reference) continue;
    const f = harshness(s.pcm);
    const over: [string, number][] = [
      ['presence', f.presence - reference.presence],
      ['sibilance', f.sibilance - reference.sibilance],
      ['tilt', f.tilt - reference.tilt],
    ];
    for (const [what, by] of over)
      if (by > 0.05) out.push([by, `${suite} ${s.key}: ${what} ${by.toFixed(1)} dB over its soundtrack's gentlest`]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, line]) => line);
}
