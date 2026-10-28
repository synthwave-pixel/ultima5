/**
 * design.ts
 *
 * Magic as sound design rather than music - layers in the manner of a film's or a game's spell effects: a whoomph
 * (smooth, even noise through a low-pass that opens and closes, over a sub body), a sub bloom (pressure swelling in at
 * one pitch, no beater), a sub drop, a rumble; the mystical - a chamber's inharmonic resonances, whispers through a
 * voice's vowels, a pre-verb, a swirl, a hover - and a room for them to ring in. Each layer is stereo, at 44.1 kHz; the sub layers carry a quieter octave above, so their
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

/** A two-pole high-pass (a state-variable filter's high output) at `hz`, run twice: what lies above it alone. */
function highpass(x: Float32Array, hz: number): Float32Array {
  let out = x;
  const f = 2 * Math.sin((Math.PI * hz) / RATE);
  for (let pass = 0; pass < 2; pass++) {
    const y = new Float32Array(out.length);
    let [low, band] = [0, 0];
    for (let i = 0; i < out.length; i++) {
      low += f * band;
      const high = out[i] - low - band / 0.7;
      band += f * high;
      y[i] = high;
    }
    out = y;
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

/** A rumble: the low end of air, dark and rolling, fading over `seconds` - the ground still moving after a blow. */
export function rumble(seconds: number, r: () => number): Stereo {
  const n = samples(seconds);
  const roll = lowpass(pink(n, r), (t) => 180 + 60 * Math.sin(2 * Math.PI * 2.3 * t), 0.8).map(
    (v, i) => v * 3 * Math.min(1, i / samples(0.05)) * Math.pow(0.001, i / n),
  );
  return wide(roll, 0.011);
}

/** How loud a sub bloom's growl is at its fullest (body 1), against the bloom: as loud, where the ear hears, as a blow. */
const GROWL = 6;

/**
 * A sub bloom: pressure without a beater - a deep tone at one pitch (and its octave) swelling in over `attack`, fading.
 * With `body` (0 to 1), its overtones too: the tone driven into saturation and only what lies above it kept,
 * darkened - a growl in the hundreds of hertz, so that the bloom is heard where it is too deep for the ear (whose
 * lows are dull) or the speaker (whose lows are gone) alone.
 */
export function subBloom(o: { hz: number; seconds: number; attack: number; beat?: number; body?: number }): Stereo {
  const n = samples(o.seconds);
  const m = Float32Array.from({ length: n }, (_, i) => {
    const t = i / RATE;
    const env = t < o.attack ? Math.sin((Math.PI / 2) * (t / o.attack)) : Math.pow(0.001, (t - o.attack) / (o.seconds - o.attack));
    const tone = (hz: number): number => Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(4 * Math.PI * hz * t);
    // With `beat`, two tones that far apart (Hz), beating against each other: the pressure throbbing as it fades.
    return (o.beat ? (tone(o.hz) + tone(o.hz + o.beat)) / 2 : tone(o.hz)) * env;
  });
  if (o.body) {
    const over = lowpass(
      highpass(
        m.map((v) => Math.tanh(5 * v)),
        240,
      ),
      () => 1800,
    );
    for (let i = 0; i < n; i++) m[i] += o.body * GROWL * over[i];
  }
  return [m, Float32Array.from(m)];
}

// --- The mystical: what the higher circles may add ------------------------------------------------------------

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

/** The vowels' formants (Hz): ah, oh, oo. */
const VOWELS: Record<'ah' | 'oh' | 'oo', [number, number, number]> = {
  ah: [700, 1220, 2600],
  oh: [450, 800, 2830],
  oo: [325, 700, 2530],
};

/**
 * Whispers: breath shaped by a voice's formants, the vowel moving from ah through oh to oo over `seconds` - two
 * voices, a little apart, one each side: ghostly voices breathing, no pitch, so no song.
 */
export function whispers(o: { seconds: number; swell: Curve }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const voice = (shift: number): Float32Array => {
    const breath = pink(n, r);
    const at = (k: number, f: number): number => {
      const [a, b, c] = [VOWELS.ah[f], VOWELS.oh[f], VOWELS.oo[f]];
      return (k < 0.5 ? a + (b - a) * k * 2 : b + (c - b) * (k - 0.5) * 2) * shift;
    };
    const parts = [0, 1, 2].map((f) => bandpass(breath, (t) => at(Math.min(1, t / o.seconds), f), 8));
    return Float32Array.from({ length: n }, (_, i) => (parts[0][i] + 0.6 * parts[1][i] + 0.25 * parts[2][i]) * o.swell(i / RATE) * 3);
  };
  return [voice(1), voice(1.06)];
}

/** `pcm` backwards. */
const reversed = (pcm: Stereo): Stereo => pcm.map((c) => Float32Array.from(c).reverse()) as Stereo;

/**
 * A pre-verb: a short breath of air sent into a long room and the room's ring played backwards - a ghostly swell that
 * arrives out of nothing, ending abruptly at `seconds` where whatever it leads into takes over.
 */
export function preverb(o: { seconds: number }, r: () => number): Stereo {
  const breath = whoomph({ seconds: 0.25, peak: 0.03, fall: 0.2, open: 3500, sub: 60 }, r);
  const wet = room(breath, o.seconds + 0.5, 1, o.seconds + 0.5);
  const back = reversed(wet);
  const keep = samples(o.seconds);
  return back.map((c) => c.subarray(c.length - keep).map((v, i) => v * Math.min(1, i / samples(0.05)))) as Stereo;
}

/** `pcm` through a slowly sweeping comb (a flanger): its copy delayed from `from` to `to` ms and back, a swirl. */
export function swirl(pcm: Stereo, from: number, to: number, rate: number): Stereo {
  return pcm.map((c, side) =>
    c.map((v, i) => {
      const t = i / RATE;
      const ms = from + (to - from) * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t + side * 0.9));
      const d = (ms / 1000) * RATE;
      const j = i - d;
      const k = Math.floor(j);
      const late = k >= 0 ? c[k] + (c[k + 1] - c[k]) * (j - k) : 0;
      return (v + late) * 0.7;
    }),
  ) as Stereo;
}

