/**
 * chip3.ts
 *
 * The ultima3 port's Standard effects (its tools/chip-sfx.ts), for the
 * effects the two games share: pulse, triangle and noise voices with short
 * envelopes and sweeps, the ones a turn repeats shaped for repetition -
 * energy kept low, noise low-passed, 20 dB down within a few dozen
 * milliseconds - and the jingles never long. chip.ts picks one of these
 * where the game's call is one of these effects; the rest keep its own.
 * Levels are peaks in dBFS, as that port's.
 */

import { RATE } from './chip.ts';

type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'saw' | 'sine';
type Curve = (t: number) => number;

function tone(dur: number, freq: Curve | number, wave: Wave, env: Curve): Float32Array {
  const n = Math.round(dur * RATE);
  const out = new Float32Array(n);
  const f = typeof freq === 'number' ? (): number => freq : freq;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    phase = (phase + f(t) / RATE) % 1;
    let v: number;
    switch (wave) {
      case 'p12':
        v = phase < 0.125 ? 1 : -1;
        break;
      case 'p25':
        v = phase < 0.25 ? 1 : -1;
        break;
      case 'p50':
        v = phase < 0.5 ? 1 : -1;
        break;
      case 'tri':
        v = 4 * Math.abs(phase - 0.5) - 1;
        break;
      case 'saw':
        v = 2 * phase - 1;
        break;
      case 'sine':
        v = Math.sin(2 * Math.PI * phase);
        break;
    }
    out[i] = v * env(t);
  }
  return out;
}

/** Console noise: a shift register clocked at `rate` Hz, which may sweep. */
function noise(dur: number, rate: Curve | number, env: Curve, seed = 0x7fff): Float32Array {
  const n = Math.round(dur * RATE);
  const out = new Float32Array(n);
  const r = typeof rate === 'number' ? (): number => rate : rate;
  let lfsr = seed;
  let acc = 0;
  let v = 1;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    acc += r(t) / RATE;
    while (acc >= 1) {
      acc -= 1;
      const bit = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (bit << 14);
      v = lfsr & 1 ? 1 : -1;
    }
    out[i] = v * env(t);
  }
  return out;
}

const rest = (dur: number): Float32Array => new Float32Array(Math.round(dur * RATE));

function mix(...layers: (Float32Array | [Float32Array, number])[]): Float32Array {
  let len = 0;
  const parts = layers.map((l) => (Array.isArray(l) ? l : ([l, 0] as [Float32Array, number])));
  for (const [buf, at] of parts) len = Math.max(len, Math.round(at * RATE) + buf.length);
  const out = new Float32Array(len);
  for (const [buf, at] of parts) {
    const off = Math.round(at * RATE);
    for (let i = 0; i < buf.length; i++) out[off + i] += buf[i];
  }
  return out;
}

const seq = (...parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

const ad =
  (attack: number, dur: number, floor = 0.001): Curve =>
  (t) =>
    t < attack ? t / attack : Math.pow(floor, (t - attack) / Math.max(0.001, dur - attack));
const hold =
  (dur: number, edge = 0.008): Curve =>
  (t) =>
    Math.max(0, Math.min(1, t / edge, (dur - t) / edge));
const glide =
  (a: number, b: number, dur: number): Curve =>
  (t) =>
    a * Math.pow(b / a, Math.min(1, t / dur));
const vib =
  (f: number, depth: number, hz: number): Curve =>
  (t) =>
    f * (1 + depth * Math.sin(2 * Math.PI * hz * t));
/** A well-worn game thud's envelope: instant, 20 dB down within `fast`, a quiet tail over the rest of `dur`. */
const perc =
  (fast: number, dur: number, tail = 0.08): Curve =>
  (t) =>
    t < 0.001 ? t / 0.001 : Math.max(Math.pow(0.1, t / fast), tail * Math.pow(0.001, t / dur)) * (t < dur ? 1 : 0);

/** A buffer at `k` of its level. */
const scaled = (buf: Float32Array, k: number): Float32Array => buf.map((v) => v * k);

/** A latch's click: a tick of bright noise, low-passed, and a lower click a dozen milliseconds on. */
function latch(dur: number): Float32Array {
  return mix(lowpass(noise(dur, 12000, perc(dur / 5, dur), 0x1357), 5000), [
    scaled(tone(dur + 0.01, 1400, 'p25', perc(0.006, dur + 0.01)), 0.35),
    0.012,
  ]);
}

/** A soft wooden knock: a falling triangle thump under a puff of low-passed noise. */
function knock(dur: number): Float32Array {
  return mix(
    tone(dur, (t) => 150 - (250 * 0.12 * t) / dur, 'tri', perc(dur / 4, dur)),
    scaled(lowpass(noise(dur * 0.42, 3000, perc(dur / 10, dur * 0.42), 0x2468), 900), 0.5),
  );
}

function lowpass(buf: Float32Array, hz: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
  const out = new Float32Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += k * (buf[i] - y);
    out[i] = y;
  }
  return out;
}

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const chord = (notes: number[], dur: number, wave: Wave, env: Curve): Float32Array => {
  const out = mix(...notes.map((n) => tone(dur, midi(n), wave, env)));
  for (let i = 0; i < out.length; i++) out[i] /= notes.length;
  return out;
};
const run = (notes: number[], step: number, wave: Wave = 'p25', sustain = 0.9): Float32Array =>
  seq(...notes.map((n) => tone(step, midi(n), wave, ad(0.004, step * sustain))));

function peak(buf: Float32Array, db: number): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? Math.pow(10, db / 20) / max : 0;
  return buf.map((v) => v * k);
}

const thud = (f: number, fast: number, dur: number): Float32Array => tone(dur, glide(f, f * 0.45, dur * 0.5), 'tri', perc(fast, dur));
const tick = (dur: number, cut: number, seed: number, rate = 3000): Float32Array =>
  lowpass(noise(dur, rate, perc(dur * 0.35, dur, 0.03), seed), cut);
const at = (buf: Float32Array, k: number): Float32Array => buf.map((v) => v * k);
const blow = (f: number, fast: number, dur: number, seed: number): Float32Array =>
  mix(thud(f, fast, dur), at(tick(0.05, 600, seed), 0.5), [at(tone(dur * 0.6, 55, 'tri', perc(dur * 0.2, dur * 0.6, 0.02)), 0.12), 0.02]);
const swing = (f: number, seed: number): Float32Array =>
  mix(thud(f, 0.015, 0.3), at(tick(0.03, 500, seed), 0.3), [at(tick(0.025, 600, seed ^ 0x5a5a), 0.15), 0.05]);
const impact = (f: number, fast: number, dur: number, cut: number, seed = 0x6543): Float32Array =>
  mix(thud(f, fast, dur), lowpass(noise(dur * 0.4, 5000, perc(fast * 0.6, dur * 0.4), seed), cut));
