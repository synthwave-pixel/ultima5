/**
 * speaker.ts
 *
 * The PC speaker as the DOS game drove it, rendered to samples: the four
 * routines of ULTIMA.EXE (2192 pulse, 223c noise, 22c0 tone, 43ae sweep)
 * run as their loops ran, timed as DOSBox runs them at its default speed
 * (the machine dos.zone emulates), so the Original sound is the game's own.
 *
 * Every routine is a busy loop paced by D_5356, the count ULTIMA_11b4
 * takes at start-up: a three-instruction loop counted through one timer
 * tick (54.9 ms), times 18/750. At 3000 instructions a millisecond that is
 * 1318. The waits below are that count's loops, two instructions each.
 *
 * - Pulse: the PIT sounds 19.9 kHz (divisor 60), too high to hear, and the
 *   loop gates it: a phase adds `freq` each pass and the speaker is on
 *   while the phase is above a threshold that starts at `width` and moves
 *   by `inc` a pass, both 16-bit. A pass waits `delay` times D_5356/24.
 * - Noise: a new pitch every `rate` times D_5356/16 loops, from 100 Hz to
 *   `limit`, drawn from a 16-bit generator that runs on across calls.
 * - Tone: the PIT at `freq` for `dur` times D_5356 loops.
 * - Sweep: tones stepped from one pitch to another, a step lasting `step`
 *   times D_5356 loops.
 */

/** DOSBox's default speed: instructions a millisecond (cycles=3000). */
export const CYCLES_PER_MS = 3000;
/** ULTIMA_11b4's count at that speed. */
export const CALIBRATION = Math.floor(((CYCLES_PER_MS * 54.925) / 3) * (18 / 750));
/** The PIT's input clock. */
const PIT_HZ = 1193182;

const us = (instructions: number): number => (instructions / CYCLES_PER_MS) * 1000;

/** Microseconds of one pass of the pulse loop (21f1 to 222c: seventeen instructions and the wait). */
export function pulsePassUs(delay: number): number {
  const d = CALIBRATION < 100 ? 0 : Math.floor(CALIBRATION / 24);
  return us(17 + (d ? delay * (2 * d + 4) : 0));
}

/** Microseconds of one `rate` step of the noise (2255 to 22b0). */
export function noiseStepUs(rate: number): number {
  return us(30 + rate * (2 * (CALIBRATION >> 4) + 4));
}

/** Microseconds of a wait of `n` units (ULTIMA_20c8 with its shift of 0). */
export function waitUs(n: number): number {
  return us(n * (2 * CALIBRATION + 4));
}

/** The sounding frequency of the PIT set for `freq` Hz (its divisor is 0x1234de / freq). */
export function pitHz(freq: number): number {
  const f = Math.max(19, freq & 0xffff);
  return PIT_HZ / Math.max(1, Math.floor(0x1234de / f));
}

/** A speaker program: its level (0 or 1, or 0.5 for the gated carrier) over time, as runs. */
interface Run {
  /** Seconds. */
  length: number;
  /** A square wave's frequency, or 0 for a steady level. */
  hz: number;
  level: number;
}

let noiseSeed = 0;

/** ULTIMA_2192. */
export function pulseRuns(freq: number, delay: number, dur: number, width: number, inc: number): Run[] {
  const pass = pulsePassUs(delay) / 1e6;
  const out: Run[] = [];
  let phase = 0;
  let threshold = width & 0xffff;
  for (let i = 0; i < (dur & 0xffff); i++) {
    phase = (phase + freq) & 0xffff;
    const on = phase > threshold ? 0.5 : 0;
    const last = out[out.length - 1];
    if (last && last.level === on) last.length += pass;
    else out.push({ length: pass, hz: 0, level: on });
    threshold = (threshold + inc) & 0xffff;
  }
  return out;
}

/** ULTIMA_223c. */
export function noiseRuns(rate: number, dur: number, limit: number): Run[] {
  const step = noiseStepUs(rate) / 1e6;
  const out: Run[] = [];
  let total = 0;
  do {
    noiseSeed = (noiseSeed + 0x9248) & 0xffff;
    noiseSeed = ((noiseSeed >> 3) | (noiseSeed << 13)) & 0xffff;
    noiseSeed = ((noiseSeed ^ 0x9248) + 0x11) & 0xffff;
    const span = (limit - 100 + 1) & 0xffff;
    const pick = ((span === 0 ? noiseSeed : noiseSeed % span) + 100) & 0xffff;
    out.push({ length: step, hz: pitHz(pick), level: 1 });
    total = (total + rate) & 0xffff;
  } while ((total << 16) >> 16 < (dur << 16) >> 16);
  return out;
}

/** ULTIMA_22c0. */
export function toneRuns(freq: number, dur: number): Run[] {
  return [{ length: waitUs(dur) / 1e6, hz: pitHz(freq), level: 1 }];
}

/** ULTIMA_43ae: its step is the low sixteen bits of (to - from) * step, over dur. */
export function sweepRuns(from: number, to: number, step: number, dur: number): Run[] {
  const s16 = (v: number): number => (v << 16) >> 16;
  const inc = dur === 0 ? 0 : Math.trunc(s16((to - from) * step) / dur);
  const out: Run[] = [];
  let f = from;
  for (let t = 0; t < dur; t += step) {
    out.push({ length: waitUs(step) / 1e6, hz: pitHz(f), level: 1 });
    f = s16(f + inc);
  }
  return out;
}

/** The length of a program, seconds. */
export function runsLength(runs: Run[]): number {
  let t = 0;
  for (const r of runs) t += r.length;
  return t;
}

/**
 * The program as samples at `rate`: each sample the average of the
 * speaker's level over its span (so edges fall between samples as they
 * did), then the cone's response: the steady part removed and the top
 * softened, as a small speaker in a PC case gave it.
 */
export function renderRuns(runs: Run[], rate: number): Float32Array {
  const n = Math.ceil(runsLength(runs) * rate);
  const out = new Float32Array(n);
  const OVER = 8;
  const dt = 1 / (rate * OVER);
  let t = 0;
  let r = 0;
  let runEnd = runs.length ? runs[0].length : 0;
  // The PIT's square runs on through a change of count (mode 3 takes the new count at the end of a half).
  let phase = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < OVER; k++, t += dt) {
      while (r < runs.length && t >= runEnd) {
        r++;
        runEnd += r < runs.length ? runs[r].length : 0;
      }
      if (r >= runs.length) break;
      const run = runs[r];
      if (run.hz === 0) sum += run.level;
      else {
        phase = (phase + run.hz * dt) % 1;
        sum += phase < 0.5 ? run.level : 0;
      }
    }
    out[i] = sum / OVER;
  }
  // The cone: a high-pass at 40 Hz (no steady push) and a low-pass at 9 kHz.
  const hp = Math.exp((-2 * Math.PI * 40) / rate);
  const lp = 1 - Math.exp((-2 * Math.PI * 9000) / rate);
  let prevIn = 0;
  let prevHp = 0;
  let low = 0;
  for (let i = 0; i < n; i++) {
    const x = out[i];
    prevHp = hp * (prevHp + x - prevIn);
    prevIn = x;
    low += lp * (prevHp - low);
    out[i] = low;
  }
  return out;
}
