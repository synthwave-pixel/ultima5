/**
 * design.ts
 *
 * The magic as sound design rather than music (magic.ts): zips - breath through a narrow band sweeping up or down -
 * repeated as echoes fading away, over the 1988 spell's hum as breath; and a room for them to ring in. Each is
 * stereo, at 44.1 kHz.
 */

import type { Stereo } from '../music/pcm.ts';

const RATE = 44100;
type Curve = (t: number) => number;

/** A seeded random source. */
export function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const samples = (seconds: number): number => Math.round(seconds * RATE);

/** Pink noise (Paul Kellet's filter): even energy in every octave - the smooth hiss of air, not white's fizz. */
function pink(n: number, r: () => number): Float32Array {
  const out = new Float32Array(n);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** A two-pole low-pass (a state-variable filter) whose cutoff follows `hz`, resonance `q`. */
function lowpass(x: Float32Array, hz: Curve, q = 0.7): Float32Array {
  const out = new Float32Array(x.length);
  let [low, band] = [0, 0];
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(16000, Math.max(20, hz(i / RATE)))) / RATE);
    low += f * band;
    const high = x[i] - low - band / q;
    band += f * high;
    out[i] = low;
  }
  return out;
}

/** A room: a Schroeder reverb (four combs, two all-passes) a side, the sides tuned apart; `wet` of it mixed in. */
export function room(pcm: Stereo, seconds: number, wet: number, tail = 1.6): Stereo {
  const n = pcm[0].length + samples(tail);
  const side = (x: Float32Array, spread: number): Float32Array => {
    const input = new Float32Array(n);
    input.set(x);
    const out = new Float32Array(n);
    for (const ms of [29.7, 37.1, 41.1, 43.7]) {
      const d = samples((ms + spread) / 1000);
      const g = Math.pow(0.001, ms / 1000 / seconds);
      const buf = new Float32Array(n);
      let damp = 0;
      for (let i = 0; i < n; i++) {
        const back = i >= d ? buf[i - d] : 0;
        damp += 0.4 * (back - damp); // the highs die first
        buf[i] = input[i] + damp * g;
        out[i] += back * 0.25;
      }
    }
    let y = out;
    for (const [ms, g] of [
      [5, 0.7],
      [1.7, 0.7],
    ]) {
      const d = samples(ms / 1000);
      const z = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const back = i >= d ? z[i - d] : 0;
        const v = y[i] + back * g;
        z[i] = v;
        y[i] = back - g * v;
      }
      y = Float32Array.from(y);
    }
    return Float32Array.from({ length: n }, (_, i) => (x[i] ?? 0) * (1 - wet) + y[i] * wet);
  };
  return [side(pcm[0], 0), side(pcm[1], 2.3)];
}

/** `layers` summed, each at its start (seconds) and gain. */
export function layer(...layers: [Stereo, number, number][]): Stereo {
  const n = Math.max(...layers.map(([p, at]) => samples(at) + p[0].length));
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (const [p, at, gain] of layers)
    for (const c of [0, 1]) {
      const o = samples(at);
      for (let i = 0; i < p[c].length; i++) out[c][o + i] += p[c][i] * gain;
    }
  return out;
}

/** A band-pass (a state-variable filter's band output) of `x`, its centre a curve, sharpness `q`. */
function bandpass(x: Float32Array, hz: Curve, q: number): Float32Array {
  const out = new Float32Array(x.length);
  let [low, band] = [0, 0];
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(12000, Math.max(20, hz(i / RATE)))) / RATE);
    low += f * band;
    const high = x[i] - low - band / q;
    band += f * high;
    out[i] = band;
  }
  return out;
}

// --- Zips: what the magic is made of (magic.ts) ----------------------------------------------------------------

/**
 * A zip: breath through a band sweeping from `from` to `to` Hz over `seconds` (exponentially), sharp in and dying
 * out; `q` its narrowness, `warble` a flutter in its pitch (depth, rate).
 */
export function zip(o: { seconds: number; from: number; to: number; q?: number; warble?: [number, number] }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const flutter = (t: number): number => (o.warble ? 1 + o.warble[0] * Math.sin(2 * Math.PI * o.warble[1] * t) : 1);
  const hz = (t: number): number => o.from * Math.pow(o.to / o.from, Math.min(1, t / o.seconds)) * flutter(t);
  const shape = (t: number): number => Math.min(1, t / 0.006) * Math.pow(0.02, t / o.seconds);
  // A wider band is quieter for its width: made up, so q changes the colour, not the level.
  const gain = 4 * Math.sqrt((o.q ?? 6) / 6);
  const side = (): Float32Array => bandpass(pink(n, r), hz, o.q ?? 6).map((v, i) => v * shape(i / RATE) * gain);
  return [side(), side()];
}

/** `pcm` placed at `pan` (-1 left to 1 right): its two sides mixed and set there. */
export function panned(pcm: Stereo, pan: number): Stereo {
  const m = pcm[0].map((v, i) => (v + pcm[1][i]) / 2);
  const a = ((pan + 1) / 2) * (Math.PI / 2);
  return [m.map((v) => v * Math.cos(a) * Math.SQRT2), m.map((v) => v * Math.sin(a) * Math.SQRT2)];
}

/** `pcm` darker: a low-pass at `hz`. */
export const darker = (pcm: Stereo, hz: number): Stereo => pcm.map((c) => lowpass(c, () => hz, 0.7)) as Stereo;

/**
 * Echoes: `make(i)` for each of `count` + 1 strikes (0 the first), at `when(i)` seconds, `feedback` ^ i as loud, each
 * darker, and at `pan(i)` where given (else a little to one side, then the other) - a gesture repeated into the
 * distance.
 */
export function echoes(o: {
  count: number;
  make: (i: number) => Stereo;
  when: (i: number) => number;
  feedback: number;
  pan?: (i: number) => number;
}): Stereo {
  const parts: [Stereo, number, number][] = [];
  for (let i = 0; i <= o.count; i++) {
    let p = o.make(i);
    if (i) p = darker(p, Math.max(900, 4200 - 600 * i));
    if (o.pan) p = panned(p, o.pan(i));
    else if (i) p = i % 2 ? [p[0].map((v) => v * 0.8), p[1]] : [p[0], p[1].map((v) => v * 0.8)];
    parts.push([p, o.when(i), Math.pow(o.feedback, i)]);
  }
  return layer(...parts);
}

/**
 * The 1988 spell's hum as breath: two narrow bands at `hz` and a hair apart, beating as the old pulse's width swept;
 * swelling over `attack`, dying over `seconds`.
 */
export function breathHum(o: { hz: number; seconds: number; attack: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const shape = (t: number): number => (t < o.attack ? (t / o.attack) ** 1.5 : Math.pow(0.001, (t - o.attack) / (o.seconds - o.attack)));
  const side = (detune: number): Float32Array => {
    const air = pink(n, r);
    const a = bandpass(air, () => o.hz, 18);
    const b = bandpass(air, (t) => o.hz * (1.004 + detune) * (1 + 0.003 * Math.sin(2 * Math.PI * 0.7 * t)), 18);
    return Float32Array.from({ length: n }, (_, i) => (a[i] + b[i]) * shape(i / RATE) * 2.2);
  };
  return [side(0), side(0.003)];
}