const fanfare = (notes: number[], step: number, last: number): Float32Array =>
  mix(seq(run(notes.slice(0, -1), step, 'p25'), tone(last, midi(notes[notes.length - 1]), 'p50', ad(0.005, last, 0.01))), [
    seq(
      run(
        notes.slice(0, -1).map((n) => n - 12),
        step,
        'tri',
        0.8,
      ),
      tone(last, midi(notes[notes.length - 1] - 12), 'tri', ad(0.005, last, 0.01)),
    ),
    0,
  ]);

// --- The port's own effects, in the ultima3 port's manner (September 2026) ---------------------------------

/** An echo: `n` repeats, `delay` apart, each `fb` of the last, dulled a little each time. */
function echo(buf: Float32Array, delay: number, fb: number, n: number): Float32Array {
  const parts: [Float32Array, number][] = [[buf, 0]];
  let cur = buf;
  for (let i = 1; i <= n; i++) {
    cur = lowpass(at(cur, fb), 3200 / i);
    parts.push([cur, delay * i]);
  }
  return mix(...parts);
}

/** A low-pass whose cutoff moves from `from` to `to` over the buffer. */
function sweepLow(buf: Float32Array, from: number, to: number): Float32Array {
  const out = new Float32Array(buf.length);
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    const hz = from * Math.pow(to / from, i / buf.length);
    y += (1 - Math.exp((-2 * Math.PI * hz) / RATE)) * (buf[i] - y);
    out[i] = y;
  }
  return out;
}

/** A warm voice: a pulse with a triangle an octave down under it. */
const warm = (dur: number, n: number, env: Curve, wave: Wave = 'p25', low = 0.5): Float32Array =>
  mix(tone(dur, midi(n), wave, env), at(tone(dur, midi(n - 12), 'tri', env), low));

/** A tune: [note, length in seconds] pairs, each a warm voice, legato. */
const tune = (notes: [number, number][], wave: Wave = 'p25', low = 0.5): Float32Array =>
  seq(...notes.map(([n, d]) => warm(d, n, ad(0.01, d * 0.95, 0.05), wave, low)));

/** A crack of lightning: a bright snap, and the air torn after it. */
const crack = (seed: number): Float32Array =>
  mix(
    lowpass(noise(0.05, 16000, perc(0.012, 0.05), seed), 7000),
    at(sweepLow(noise(0.25, 8000, perc(0.08, 0.25), seed ^ 0x3c3c), 4000, 600), 0.6),
  );

/** A rumble: noise low and rolling, `dur` long. */
const rumble = (dur: number, seed: number): Float32Array => sweepLow(noise(dur, 2500, ad(0.02, dur, 0.02), seed), 500, 90);

/** A held chord of warm voices swelling in and out. */
const swell = (notes: number[], dur: number, wave: Wave = 'p25'): Float32Array => {
  const out = mix(...notes.map((n) => tone(dur, vib(midi(n), 0.006, 5), wave, ad(dur * 0.3, dur, 0.02))));
  return mix(out, at(tone(dur, midi(notes[0] - 12), 'tri', ad(dur * 0.3, dur, 0.02)), notes.length * 0.5));
};

/** A footstep: the ultima3 step, `f` its body's pitch, `cut` its grit, echoing `wet` of itself off stone. */
const footfall = (f: number, cut: number, wet: number, seed: number): Float32Array => {
  const step = impact(f, 0.03, 0.14, cut, seed);
  return wet ? echo(step, 0.07, wet, 2) : step;
};

/** A high-pass: what a low-pass at `hz` takes away. */
function highpass(buf: Float32Array, hz: number): Float32Array {
  const low = lowpass(buf, hz);
  return buf.map((v, i) => v - low[i]);
}

/** A soft voice, not a bright chip: pulse and triangle together, low-passed. */
const soft = (dur: number, freq: Curve | number, env: Curve): Float32Array =>
  lowpass(mix(at(tone(dur, freq, 'p50', env), 0.5), tone(dur, freq, 'tri', env)), 1400);

/** A lament: `notes` falling a `step` each on the soft voice, the last held `last` and sagging a little. */
const lament = (notes: number[], step: number, last: number): Float32Array => {
  const n = notes[notes.length - 1];
  return seq(
    ...notes.slice(0, -1).map((m) => soft(step, midi(m), ad(0.015, step, 0.2))),
    mix(
      soft(last, glide(midi(n), midi(n) * 0.97, last), ad(0.015, last, 0.01)),
      at(tone(last, midi(n - 12), 'tri', ad(0.015, last, 0.01)), 0.5),
    ),
  );
};

/** `buf` cut at `dur` seconds, faded over its last `fade`. */
const fit = (buf: Float32Array, dur: number, fade = 0.12): Float32Array => {
  const n = Math.min(buf.length, Math.round(dur * RATE));
  const f = Math.round(fade * RATE);
  return buf.slice(0, n).map((v, i) => (i > n - f ? v * ((n - i) / f) : v));
};

/** A resonant state-variable filter (low-, band- or high-pass), its cutoff a curve, `q` its resonance. */
function svf(buf: Float32Array, cut: Curve, q: number, mode: 'low' | 'band' | 'high' = 'low'): Float32Array {
  const out = new Float32Array(buf.length);
  let lo = 0;
  let bp = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(0.24, cut(i / RATE) / RATE));
    // Run twice a sample, for stability at high cutoffs.
    for (let k = 0; k < 2; k++) {
      lo += f * bp;
      const hi = buf[i] - lo - bp / q;
      bp += f * hi;
      out[i] = mode === 'low' ? lo : mode === 'band' ? bp : hi;
    }
  }
  return out;
}

/**
 * The spells' instrument (the "whoom"): a detuned sawtooth pair on each of `notes` (the first loudest) through a
 * resonant band-pass that sweeps up from low to `top` Hz in `up` seconds, like a breath drawn in, and falls back
 * over `fall`; `floor` is how far it has faded by its end.
 */
const whoom = (dur: number, notes: number[], up: number, top: number, fall = 0.2, floor = 0.02): Float32Array => {
  const env = ad(0.01, dur, floor);
  const src = mix(
    ...notes.flatMap((n, i) => [
      at(tone(dur, midi(n), 'saw', env), i ? 0.6 : 1),
      at(tone(dur, midi(n) * (i ? 0.996 : 1.008), 'saw', env), i ? 0.6 : 1),
    ]),
  );
  return svf(src, (t) => (t < up ? 200 * Math.pow(top / 200, t / up) : top * Math.pow(400 / top, Math.min(1, (t - up) / fall))), 6, 'band');
};

/**
 * The instrument's lead: a pure sine note blooming, and under it the detuned saws an octave down through a resonant
 * low-pass that pops open and settles - the whoom in miniature, a note long.
 */
const lead = (dur: number, n: number): Float32Array => {
  const env = ad(0.008, dur, 0.03);
  const saws = mix(tone(dur, midi(n - 12), 'saw', env), tone(dur, midi(n - 12) * 1.006, 'saw', env));
  const pop = (t: number): number => (t < 0.03 ? 300 * Math.pow(9, t / 0.03) : 2700 * Math.pow(0.3, Math.min(1, (t - 0.03) / dur)));
  return mix(tone(dur, midi(n), 'sine', env), at(svf(saws, pop, 4), 0.35));
};

