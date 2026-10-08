/**
 * ease.ts
 *
 * A render eased for hearing over and over (spectrum.ts): a dip centred on
 * 3.2 kHz, where the ear is most sensitive, and a softer top above 7 kHz -
 * only as deep as the render needs to come down to `TARGET`, and never
 * deeper than `CAP`. Equalizing only: no note moves in pitch.
 */

import type { Stereo } from './pcm.ts';
import { measure } from './spectrum.ts';

/** What a tune heard over and over may have: presence and its harshest seconds' presence, dB (spectrum.ts). */
export const TARGET = { presence: -18, harshest: -13 };
/** The deepest dip, dB: past this the arrangement, not the equalizer, is what needs softening. */
export const CAP = 8;

/** A biquad's coefficients, normalised: b0, b1, b2, a1, a2 (Robert Bristow-Johnson's cookbook). */
type Biquad = [number, number, number, number, number];

function peaking(rate: number, hz: number, octaves: number, gain: number): Biquad {
  const a = Math.pow(10, gain / 40);
  const w = (2 * Math.PI * hz) / rate;
  const alpha = Math.sin(w) * Math.sinh(((Math.LN2 / 2) * octaves * w) / Math.sin(w));
  const a0 = 1 + alpha / a;
  return [(1 + alpha * a) / a0, (-2 * Math.cos(w)) / a0, (1 - alpha * a) / a0, (-2 * Math.cos(w)) / a0, (1 - alpha / a) / a0];
}

function highShelf(rate: number, hz: number, gain: number): Biquad {
  const a = Math.pow(10, gain / 40);
  const w = (2 * Math.PI * hz) / rate;
  const [cos, alpha] = [Math.cos(w), Math.sin(w) / Math.SQRT2];
  const root = 2 * Math.sqrt(a) * alpha;
  const a0 = a + 1 - (a - 1) * cos + root;
  return [
    (a * (a + 1 + (a - 1) * cos + root)) / a0,
    (-2 * a * (a - 1 + (a + 1) * cos)) / a0,
    (a * (a + 1 + (a - 1) * cos - root)) / a0,
    (2 * (a - 1 - (a + 1) * cos)) / a0,
    (a + 1 - (a - 1) * cos - root) / a0,
  ];
}

function filter(x: Float32Array, [b0, b1, b2, a1, a2]: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < x.length; i++) {
    y[i] = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x[i], y1, y[i]];
  }
  return y;
}

/** `pcm` with the dip `dip` dB deep (the top above 7 kHz softened by five sixths of it). */
export function eased(pcm: Stereo, rate: number, dip: number): Stereo {
  const bands = [peaking(rate, 3200, 1.5, -dip), highShelf(rate, 7000, (-dip * 5) / 6)];
  return pcm.map((ch) => bands.reduce(filter, ch)) as Stereo;
}

const mono = ([l, r]: Stereo): Float32Array => Float32Array.from(l, (x, i) => (x + r[i]) / 2);

/** `pcm` eased as little as brings it to TARGET (in whole dB, to CAP), and how deep: 0 where it was there already. */
export function easeToTarget(pcm: Stereo, rate: number): { pcm: Stereo; dip: number; over: boolean } {
  const within = (p: Stereo): boolean => {
    const m = measure(mono(p), rate);
    return m.presence <= TARGET.presence && m.harshest <= TARGET.harshest;
  };
  if (within(pcm)) return { pcm, dip: 0, over: false };
  let out = pcm;
  for (let dip = 1; dip <= CAP; dip++) {
    out = eased(pcm, rate, dip);
    if (within(out)) return { pcm: out, dip, over: false };
  }
  return { pcm: out, dip: CAP, over: true };
}
