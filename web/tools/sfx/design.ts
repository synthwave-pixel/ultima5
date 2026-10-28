/**
 * design.ts
 *
 * Magic as sound design rather than music - layers in the manner of a film's or a game's spell effects: a whoomph
 * (smooth, even noise through a low-pass that opens and closes, over a sub body), a power riser (a glitter of digital
 * partials climbing in steps, flickering), an air shimmer (tiny high sparkles), a sub drop and a sub impact, and a
 * room for them to ring in. Each layer is stereo, at 44.1 kHz; the sub layers carry a quieter octave above, so their
 * weight still reads on a phone's or a handheld's small speakers. The magic is made of them (magic.ts).
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

/** Up to 1 over `rise` seconds (curved), then an exponential fall that is 60 dB down `fall` seconds later. */
export const swell =
  (rise: number, fall: number, curve = 2): Curve =>
  (t) =>
    t < rise ? (t / rise) ** curve : Math.pow(0.001, (t - rise) / fall);

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

/** Mono into stereo, a little apart: the right a few milliseconds behind, as air arriving from a side. */
const wide = (m: Float32Array, lag = 0.004): Stereo => {
  const d = samples(lag);
  const right = new Float32Array(m.length);
  for (let i = d; i < m.length; i++) right[i] = m[i - d];
  return [m, right];
};

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

/**
 * A whoomph: air rushing in and away - pink noise swelling to its peak at `peak` seconds and falling away over `fall`,
 * through a low-pass that opens to `open` Hz as it peaks and closes after; under it a sub body at `sub` Hz sinking a
 * little, with its octave. `reverse`: the air drawn in to a sudden stop instead (an undoing).
 */
export function whoomph(
  o: {
    seconds: number;
    peak: number;
    fall: number;
    open: number;
    sub: number;
    reverse?: boolean;
    /** Swept across, from one side to the other (-1 left to 1 right). */
    pan?: [number, number];
    /** The low-pass wavering - its depth (0-1) and rate (Hz): air swirling. */
    wobble?: [number, number];
  },
  r: () => number,
): Stereo {
  const n = samples(o.seconds);
  const env = o.reverse ? (t: number): number => swell(o.seconds - 0.02, 0.05, 3)(t) : swell(o.peak, o.fall);
  const shape: Curve = (t) => env(t);
  const swirl: Curve = (t) => (o.wobble ? 1 + o.wobble[0] * Math.sin(2 * Math.PI * o.wobble[1] * t) : 1);
  const cutoff: Curve = (t) => (250 + (o.open - 250) * shape(t) ** 0.7) * swirl(t);
  const air = lowpass(pink(n, r), cutoff, 0.9).map((v, i) => v * shape(i / RATE));
  const pan = o.pan;
  const placed: Stereo = pan
    ? ([0, 1].map((c) =>
        air.map((v, i) => {
          const p = pan[0] + (pan[1] - pan[0]) * Math.min(1, i / n);
          const angle = ((p + 1) / 2) * (Math.PI / 2);
          return v * (c === 0 ? Math.cos(angle) : Math.sin(angle)) * Math.SQRT2;
        }),
      ) as Stereo)
    : wide(air);
  const body = Float32Array.from({ length: n }, (_, i) => {
    const t = i / RATE;
    const f = o.sub * (1 - 0.25 * Math.min(1, t / o.seconds));
    return (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * shape(t);
  });
  return layer([placed, 0, 1], [[body, Float32Array.from(body)], 0, 0.5]);
}

/**
 * A power riser: digital glitter - a few partials a little apart, climbing from `from` to `to` Hz in `steps` steps,
 * flickering at `flicker` Hz - over `seconds`, swelling then gone; `bright` keeps the partials' upper harmonics, else
 * it is soft above 3.5 kHz. Falling where `to` is under `from` (a power draining away).
 */
export function riser(
  o: { seconds: number; from: number; to: number; steps: number; flicker: number; bright: boolean },
  r: () => number,
): Stereo {
  const n = samples(o.seconds);
  const out = new Float32Array(n);
  const phases = [0, 0, 0, 0];
  const detune = [1, 1.004, 1.5, 2.01];
  const gains = [1, 0.7, 0.35, 0.25];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const k = Math.min(o.steps - 1, Math.floor((t / o.seconds) * o.steps)) / Math.max(1, o.steps - 1);
    const f = o.from * Math.pow(o.to / o.from, k);
    let v = 0;
    for (let p = 0; p < phases.length; p++) {
      phases[p] = (phases[p] + (f * detune[p]) / RATE) % 1;
      // A soft square: its odd harmonics, fewer where it is to be soft.
      const ph = 2 * Math.PI * phases[p];
      v += gains[p] * (Math.sin(ph) + (o.bright ? Math.sin(3 * ph) / 3 + Math.sin(5 * ph) / 5 : 0));
    }
    const flick = 0.6 + 0.4 * Math.sign(Math.sin(2 * Math.PI * o.flicker * t + r() * 0.2));
    out[i] = v * flick * swell(o.seconds * 0.7, o.seconds * 0.5, 1.5)(t);
  }
  const shaped = o.bright ? out : lowpass(out, () => 3500, 0.7);
  return wide(shaped, 0.007);
}