/** Lead notes one after another from `start`: [note, step] pairs, each ringing a little into the next. */
const melody = (notes: [number, number][], start: number, level = 1): [Float32Array, number][] => {
  let t = start;
  return notes.map(([n, d]) => {
    const part: [Float32Array, number] = [at(lead(d * 1.4, n), level), t];
    t += d;
    return part;
  });
};

/** Soft saturation: `buf` scaled to full and rounded off by a tanh curve of `drive` - peaks held, the body raised. */
function squash(buf: Float32Array, drive: number): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? 1 / max : 0;
  return buf.map((v) => Math.tanh(drive * v * k) / Math.tanh(drive));
}

/**
 * A spell by circle, on the whoom: the first the whoom on D and a note blooming out of it, a little over half a
 * second; each circle after richer, not higher - an interval, a minor arpeggio over a sub bass, a figure, a melody
 * over moving chords (each chord its own whoom) - to the eighth, a dramatic phrase in D minor over i, VI, V: the
 * dominant pulsing, a riser and a run up into D major, the last whoom wide and long. From the third circle each ends
 * on D major, climbing. The sweep's speed and height differ every cast (`r`), so a spell cast again and again never
 * quite repeats. A little echo on all.
 */
function spell(circle: number, r: () => number): Float32Array {
  const c = Math.max(1, Math.min(8, circle));
  const len = 0.55 * Math.pow(1.5 / 0.55, (c - 1) / 7);
  const up = 0.1 + r() * 0.04;
  const top = 3000 + r() * 2000;
  const s = up; // the music blooms as the sweep peaks
  const left = len - s;
  const layers: [Float32Array, number][] = [];
  // The opening whoom, on D (the eighth's lower and wider).
  const open = c === 8 ? whoom(up + 0.4, [38, 45, 50], up, top + 1500, 0.3) : whoom(Math.min(0.45, len), [50, 57], up, top);
  layers.push([open, 0]);
  const sub = (notes: [number, number][], level = 0.35): void => {
    let t = s;
    for (const [n, d] of notes) {
      layers.push([at(tone(d + 0.04, midi(n), 'sine', ad(0.01, d + 0.04, 0.1)), level), t]);
      t += d;
    }
  };
  // Chords after the first, each its own whoom, quicker; `at` the time each starts.
  const chords = (list: [number[], number, number][], level = 0.55): void => {
    for (const [notes, t0, d] of list) layers.push([at(whoom(d + 0.1, notes, Math.min(0.07, d * 0.4), 2200 + r() * 1200, d), level), t0]);
  };
  // Each circle may darken in the middle, but ends climbing onto D major: the minor lifted to a triumph.
  const MAJOR = [50, 54, 57];
  const phrases: [number, number][][] = [
    [[74, left]],
    [
      [74, 0.1],
      [81, left - 0.1],
    ],
    [
      [62, 0.08],
      [65, 0.08],
      [69, 0.08],
      [74, left - 0.24],
    ],
    [
      [62, 0.08],
      [65, 0.08],
      [69, 0.08],
      [72, 0.08],
      [74, left - 0.32],
    ],
    [
      [65, 0.1],
      [67, 0.1],
      [69, 0.1],
      [70, 0.12],
      [72, 0.12],
      [74, left - 0.54],
    ],
    [
      [62, 0.1],
      [65, 0.1],
      [69, 0.1],
      [67, 0.12],
      [69, 0.1],
      [73, 0.12],
      [74, left - 0.64],
    ],
    [
      [62, 0.09],
      [65, 0.09],
      [69, 0.09],
      [70, 0.1],
      [65, 0.1],
      [70, 0.1],
      [72, 0.1],
      [67, 0.1],
      [74, left - 0.77],
    ],
    [
      [69, 0.09],
      [72, 0.09],
      [70, 0.09],
      [65, 0.09],
      [67, 0.09],
      [64, 0.09],
      [61, 0.1],
      [62, 0.05],
      [66, 0.05],
      [69, 0.05],
      [74, left - 0.79],
    ],
  ];
  layers.push(...melody(phrases[c - 1], s, c === 1 ? 0.6 : 1));
  // The last chord: D major, its own whoom, with the major third sung over the last note.
  const triumph = (t0: number, level = 0.6): void => {
    const d = left - t0;
    layers.push(
      [at(whoom(d + 0.1, MAJOR, Math.min(0.07, d * 0.4), 2600 + r() * 1200, d * 1.5, 0.15), level), s + t0],
      [at(lead(d, 78), 0.3), s + t0],
    );
  };
  if (c === 3) {
    sub([[38, left]]);
    triumph(0.24, 0.45);
  }
  if (c === 4) {
    sub([[38, left]]);
    triumph(0.32, 0.5);
  }
  if (c === 5) {
    chords([[[46, 53], s + 0.3, 0.24]]);
    sub([
      [38, 0.3],
      [34, 0.24],
      [38, left - 0.54],
    ]);
    triumph(0.54);
  }
  if (c === 6) {
    chords([[[45, 49, 52], s + 0.3, 0.34]]);
    sub([
      [38, 0.3],
      [33, 0.34],
      [38, left - 0.64],
    ]);
    triumph(0.64);
  }
  if (c === 7) {
    // i, VI, VII, I: the flat-seven climbing to the major tonic.
    chords([
      [[46, 53, 58], s + 0.27, 0.3],
      [[48, 55, 60], s + 0.57, 0.2],
    ]);
    sub([
      [38, 0.27],
      [34, 0.3],
      [36, 0.2],
      [38, left - 0.77],
    ]);
    triumph(0.77, 0.7);
  }
  if (c === 8) {
    // i (the opening), VI, V pulsing twice under the fall, a riser and a quick run up into I - D major, wide and
    // long, the melody doubled an octave over it.
    chords(
      [
        [[46, 53, 58], s + 0.18, 0.18],
        [[45, 52, 57], s + 0.36, 0.14],
        [[45, 52, 57], s + 0.5, 0.14],
      ],
      0.6,
    );
    const d = left - 0.64;
    layers.push(
      [at(whoom(d + 0.1, [38, 50, 54, 57, 62], 0.12, top + 1000, d * 2.5, 0.25), 0.8), s + 0.64],
      [
        at(
          sweepLow(
            noise(0.3, 12000, (t) => (t / 0.3) ** 2, 0x5454),
            800,
            6000,
          ),
          0.12,
        ),
        s + 0.34,
      ],
      [at(lead(left - 0.79, 86), 0.35), s + 0.79],
      [at(lead(left - 0.79, 78), 0.3), s + 0.79],
    );
    sub(
      [
        [38, 0.18],
        [34, 0.18],
        [33, 0.28],
        [26, left - 0.64],
      ],
      0.45,
    );
  }
  // Gently saturated, so the whoom's first resonant peak does not leave the tune under it quiet.
  return fit(squash(echo(mix(...layers), 0.1, 0.3, 2), 2.2), len, Math.min(0.15, len * 0.3));
}

