/**
 * check.ts
 *
 * The suites' effects held to the design's two rules (docs/superpowers/specs/2026-10-27-unified-sound-design.md),
 * at the game's default levels (Sound FX 80%, where a suite plays at its own level; Music 60%):
 *
 * - loudness: an effect's loudest 100 ms (RMS, both channels as one) at most 6 dB above the music's average
 *   (the tunes are levelled at -20 dBFS RMS, then the Music level's gain), a moment meant to stand out at most 10 dB;
 * - harshness: the same, band by band, where the ear tires - 2 to 5 kHz (presence) and 5 to 10 kHz (sibilance), the
 *   bands of tools/music/spectrum.ts: an effect's loudest 100 ms in the band against its soundtrack's music in the
 *   band (the median of its files, at the default level), with the same margins. The spectrum's own measures are
 *   shares of a sound's whole, which for one note its pitch decides, so the bands are compared as levels here.
 */

import { levelGain } from '../../src/game/settings.ts';
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

/** A band-pass (RBJ, constant peak gain) of `x` around the geometric middle of `lo` to `hi` Hz, run twice. */
export function bandPass(x: Float32Array, lo: number, hi: number, rate = RATE): Float32Array {
  const f0 = Math.sqrt(lo * hi);
  const q = f0 / (hi - lo);
  const w = (2 * Math.PI * f0) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  let out = x;
  for (let pass = 0; pass < 2; pass++) {
    const y = new Float32Array(out.length);
    let [x1, x2, y1, y2] = [0, 0, 0, 0];
    for (let i = 0; i < out.length; i++) {
      const v = b0 * out[i] + b2 * x2 - a1 * y1 - a2 * y2;
      [x2, x1, y2, y1] = [x1, out[i], y1, v];
      y[i] = v;
    }
    out = y;
  }
  return out;
}

/** The bands the ear tires in (Hz): spectrum.ts's presence and sibilance. */
export const BANDS = { presence: [2000, 5000], sibilance: [5000, 10000] } as const;
export type Bands = Record<keyof typeof BANDS, number>;

/** `pcm`'s loudest 100 ms in each band (dBFS). */
export function bandsLoudest(pcm: Stereo, rate = RATE): Bands {
  const m = mono(pcm);
  const at = (lo: number, hi: number): number => {
    const b = bandPass(m, lo, hi, rate);
    return loudest([b, b], rate);
  };
  return { presence: at(...BANDS.presence), sibilance: at(...BANDS.sibilance) };
}

/** Music's level in each band over the whole of it (RMS, dBFS), at the default Music level. */
export function bandsAverage(samples: Float32Array, rate = RATE): Bands {
  const at = (lo: number, hi: number): number => {
    const b = bandPass(samples, lo, hi, rate);
    let sum = 0;
    for (const v of b) sum += v * v;
    return dB(Math.sqrt(sum / Math.max(1, b.length))) + dB(levelGain(6));
  };
  return { presence: at(...BANDS.presence), sibilance: at(...BANDS.sibilance) };
}

/** A slice to check: its key, its sound, and whether it is meant to stand out. */
export interface Checked {
  key: string;
  pcm: Stereo;
  standout: boolean;
}

/**
 * What in `slices` of `suite` breaks the rules, a line each, the worst first: louder than its limit, or (given its
 * soundtrack's music in the bands, `music`) louder in a band than the music there by more than the same margin.
 */
export function checkSuite(suite: string, slices: Checked[], music?: Bands): string[] {
  const out: [number, string][] = [];
  for (const s of slices) {
    const margin = s.standout ? 10 : 6;
    const limit = MUSIC_DB + margin;
    const loud = loudest(s.pcm);
    if (loud > limit + 0.05) out.push([loud - limit, `${suite} ${s.key}: ${loud.toFixed(1)} dBFS, over ${limit.toFixed(1)}`]);
    if (!music) continue;
    const bands = bandsLoudest(s.pcm);
    for (const [band, label] of [
      ['presence', '2-5 kHz'],
      ['sibilance', '5-10 kHz'],
    ] as const) {
      const over = bands[band] - (music[band] + margin);
      if (over > 0.05) out.push([over, `${suite} ${s.key}: ${label} ${over.toFixed(1)} dB over the music's there`]);
    }
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, line]) => line);
}