/** An air shimmer: `count` tiny sparkles, sine pings from `lo` to `hi` Hz, thicker early, each a few dozen milliseconds. */
export function sparkle(o: { seconds: number; count: number; lo: number; hi: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (let s = 0; s < o.count; s++) {
    const at = o.seconds * Math.pow(r(), 1.6) * 0.8;
    const hz = o.lo * Math.pow(o.hi / o.lo, r());
    const len = 0.03 + r() * 0.06;
    const pan = r();
    const gain = 0.3 + 0.7 * r();
    const start = samples(at);
    for (let i = 0; i < samples(len) && start + i < n; i++) {
      const t = i / RATE;
      const v = gain * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.003) * Math.exp((-t / len) * 5);
      out[0][start + i] += v * (1 - pan);
      out[1][start + i] += v * pan;
    }
  }
  return out;
}

/** A sub drop: a sine falling from `from` to `to` Hz over `seconds`, with its octave - weight landing. */
export function subDrop(o: { seconds: number; from: number; to: number }): Stereo {
  const n = samples(o.seconds);
  let phase = 0;
  const m = Float32Array.from({ length: n }, (_, i) => {
    const t = i / RATE;
    const f = o.from * Math.pow(o.to / o.from, t / o.seconds);
    phase += f / RATE;
    return (Math.sin(2 * Math.PI * phase) + 0.3 * Math.sin(4 * Math.PI * phase)) * swell(0.01, o.seconds * 0.9, 1)(t);
  });
  return [m, Float32Array.from(m)];
}

/** A sub impact: a thump at `hz` and a burst of dark noise - a blow landing far off. */
export function impact(o: { hz: number; seconds: number }, r: () => number): Stereo {
  const drop = subDrop({ seconds: o.seconds, from: o.hz * 1.8, to: o.hz * 0.7 });
  const n = samples(0.25);
  const burst = lowpass(pink(n, r), () => 900, 0.7).map((v, i) => v * Math.pow(0.001, i / n) * 2);
  return layer([drop, 0, 1], [wide(burst), 0, 0.6]);
}

/** A rumble: the low end of air, dark and rolling, fading over `seconds` - the ground still moving after a blow. */
export function rumble(seconds: number, r: () => number): Stereo {
  const n = samples(seconds);
  const roll = lowpass(pink(n, r), (t) => 180 + 60 * Math.sin(2 * Math.PI * 2.3 * t), 0.8).map(
    (v, i) => v * 3 * Math.min(1, i / samples(0.05)) * Math.pow(0.001, i / n),
  );
  return wide(roll, 0.011);
}

/**
 * A charge: tension building before a release - air through a resonant low-pass climbing from `from` to `to` Hz,
 * louder as it climbs, cut off at its end where the release takes over. Noise, not tones: a build, not a riser's notes.
 */
export function charge(o: { seconds: number; from: number; to: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const climb: Curve = (t) => o.from * Math.pow(o.to / o.from, Math.min(1, t / o.seconds));
  const air = lowpass(pink(n, r), climb, 2.5).map((v, i) => {
    const k = i / n;
    return v * k * k * (k > 0.97 ? (1 - k) / 0.03 : 1);
  });
  return wide(air, 0.006);
}

/**
 * Embers: `count` dark crackles of energy spending itself - each a few milliseconds of air at a pitch from 700 Hz to
 * 2.5 kHz, struck and gone, placed anywhere left to right - thick at first and thinning over `seconds`.
 */
export function embers(o: { seconds: number; count: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  for (let e = 0; e < o.count; e++) {
    const at = o.seconds * Math.pow(r(), 1.8);
    const len = samples(0.003 + r() * 0.009);
    const cut = 700 + r() * 1800;
    const crack = lowpass(pink(len, r), () => cut, 0.8);
    const gain = (0.5 + r()) * Math.pow(0.001, at / o.seconds / 1.5);
    const pan = r();
    const start = samples(at);
    for (let i = 0; i < len && start + i < n; i++) {
      const v = crack[i] * gain * 6 * Math.exp(-i / (len / 3));
      out[0][start + i] += v * (1 - pan);
      out[1][start + i] += v * pan;
    }
  }
  return out;
}