/** A metallic crack: a click of bright noise and a few inharmonic partials ringing briefly - something breaking. */
function metalCrack(seed: number): Float32Array {
  return mix(
    highpassed(noise(0.02, 18000, perc(0.004, 0.02), seed), 2500),
    ...[1370, 2230, 3470, 4810].map((f, i): [Float32Array, number] => [
      scaled(tone(0.12, f, 'sine', perc(0.02 + i * 0.005, 0.12)), 0.5 / (i + 1)),
      0.002,
    ]),
  );
}
const highpassed = (buf: Float32Array, hz: number): Float32Array => {
  const low = lowpass(buf, hz);
  return buf.map((v, i) => v - low[i]);
};

/**
 * Magic undone, `dur` long - a ring lost, one absorbed by the Mirror of Truth, a thing unmade by Negate Matter (after
 * its spell): a breath drawn in, noise swelling and rising, cut off by a muffled crack, and a short echo after.
 */
function dissolve(dur: number): Float32Array {
  const cut = dur * 0.75;
  const breath = svf(
    noise(cut, 8000, (t) => Math.pow(t / cut, 2), 0x5353),
    (t) => 300 * Math.pow(10, t / cut),
    3,
    'band',
  );
  const thump = lowpass(metalCrack(0x2b2b), 1400);
  return echo(mix(breath, [scaled(thump, 0.8), cut], [scaled(tone(0.15, 110, 'sine', perc(0.04, 0.15)), 0.5), cut]), 0.09, 0.3, 2);
}

/** Rule Britannia's opening (the port's own reading of RULEBRIT.XMI), in F. */
const BRITANNIA = [60, 65, 65, 65, 67, 69, 70, 72];
/** Blackthorn's theme's opening (BLCKTHRN.XMI), in G minor. */
const BLACKTHORN = [67, 67, 69, 67, 70, 69];

/**
 * The ultima3 port's effects, by its names, at its levels; `k` scales the pitch (a repeated effect's variation) and
 * `circle` is a spell's circle (1-8), which sets its richness; `r` varies a spell each cast.
 */
/**
 * A waterfall, near it (ui/sound.ts plays it on and on while the party is): two loops sounding together, a roar of
 * `ROAR_SECONDS` and a babble of `BABBLE_SECONDS`, each started anywhere in itself - their lengths unlike, so that
 * what is heard comes round again only after minutes, never on a beat.
 */
export const ROAR_SECONDS = 12;
export const BABBLE_SECONDS = 7.7;
/** How long each loop's end fades into its start, so that it wraps without a seam. */
const SEAM = 2;

/** `x`, `seconds` of it, its last `SEAM` faded into its first, equal in power: it loops with no seam. */
function seamless(x: Float32Array, seconds: number): Float32Array {
  const len = Math.round(seconds * RATE);
  const f = x.length - len;
  const out = x.slice(0, len);
  for (let i = 0; i < f; i++) {
    const t = ((i / f) * Math.PI) / 2;
    out[i] = x[i] * Math.sin(t) + x[len + i] * Math.cos(t);
  }
  return out;
}

/** `buf` at an RMS of `db` (dBFS). */
function rms(buf: Float32Array, db: number): Float32Array {
  let sum = 0;
  for (const v of buf) sum += v * v;
  const k = sum > 0 ? Math.pow(10, db / 20) / Math.sqrt(sum / buf.length) : 0;
  return buf.map((v) => v * k);
}

/** A normal deviate from `r`. */
const gauss = (r: () => number): number => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * A slow wandering, `n` samples of it: a random walk drawn back to 0 over `tau` seconds (Ornstein-Uhlenbeck), of
 * spread 1 - as water's sound swells and eases, never in a rhythm.
 */
function wander(r: () => number, n: number, tau: number): Float32Array {
  const step = 64;
  const a = Math.exp(-step / RATE / tau);
  const b = Math.sqrt(1 - a * a);
  const out = new Float32Array(n);
  let x = gauss(r);
  for (let i = 0; i < n; i += step) {
    const next = a * x + b * gauss(r);
    for (let j = 0; j < step && i + j < n; j++) out[i + j] = x + ((next - x) * j) / step;
    x = next;
  }
  return out;
}

/** A level in dB, as a gain. */
const gainOf = (db: number): number => Math.pow(10, db / 20);

/**
 * The waterfall's roar, a loop: pink noise, soft above 3 kHz, over a deep brown-noise body and a faint high spray -
 * each swelling and easing a dB or so of its own accord, over seconds.
 */
export function waterfallRoar(r: () => number): Float32Array {
  const n = Math.round((ROAR_SECONDS + SEAM) * RATE);
  const pink = new Float32Array(n);
  const brown = new Float32Array(n);
  let [b0, b1, b2, br] = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = b0 + b1 + b2 + w * 0.1848;
    br = 0.998 * br + w * 0.05;
    brown[i] = br;
  }
  const roar = rms(highpass(lowpass(lowpass(pink, 3000), 7000), 60), 0);
  const body = rms(highpass(lowpass(brown, 500), 40), 0);
  const spray = rms(lowpass(highpass(pink, 3000), 9000), 0);
  const [swell, ripple, deep, bright] = [wander(r, n, 3), wander(r, n, 0.7), wander(r, n, 4), wander(r, n, 5)];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++)
    out[i] =
      roar[i] * gainOf(1.2 * swell[i] + 0.5 * ripple[i]) +
      body[i] * 0.7 * gainOf(1.5 * deep[i]) +
      spray[i] * 0.2 * gainOf(2 * bright[i] + 0.5 * ripple[i]);
  return rms(seamless(out, ROAR_SECONDS), -34);
}

/**
 * The waterfall's babble, a loop: the water's bubbles - a few dozen a second, at random, each a soft note of 300 to
 * 1500 Hz rising a little as it dies away in a few hundredths of a second, most of them faint - heard under the roar.
 */
export function waterfallBabble(r: () => number): Float32Array {
  const n = Math.round((BABBLE_SECONDS + SEAM) * RATE);
  const out = new Float32Array(n);
  for (let t = 0; ; ) {
    t += -Math.log(1 - r()) / 45;
    const at = Math.round(t * RATE);
    if (at >= n) break;
    const f0 = 300 * Math.pow(2, r() * 2.3);
    const tau = 0.006 + r() * 0.018;
    const amp = Math.pow(0.2 + 0.8 * r(), 2);
    const len = Math.min(n - at, Math.round(tau * 5 * RATE));
    let phase = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / RATE;
      phase += (2 * Math.PI * f0 * (1 + 0.3 * (1 - Math.exp(-tt / tau)))) / RATE;
      out[at + k] += amp * (1 - Math.exp(-tt / 0.0015)) * Math.exp(-tt / tau) * Math.sin(phase);
    }
  }
  return rms(seamless(highpass(lowpass(out, 2500), 150), BABBLE_SECONDS), -48);
}

/**
 * How loud a waterfall is `d2` squares off (squared, as frame.ts ambientSound measures it): full beside it, easing
 * away to about a third at the edge of hearing (7 squares).
 */
