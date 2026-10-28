/**
 * universal.ts
 *
 * The effects made once and played the same in all three suites (render.ts puts them in every suite's file): sounds
 * of things, not of music, so no soundtrack's instruments - a horse's whinny as it is mounted, a fall through the air
 * and the landing, the trapdoor's latch and the fall under it, a cactus's prick and a monster's missile, both softer
 * than the Standard set's, and backing out of a menu, a soft tap. Synthesized here, soft above 2-3 kHz, mono at
 * 44.1 kHz. The magic is in magic.ts.
 */

const RATE = 44100;

type Curve = (t: number) => number;

const buffer = (seconds: number): Float32Array => new Float32Array(Math.round(seconds * RATE));

/** Attack over `a`, a curved fall to nothing by `length`. */
const ad =
  (a: number, length: number, curve = 2): Curve =>
  (t) =>
    t < a ? t / a : Math.max(0, 1 - (t - a) / Math.max(1e-6, length - a)) ** curve;

/** A one-pole low-pass at `hz` (or a curve of it), applied twice. */
function lowpass(x: Float32Array, hz: number | Curve): Float32Array {
  const f = typeof hz === 'number' ? (): number => hz : hz;
  const out = Float32Array.from(x);
  for (let pass = 0; pass < 2; pass++) {
    let y = 0;
    for (let i = 0; i < out.length; i++) out[i] = y += (1 - Math.exp((-2 * Math.PI * f(i / RATE)) / RATE)) * (out[i] - y);
  }
  return out;
}

/** White noise from `r`, enveloped. */
function noise(seconds: number, env: Curve, r: () => number): Float32Array {
  const out = buffer(seconds);
  let s = Math.floor(r() * 0x7fffffff) || 1;
  for (let i = 0; i < out.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((s / 0x7fffffff) * 2 - 1) * env(i / RATE);
  }
  return out;
}

/** A tone at `hz` (a curve of time), its harmonics by `wave`: 'sine', 'tri', or 'buzz' (a soft sawtooth, voice-like). */
function tone(seconds: number, hz: Curve, env: Curve, wave: 'sine' | 'tri' | 'buzz'): Float32Array {
  const out = buffer(seconds);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    phase = (phase + hz(t) / RATE) % 1;
    const v =
      wave === 'sine'
        ? Math.sin(2 * Math.PI * phase)
        : wave === 'tri'
          ? 4 * Math.abs(phase - 0.5) - 1
          : Math.sin(2 * Math.PI * phase) + 0.5 * Math.sin(4 * Math.PI * phase) + 0.3 * Math.sin(6 * Math.PI * phase);
    out[i] = v * env(t);
  }
  return out;
}

/** `parts`, each at its start (seconds), summed into one. */
function mix(...parts: [Float32Array, number, number?][]): Float32Array {
  const length = Math.max(...parts.map(([p, at]) => Math.round(at * RATE) + p.length));
  const out = new Float32Array(length);
  for (const [p, at, gain = 1] of parts) {
    const o = Math.round(at * RATE);
    for (let i = 0; i < p.length; i++) out[o + i] += p[i] * gain;
  }
  return out;
}

/** A band of noise around `hz` (a curve): the noise low-passed at it, less what lies an octave below. */
function band(seconds: number, hz: Curve, env: Curve, r: () => number): Float32Array {
  const n = noise(seconds, env, r);
  const hi = lowpass(n, hz);
  const lo = lowpass(n, (t) => hz(t) / 2);
  return hi.map((v, i) => v - lo[i]);
}

/** A soft landing: a low thump, and the dust of it. */
const thud = (r: () => number): Float32Array =>
  mix(
    [tone(0.35, (t) => 70 - 25 * Math.min(1, t / 0.15), ad(0.004, 0.35, 3), 'sine'), 0],
    [lowpass(noise(0.12, ad(0.002, 0.12, 3), r), 600), 0, 0.5],
  );