/**
 * A chamber: the air ringing an imagined stone hall's resonances - breath through a few sharp band-passes at
 * inharmonic ratios to `hz` (no chord), ringing on and dying over `seconds`.
 */
export function chamber(o: { hz: number; seconds: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const env: Curve = (t) => Math.min(1, t / 0.03) * Math.pow(0.001, t / o.seconds);
  const excite = pink(n, r).map((v, i) => v * env(i / RATE));
  const side = (shift: number): Float32Array => {
    const out = new Float32Array(n);
    [1, 1.47, 2.09, 2.83, 3.71].forEach((ratio, k) => {
      const ring = bandpass(excite, () => o.hz * ratio * shift, 40);
      for (let i = 0; i < n; i++) out[i] += ring[i] * (1 / (1 + k * 0.6)) * 4;
    });
    return out;
  };
  return [side(1), side(1.012)];
}

/**
 * A hover: `pcm` held at `at` seconds and smeared - short windowed slices from around that moment, laid over each
 * other and drifting, held for half of `seconds` and then fading: the air hanging as if time slowed.
 */
export function hover(pcm: Stereo, o: { at: number; seconds: number }, r: () => number): Stereo {
  const n = samples(o.seconds);
  const out: Stereo = [new Float32Array(n), new Float32Array(n)];
  const grain = samples(0.09);
  const hop = samples(0.03);
  for (let start = 0; start + grain < n; start += hop) {
    const from = samples(o.at + (r() - 0.5) * 0.06);
    // Held level through the first half, as if time stood still, then let go.
    const k = start / n;
    const gain = (k < 0.5 ? 1 : Math.pow(0.001, (k - 0.5) / 0.5)) * 0.55;
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < grain; i++) {
        const w = Math.sin((Math.PI * i) / grain) ** 2;
        out[c][start + i] += (pcm[c][from + i] ?? 0) * w * gain;
      }
  }
  return out;
}