export function waterfallLevel(d2: number): number {
  return gainOf(-1.4 * Math.max(0, Math.sqrt(d2) - 1));
}

/**
 * A fountain, near it (ui/sound.ts plays it on and on as a waterfall's): a gentle splash of `SPLASH_SECONDS` and its
 * droplets, `DROPLETS_SECONDS` - a small water's, quieter than a waterfall's and heard only close by.
 */
export const SPLASH_SECONDS = 9.3;
export const DROPLETS_SECONDS = 6.1;

/**
 * The fountain's splash, a loop: water falling into its basin - pink noise from 400 Hz to 3 kHz, no deep body, soft
 * above - swelling and easing a dB or two of its own accord.
 */
export function fountainSplash(r: () => number): Float32Array {
  const n = Math.round((SPLASH_SECONDS + SEAM) * RATE);
  const pink = new Float32Array(n);
  let [b0, b1, b2] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = b0 + b1 + b2 + w * 0.1848;
  }
  const splash = rms(highpass(highpass(lowpass(lowpass(pink, 3000), 4500), 400), 300), 0);
  const [swell, ripple] = [wander(r, n, 1.6), wander(r, n, 0.35)];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = splash[i] * gainOf(1.4 * swell[i] + 0.7 * ripple[i]);
  return rms(seamless(out, SPLASH_SECONDS), -42);
}

/**
 * The fountain's droplets, a loop: drops falling into the basin - a dozen or so a second, at random, each a soft note
 * of 500 to 2000 Hz rising as it dies away in a hundredth of a second, most of them faint.
 */
export function fountainDroplets(r: () => number): Float32Array {
  const n = Math.round((DROPLETS_SECONDS + SEAM) * RATE);
  const out = new Float32Array(n);
  for (let t = 0; ; ) {
    t += -Math.log(1 - r()) / 14;
    const at = Math.round(t * RATE);
    if (at >= n) break;
    const f0 = 500 * Math.pow(2, r() * 2);
    const tau = 0.004 + r() * 0.01;
    const amp = Math.pow(0.15 + 0.85 * r(), 2);
    const len = Math.min(n - at, Math.round(tau * 5 * RATE));
    let phase = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / RATE;
      phase += (2 * Math.PI * f0 * (1 + 0.5 * (1 - Math.exp(-tt / tau)))) / RATE;
      out[at + k] += amp * (1 - Math.exp(-tt / 0.001)) * Math.exp(-tt / tau) * Math.sin(phase);
    }
  }
  return rms(seamless(highpass(lowpass(out, 3000), 300), DROPLETS_SECONDS), -50);
}

/**
 * How loud a fountain is `d2` squares off (squared, as frame.ts ambientSound measures it): full beside it, falling
 * away faster than a waterfall, to under a tenth at the edge of hearing.
 */
export function fountainLevel(d2: number): number {
  return gainOf(-3.5 * Math.max(0, Math.sqrt(d2) - 1));
}

/** A few seconds of two loops together, as heard beside them, faded in and out: what a single play of water sounds like. */
function waterPlay(a: Float32Array, b: Float32Array): Float32Array {
  const n = 4 * RATE;
  const fade = 0.5 * RATE;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] + b[i]) * Math.min(1, i / fade, (n - 1 - i) / fade);
  return out;
}