/** A fall: air rushing past, rising and falling as the drop goes, its pitch falling with it. */
const rush = (seconds: number, r: () => number): Float32Array =>
  band(
    seconds,
    (t) => 1400 * Math.pow(300 / 1400, t / seconds),
    (t) => Math.sin(Math.PI * Math.min(1, t / seconds)) ** 1.5,
    r,
  );

/** A wooden latch: a click, and a knock a moment after. */
const latch = (r: () => number): Float32Array =>
  mix(
    [lowpass(noise(0.025, ad(0.001, 0.025, 3), r), 2000), 0],
    [tone(0.12, (t) => 180 - 60 * Math.min(1, t / 0.08), ad(0.002, 0.12, 3), 'tri'), 0.02, 0.8],
  );

/** A hoof on the ground: a muffled knock. */
const hoof = (pitch: number, r: () => number): Float32Array =>
  mix(
    [tone(0.09, (t) => pitch - 40 * Math.min(1, t / 0.05), ad(0.002, 0.09, 3), 'sine'), 0],
    [lowpass(noise(0.03, ad(0.001, 0.03, 3), r), 900), 0, 0.6],
  );

/** The sounds, by key (sfxKeys.ts), each made from `r` (render.ts seeds it). */
export const UNIVERSAL: Record<string, (r: () => number) => Float32Array> = {
  // A horse mounted: a short whinny - the voice leaping up, wavering down in a whinny's quick flutter, a breath out -
  // over two hooves stamping.
  'cue:MountHorse': (r) => {
    const length = 0.62;
    const pitch: Curve = (t) => {
      const shape = t < 0.08 ? 520 + (900 - 520) * (t / 0.08) : 900 * Math.pow(480 / 900, (t - 0.08) / (length - 0.08));
      return shape * (1 + 0.07 * Math.sin(2 * Math.PI * 13 * t) * Math.min(1, t / 0.1));
    };
    const flutter: Curve = (t) => ad(0.03, length, 1.6)(t) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 13 * t));
    const voice = lowpass(tone(length, pitch, flutter, 'buzz'), 2200);
    const breath = lowpass(noise(0.2, ad(0.02, 0.2, 2), r), 1200);
    return mix([voice, 0.04, 0.8], [breath, 0.5, 0.35], [hoof(150, r), 0, 0.9], [hoof(130, r), 0.13, 0.8]);
  },
  // Falling down a hole: the air rushing past, and the landing.
  fall: (r) => mix([rush(1.05, r), 0], [thud(r), 0.98, 1.2]),
  // The trapdoor: its latch giving, the fall under it, and the landing.
  trapfall: (r) => mix([latch(r), 0], [rush(0.75, r), 0.08], [thud(r), 0.78, 1.2]),
  // A cactus: a quick prick and a short, low "ouch" falling - the Standard's, darker.
  'cue:Ouch': (r) =>
    mix(
      [lowpass(noise(0.02, ad(0.001, 0.02, 3), r), 1800), 0, 0.5],
      [
        lowpass(
          tone(0.22, (t) => 420 * Math.pow(200 / 420, Math.min(1, t / 0.12)), ad(0.01, 0.22, 2), 'tri'),
          1400,
        ),
        0.005,
      ],
    ),
  // A monster's missile: a falling whoosh and a low tone under it - the Standard's, darker.
  foefire: (r) =>
    mix(
      [
        lowpass(
          tone(0.22, (t) => 420 * Math.pow(170 / 420, Math.min(1, t / 0.16)), ad(0.01, 0.22, 2), 'tri'),
          1200,
        ),
        0,
      ],
      [band(0.16, (t) => 1100 - 600 * (t / 0.16), ad(0.01, 0.16, 2), r), 0, 0.7],
    ),
  // Backing out of a menu: a very soft tap - a muffled click and a little low knock.
  'cue:Back': (r) =>
    mix([lowpass(noise(0.03, ad(0.002, 0.03, 3), r), 1500), 0, 0.03], [tone(0.045, () => 210, ad(0.003, 0.045, 3), 'tri'), 0, 0.05]),
};