export function u3Effect(name: string, k = 1, circle = 1, r: () => number = () => 0.5): Float32Array | null {
  switch (name) {
    case 'Step':
      return peak(impact(140 * k, 0.03, 0.14, 700, 0x0f0f), -20);
    case 'Bump':
      return peak(impact(100 * k, 0.04, 0.2, 600), -14);
    case 'Error1':
      return peak(tone(0.16, glide(440 * k, 330 * k, 0.06), 'tri', perc(0.04, 0.16)), -14);
    case 'Error2':
      return peak(tone(0.18, glide(330 * k, 247 * k, 0.06), 'tri', perc(0.045, 0.18)), -14);
    case 'Swish':
      return peak(swing(300 * k, 0x2345), -16);
    case 'Hit':
      return peak(blow(210 * k, 0.035, 0.4, 0x7b7b), -10);
    case 'Shoot':
      return peak(
        mix(tone(0.25, glide(900 * k, 380 * k, 0.15), 'tri', perc(0.08, 0.25)), lowpass(noise(0.08, 9000, perc(0.03, 0.08)), 2000)),
        -12,
      );
    case 'FailedSpell':
      return peak(seq(tone(0.09, 466, 'p50', hold(0.09)), tone(0.16, glide(440, 220, 0.16), 'p50', ad(0.003, 0.16))), -14);
    case 'Spell':
      return peak(spell(circle, r), -12);
    case 'MonsterSpell':
      // Low and minor: a diminished figure falling over a triangle's growl.
      return peak(mix(run([57, 54, 51, 48, 45], 0.07, 'p25'), [tone(0.5, vib(55, 0.03, 7), 'tri', ad(0.02, 0.5, 0.02)), 0.05]), -12);
    case 'Moongate':
      // Eerie, not a jingle: two voices wavering apart and back, a shimmer swelling behind them, a low hum.
      return peak(
        mix(
          tone(
            1.1,
            (t) => midi(69) * (1 + 0.04 * Math.sin(2 * Math.PI * 1.3 * t)) * (1 + 0.15 * Math.sin((Math.PI * t) / 1.1)),
            'tri',
            ad(0.25, 1.1, 0.02),
          ),
          at(
            tone(
              1.1,
              (t) => midi(64) * (1 - 0.035 * Math.sin(2 * Math.PI * 1.7 * t)) * (1 + 0.15 * Math.sin((Math.PI * t) / 1.1)),
              'tri',
              ad(0.3, 1.1, 0.02),
            ),
            0.8,
          ),
          at(sweepLow(noise(1.1, 14000, ad(0.4, 1.1, 0.02), 0x4411), 1500, 5000), 0.35),
          at(tone(1.1, 55, 'tri', ad(0.3, 1.1, 0.02)), 0.4),
        ),
        -13,
      );
    case 'CombatVictory':
      return peak(fanfare([67, 71, 74, 79, 83], 0.1, 0.45), -10);
    case 'ExpLevelUp':
      return peak(fanfare([62, 66, 69, 74], 0.12, 0.5), -10);
    case 'Sink':
      return peak(mix(tone(1.2, glide(330, 55, 1.2), 'p50', ad(0.01, 1.2, 0.02)), noise(1.0, glide(1500, 150, 1.0), ad(0.1, 1.0))), -12);
    case 'ForceField':
      return peak(tone(0.12, vib(160, 0.15, 55), 'p12', hold(0.12)), -16);
    // A door (the port's): the latch's click, then a soft wooden knock as it swings - no creak, for a sound heard
    // at every door in town. Opening is the longer and louder; closing is the same, quicker and quieter.
    case 'DoorOpen':
      return peak(mix(latch(0.03), [scaled(knock(0.2), 0.8), 0.12]), -13);
    case 'DoorClose':
      return peak(mix(latch(0.02), [scaled(knock(0.12), 0.8), 0.09]), -16);
    // A fight's quieter moments, where the DOS game used its vanishing sweep for all of them: low, and dark.
    case 'Graze':
      // A blow that glances off: a short, muffled scuff, like steel sliding off leather.
      return peak(
        mix(lowpass(noise(0.12, 3000, perc(0.04, 0.12), 0x6d6d), 500), [
          scaled(lowpass(noise(0.08, 2000, perc(0.02, 0.08), 0x7e7e), 350), 0.6),
          0.03,
        ]),
        -21,
      );
    case 'Withdraw': {
      // One leaving the field - a monster fleeing, a member stepping off it, the party gone: a faint, low whoosh
      // over a soft hum.
      const dur = 0.2;
      const swell: Curve = (t) => (t < 0.06 ? t / 0.06 : Math.max(0, 1 - (t - 0.06) / (dur - 0.06))) ** 1.5;
      return peak(
        mix(
          sweepLow(noise(dur, 3500, swell, 0x8f8f), 600, 240),
          scaled(
            tone(
              0.18,
              (t) => 95 - 30 * t,
              'sine',
              (t) => swell(t * (dur / 0.18)),
            ),
            0.35,
          ),
        ),
        -23,
      );
    }
    case 'DraggedUnder': {
      // Pulled below the water: a low, breathy swoosh, rising and falling as it goes.
      const dur = 0.22;
      const swell: Curve = (t) => (t < 0.08 ? t / 0.08 : Math.max(0, 1 - (t - 0.08) / (dur - 0.08))) ** 1.5;
      const src = noise(dur, 4000, swell, 0x5c5c);
      const out = new Float32Array(src.length);
      let y = 0;
      for (let i = 0; i < src.length; i++) {
        const hz = 250 + 450 * Math.sin((Math.PI * i) / RATE / dur);
        y += (1 - Math.exp((-2 * Math.PI * hz) / RATE)) * (src[i] - y);
        out[i] = y;
      }
      return peak(out, -21);
    }
    // Magic undone, where the DOS game sounded its vanishing: a ring lost, or a thing unmade by Negate Matter; and,
    // slower, one absorbed by the Mirror of Truth.
    case 'Dissolve':
      return peak(dissolve(0.6), -15);
    case 'Absorbed':
      return peak(dissolve(0.9), -16);
    case 'Rest':
      return rest(0.001);
    // Where the DOS game is silent, or one sound served two things (game/cues.ts).
    case 'HorseWalk':
      return peak(seq(impact(230 * k, 0.025, 0.1, 900, 0x1e1e), rest(0.06), impact(190 * k, 0.025, 0.12, 900, 0x2d2d)), -18);
    case 'MountHorse':
      return peak(run([55, 62], 0.12, 'p25'), -14);
    case 'Attack':
      return peak(blow(160 * k, 0.04, 0.45, 0x1234), -11);
    case 'Ouch':
      return peak(tone(0.22, glide(520, 200, 0.12), 'tri', perc(0.06, 0.22)), -12);
    case 'Immolate':
      return peak(mix(noise(0.5, glide(400, 6000, 0.3), ad(0.02, 0.5)), tone(0.5, glide(80, 40, 0.5), 'tri', ad(0.01, 0.5))), -10);
    case 'Alarm': {
      // The guards called: glass breaking - a bright burst and shards tinkling down, each a clash of partials a
      // semitone and a tritone apart - then a quick muttered curse: four clipped notes tumbling, bent and out of key.
      const shards = [0, 0.03, 0.07, 0.1, 0.15, 0.19, 0.24, 0.3].map((t0, i): [Float32Array, number] => {
        const f = 2400 + ((i * 1237) % 2600);
        const d = 0.05 + (i % 3) * 0.015;
        return [
          at(
            mix(
              tone(d, f, 'tri', perc(0.02, d)),
              at(tone(d, f * 1.06, 'tri', perc(0.015, d)), 0.8),
              at(tone(d, f * 1.41, 'p12', perc(0.01, d)), 0.3),
            ),
            0.3 - i * 0.025,
          ),
          t0 + 0.01,
        ];
      });
      const curse = (
        [
          [63, 0.04],
          [62, 0.035],
          [57, 0.035],
          [56, 0.07],
        ] as [number, number][]
      ).map(([n, d], i, all): [Float32Array, number] => [
        lowpass(
          tone(d, glide(midi(n) * 1.05, midi(n) * 0.97, d), 'p25', (t) => hold(d, 0.004)(t) * (i === 3 ? Math.pow(0.1, t / d) : 1)),
          2600,
        ),
        0.36 + all.slice(0, i).reduce((sum, [, x]) => sum + x, 0),
      ]);
      return peak(
        mix(
          highpass(noise(0.3, 20000, perc(0.035, 0.3), 0x6161), 2500),
          ...shards,
          ...curse.map(([b, t]): [Float32Array, number] => [at(b, 0.7), t]),
        ),
        -14,
      );
    }
    case 'DeathMale':
      // A member falls: a lament, the minor tetrachord falling to the tonic below, the last note sagging.
      return peak(lament([57, 55, 53, 52, 45], 0.15, 0.45), -11);
    case 'DeathFemale':
      return peak(lament([69, 67, 65, 64, 57], 0.15, 0.45), -11);
    case 'BigDeath':
      // The party is dead: a slow D minor lament over i, iv, V and i, a low rumble under it, fading dark.
      return peak(
        mix(
          lament([62, 60, 58, 57, 58, 57, 55, 50], 0.22, 0.7),
          seq(
            swell([50, 53, 57], 0.66, 'tri'),
            swell([43, 50, 55, 58], 0.44, 'tri'),
            swell([45, 49, 52, 57], 0.44, 'tri'),
            swell([38, 50, 53, 57], 0.9, 'tri'),
          ),
          at(rumble(2.4, 0x7171), 0.25),
        ),
        -10,
      );
    case 'CombatStart':
      return peak(fanfare([57, 57, 60, 64], 0.11, 0.3), -10);
    case 'Invocation':
      return peak(chord([48, 55, 60, 64], 1.1, 'p25', ad(0.35, 1.1, 0.02)), -13);
    case 'TorchIgnite':
      return peak(mix(noise(0.45, glide(300, 5000, 0.2), ad(0.02, 0.45)), tone(0.3, glide(180, 420, 0.3), 'tri', ad(0.05, 0.3))), -14);
    case 'Upwards':
    case 'Downwards': {
      // Rungs: a soft knock under each note, the notes a gentle triangle run (a pentatonic step at a time).
      const notes = name === 'Upwards' ? [55, 57, 59, 62, 64] : [64, 62, 59, 57, 55];
      const step = 0.085;
      const rung = (n: number, i: number): Float32Array =>
        mix(
          tone(step * 1.6, midi(n), 'tri', ad(0.004, step * 1.6, 0.03)),
          at(tone(step * 1.6, midi(n + 12), 'p12', ad(0.004, step, 0.02)), 0.18),
          at(thud(150 - i * 6, 0.02, 0.08), 0.5),
        );
      return peak(mix(...notes.map((n, i): [Float32Array, number] => [rung(n, i), i * step])), -13);
    }
    // Blows and missiles (the effects every fight repeats: short, low-passed, percussive).
    case 'HitMember':
      // A blow landing on the party: a crisp thump, a little brighter than a member hurt.
      return peak(mix(thud(230 * k, 0.025, 0.2), at(tick(0.04, 1400, 0x3a3a, 4000), 0.55)), -14);
    case 'HitFoe':
      // A blow landing on a monster: duller and meatier.
      return peak(mix(thud(150 * k, 0.035, 0.26), at(tick(0.05, 800, 0x5c5c, 2500), 0.5)), -13);
    case 'FoeShoot':
      // A monster's missile: rougher and lower than the party's.
      return peak(
        mix(
          tone(0.22, glide(520 * k, 190 * k, 0.16), 'p50', perc(0.07, 0.22)),
          at(lowpass(noise(0.14, 3500, perc(0.05, 0.14), 0x1717), 1300), 0.9),
        ),
        -14,
      );
    case 'Cannon':
      // A boom: a heavy drop, the report's crack, the smoke rolling off.
      return peak(
        echo(
          mix(
            tone(0.7, glide(95, 32, 0.5), 'tri', perc(0.18, 0.7)),
            at(lowpass(noise(0.12, 6000, perc(0.03, 0.12), 0x2a2a), 2500), 0.8),
            at(rumble(0.7, 0x2b2b), 0.8),
          ),
          0.16,
          0.3,
          2,
        ),
        -9,
      );
    // Footsteps: the ultima3 step, each foot a little different; below, stone and an echo, fading down the passage.
    case 'StepLeft':
      return peak(footfall(135 * k, 680, 0, 0x0f0f), -20);
    case 'StepRight':
      return peak(footfall(150 * k, 760, 0, 0x0e0e), -20);
    case 'DungeonStep': {
      // circle: 1 the step, 2-4 its echoes, each lower, darker and fainter.
      const d = circle - 1;
      return peak(footfall((128 - d * 7) * k, 900 - d * 110, 0.28 - d * 0.06, 0x0d0d + d), -20 - d);
    }
    // Water: soft, moving, and never static (heard every turn near them). A waterfall is a steady roar with a babble
    // under it, a few seconds of it here; near one, ui/sound.ts plays its loops on and on (waterfallRoar).
    case 'Waterfall':
      return waterPlay(waterfallRoar(r), waterfallBabble(r));
    case 'Fountain':
      return waterPlay(fountainSplash(r), fountainDroplets(r));
    // The healer's light (and the menus' back-out note): soft triangle chords, rising, in a happy key.
    case 'HealRise':
      return peak(
        mix(
          ...[60, 64, 67].map((n, i): [Float32Array, number] => [
            tone(0.5 - i * 0.07, midi(n), 'tri', ad(0.02, 0.5 - i * 0.07, 0.02)),
            i * 0.07,
          ]),
        ),
        -17,
      );
    case 'HealTurn':
      return peak(
        mix(
          ...[65, 69, 72].map((n, i): [Float32Array, number] => [
            tone(0.5 - i * 0.07, midi(n), 'tri', ad(0.02, 0.5 - i * 0.07, 0.02)),
            i * 0.07,
          ]),
        ),
        -17,
      );
    case 'HealSettle':
      return peak(mix(tone(0.12, midi(74), 'tri', ad(0.01, 0.12, 0.05)), [tone(0.22, midi(67), 'tri', ad(0.01, 0.22, 0.02)), 0.09]), -18);
    // Earth, fire and lightning.
    case 'Thunder':
      // The earthquake: a thunderbolt's crack, and the ground rolling after it.
      return peak(mix(crack(0x7171), [echo(rumble(1.0, 0x7272), 0.22, 0.35, 2), 0.03]), -9);
    case 'Shock':
      // An electric field: a crackling burst, buzzing, snapping off.
      return peak(
        mix(
          noise(0.35, 14000, (t) => ad(0.005, 0.35, 0.02)(t) * (Math.sin(2 * Math.PI * 47 * t) > 0.2 ? 1 : 0.15), 0x8181),
          at(tone(0.35, 120, 'p12', ad(0.005, 0.35, 0.02)), 0.5),
          at(tone(0.12, glide(2200, 400, 0.12), 'p12', perc(0.04, 0.12)), 0.5),
        ),
        -13,
      );
    case 'Trapdoor':
      // The trapdoor: its latch and swing, and the fall beginning under it.
      return peak(
        mix(
          u3Effect('DoorOpen')!,
          [tone(0.9, glide(900, 110, 0.9), 'p25', ad(0.01, 0.9)), 0.12],
          [at(noise(0.8, glide(1500, 150, 0.8), ad(0.1, 0.8)), 0.6), 0.14],
        ),
        -12,
      );
    case 'Whirlpool':
      // The whirlpool (and a ship going down): the concept kept, a swirl falling - shorter.
      return peak(
        mix(
          tone(1.3, (t) => (660 - 480 * (t / 1.3)) * (1 + 0.08 * Math.sin(2 * Math.PI * 7 * t)), 'p25', ad(0.05, 1.3, 0.02)),
          at(sweepLow(noise(1.3, 3000, ad(0.2, 1.3), 0x9191), 1800, 200), 0.6),
        ),
        -13,
      );
    // Creatures and dark magic: low, minor.
    case 'Possess':
      // Possessed: two low voices a semitone apart, beating, wavering.
      return peak(
        mix(
          tone(0.8, vib(midi(45), 0.02, 4), 'tri', ad(0.1, 0.8, 0.02)),
          at(tone(0.8, vib(midi(46), 0.02, 3), 'p25', ad(0.15, 0.8, 0.02)), 0.4),
        ),
        -14,
      );
    case 'GateIn':
      // A daemon gated in: a lightning crack, then a minor chord swelling from below.
      return peak(mix(crack(0xa1a1), [swell([45, 48, 52, 57], 0.9), 0.06]), -12);
    case 'Summon':
      // A creature summoned for the party: the same crack, softer, and the chord major.
      return peak(mix(at(crack(0xa2a2), 0.6), [swell([48, 52, 55, 60], 0.9), 0.06]), -12);
    case 'Regurgitate':
      // Wet and organic: gulps of low noise, and bubbling blips falling.
      return peak(
        mix(
          lowpass(
            noise(0.5, 1800, (t) => ad(0.01, 0.5, 0.05)(t) * Math.abs(Math.sin(2 * Math.PI * 9 * t)), 0xb1b1),
            500,
          ),
          ...[0, 0.13, 0.27].map((t0, i): [Float32Array, number] => [tone(0.1, glide(320 - i * 40, 110, 0.1), 'tri', perc(0.04, 0.1)), t0]),
        ),
        -14,
      );
    case 'Absorb': {
      // Magic swallowed: a low growl, fluttering and sinking, smothered as something closes over it.
      const dur = 0.75;
      const flutter = (t: number): number => ad(0.03, dur, 0.02)(t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 27 * t));
      return peak(
        sweepLow(
          mix(
            tone(dur, (t) => glide(95, 58, dur)(t) * (1 + 0.03 * Math.sin(2 * Math.PI * 11 * t)), 'saw', flutter),
            at(tone(dur, glide(97, 59, dur), 'p25', flutter), 0.5),
            at(lowpass(noise(dur, 3000, flutter, 0xb2b2), 900), 0.5),
          ),
          2400,
          110,
        ),
        -13,
      );
    }
    // The regalia and the story, after the game's own music.
    case 'SceptreWield':
      // Rule Britannia's opening, quick, warm rather than bright, over a low shimmer - and a little echo.
      return peak(
        echo(
          mix(
            lowpass(tune(BRITANNIA.map((n): [number, number] => [n, 0.07])), 2200),
            [run([41, 48, 53], 0.18, 'tri', 1), 0],
            at(sweepLow(noise(0.6, 10000, ad(0.2, 0.6, 0.02), 0xc1c1), 1500, 3000), 0.1),
          ),
          0.13,
          0.28,
          2,
        ),
        -12,
      );
    case 'SceptreReclaimed':
      // The Sceptre taken back: Rule Britannia's close, falling home.
      return peak(
        tune([
          [72, 0.1],
          [69, 0.1],
          [70, 0.1],
          [67, 0.12],
          [65, 0.3],
        ]),
        -12,
      );
    case 'Artifact':
      // Old and grand: slow organ chords, F then B-flat then F.
      return peak(
        seq(swell([53, 57, 60, 65], 0.45, 'p50'), swell([58, 62, 65, 70], 0.45, 'p50'), swell([53, 57, 60, 65, 69], 0.7, 'p50')),
        -12,
      );
    case 'BlackthornAppears':
      // Blackthorn's theme's opening, low and heavy, into a held G minor chord.
      return peak(seq(tune(BLACKTHORN.slice(0, 3).map((n): [number, number] => [n - 12, 0.14])), swell([43, 46, 50, 55], 0.6)), -11);
    case 'ShadowlordAppears':
      // A Shadowlord: Blackthorn's theme turned darker - lower, slower, the voice wavering.
      return peak(
        mix(
          tune(
            BLACKTHORN.map((n): [number, number] => [n - 17, 0.14]),
            'p25',
            0.8,
          ),
          at(tone(0.85, vib(49, 0.02, 5), 'tri', ad(0.1, 0.85, 0.02)), 0.5),
        ),
        -12,
      );
    case 'AirOfEvil':
      // An air of evil: Monarch's rise in F minor, slow and hollow - then falling back, the last note sagging.
      return peak(
        seq(
          tune(
            [
              [48, 0.14],
              [53, 0.14],
              [55, 0.14],
              [56, 0.14],
              [58, 0.14],
              [55, 0.14],
            ],
            'tri',
            0.6,
          ),
          mix(
            tone(0.4, glide(midi(53), midi(52), 0.4), 'tri', ad(0.01, 0.4, 0.03)),
            at(tone(0.4, glide(midi(41), midi(40), 0.4), 'tri', ad(0.01, 0.4, 0.03)), 0.6),
          ),
        ),
        -13,
      );
    case 'BlackthornNote': {
      // Blackthorn's theme a note a call (the game plays six): `circle` the note (1-6).
      const n = BLACKTHORN[Math.max(0, Math.min(5, circle - 1))] - 12;
      return peak(warm(0.22, n, ad(0.01, 0.22, 0.03)), -13);
    }
    case 'GemShard':
      // An evil shard held up: the Underworld's tune, dark, over a cold shimmer - under a second.
      return peak(
        mix(
          tune(
            [
              [59, 0.12],
              [66, 0.12],
              [66, 0.12],
              [67, 0.12],
              [66, 0.35],
            ],
            'p25',
            0.6,
          ),
          at(sweepLow(noise(0.85, 12000, ad(0.2, 0.85, 0.02), 0xd1d1), 2000, 4000), 0.25),
        ),
        -12,
      );
    case 'ShrineVision':
      // A shrine's vision: a soft shimmer on the Stones' A minor, warm and short.
      return peak(mix(swell([57, 60, 64], 1.2, 'tri'), at(sweepLow(noise(1.2, 9000, ad(0.4, 1.2, 0.02), 0xe1e1), 800, 2500), 0.2)), -15);
    case 'ShrineQuest':
      return peak(mix(swell([55, 59, 62], 1.0, 'tri'), at(sweepLow(noise(1.0, 9000, ad(0.35, 1.0, 0.02), 0xe2e2), 800, 2500), 0.2)), -15);
    case 'Lullaby': {
      // Put to sleep: a quiet lullaby on a triangle, slowing as it falls, over a soft drone - and drowsing off, the
      // last notes lower, slower and fainter, the light closing, until nothing is left.
      const notes: [number, number, number][] = [
        [67, 0.16, 1],
        [64, 0.16, 0.95],
        [65, 0.18, 0.85],
        [62, 0.2, 0.75],
        [64, 0.22, 0.6],
        [60, 0.28, 0.45],
        [55, 0.5, 0.28],
      ];
      let t = 0;
      const parts = notes.map(([n, d, v]): [Float32Array, number] => {
        const part: [Float32Array, number] = [at(lowpass(warm(d * 1.3, n, ad(0.01, d * 1.3, 0.02), 'p25', 0.5), 1800), v), t];
        t += d;
        return part;
      });
      return peak(fit(sweepLow(mix(...parts, at(chord([48, 55], 1.69, 'tri', ad(0.3, 1.69, 0.005)), 0.4)), 2500, 400), 1.69, 0.3), -20);
    }
    case 'IntroHit':
      // The opening story's blow: the hit, longer and deeper, a soft minor chord rising under it for the drama.
      return peak(
        mix(thud(85, 0.07, 0.55), sweepLow(noise(0.3, 12000, perc(0.07, 0.3), 0x8181), 3000, 220), [
          at(swell([45, 48, 52], 1.2, 'tri'), 0.45),
          0.05,
        ]),
        -12,
      );
    case 'Revive':
      // The endgame's healing: a sparkle rising into Rule Britannia's opening.
      return peak(mix(run([72, 76, 79, 84], 0.05, 'p12'), [tune(BRITANNIA.map((n): [number, number] => [n, 0.1])), 0.18]), -12);
    case 'Ending':
      // The last sound: Rule Britannia's opening over F, B-flat, C, F.
      return peak(
        mix(
          tune(BRITANNIA.map((n): [number, number] => [n + 12, 0.16])),
          seq(
            swell([53, 57, 60], 0.32, 'tri'),
            swell([58, 62, 65], 0.32, 'tri'),
            swell([55, 60, 64], 0.32, 'tri'),
            swell([53, 57, 60, 65], 0.9, 'tri'),
          ),
        ),
        -11,
      );
  }
  return null;
}
