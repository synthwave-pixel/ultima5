/**
 * chip.ts
 *
 * The Standard effects: chip-tune voices (pulse, triangle and noise, as the
 * consoles of the day had) in the spirit of the originals, as the ultima3
 * port's are. Each effect takes its pitch and length from the call the game
 * made, read through the speaker's timing (speaker.ts), so a spell still
 * rises where it rose and a gate hums as long as it hummed; the voice is
 * new. The effects a turn repeats (steps, bumps, blows, blips) are quiet,
 * short, low and a little different each time; the one-off jingles stand
 * above them.
 */

import { type Effect, type Kind } from './effects.ts';
import { noiseStepUs, pitHz, pulsePassUs, waitUs } from './speaker.ts';
import { u3Effect } from './chip3.ts';

export const RATE = 44100;

/** Decibels to gain. */
const db = (d: number): number => Math.pow(10, d / 20);

/** Effects that come every turn or every blow: quiet, short, varied a little each play. */
export const REPEATED = new Set([
  'step0',
  'step1',
  'dunstep0',
  'dunstep1',
  'dunstep2',
  'dunstep3',
  'blocked',
  'denyhi',
  'denylo',
  'tickhigh',
  'ticklow',
  'attack',
  'damage',
  'foefire',
  'launch',
  'burst1',
  'burst2',
  'drip0',
  'status',
]);

/** A random source (the page's Math.random; tests pass their own). */
export type Random = () => number;

// --- Oscillators -------------------------------------------------------------------------------------

/** PolyBLEP: the step's correction near a discontinuity, so pulses do not alias. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

class Pulse {
  private phase = 0;
  next(hz: number, duty: number): number {
    const dt = Math.min(0.5, hz / RATE);
    const d = Math.min(0.5, Math.max(0.08, duty));
    let v = this.phase < d ? 1 : -1;
    v += blep(this.phase, dt);
    v -= blep((this.phase - d + 1) % 1, dt);
    this.phase = (this.phase + dt) % 1;
    return v;
  }
}

class Triangle {
  private phase = 0;
  next(hz: number): number {
    // A console's triangle: sixteen steps, the grain that makes it chip and not flute.
    const v = this.phase < 0.5 ? this.phase * 4 - 1 : 3 - this.phase * 4;
    this.phase = (this.phase + hz / RATE) % 1;
    return Math.round(v * 7.5) / 7.5;
  }
}

/** A 15-bit noise register, clocked at `hz` (the pitch of a console's noise). */
class Noise {
  private reg = 1;
  private acc = 0;
  private out = 1;
  next(hz: number): number {
    this.acc += hz / RATE;
    while (this.acc >= 1) {
      this.acc -= 1;
      const bit = (this.reg ^ (this.reg >> 1)) & 1;
      this.reg = (this.reg >> 1) | (bit << 14);
      this.out = this.reg & 1 ? 1 : -1;
    }
    return this.out;
  }
}

/** A one-pole low-pass. */
class Low {
  private y = 0;
  next(x: number, hz: number): number {
    this.y += (1 - Math.exp((-2 * Math.PI * hz) / RATE)) * (x - this.y);
    return this.y;
  }
}

// --- Envelopes ---------------------------------------------------------------------------------------

/** Attack, then hold, then an exponential fall to -60 dB over `release`; zero after `length`. */
function envelope(t: number, length: number, attack: number, release: number): number {
  if (t >= length) return 0;
  const a = attack > 0 ? Math.min(1, t / attack) : 1;
  const r = length - t < release ? Math.pow(0.001, 1 - (length - t) / release) : 1;
  return a * r;
}

/** Percussive: over in `decay` seconds (20 dB down by then), the footstep's shape. */
const hit = (t: number, decay: number): number => Math.exp((-t / decay) * 2.3);

function buffer(seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.round(seconds * RATE)));
}

/** Scale to a peak level in dBFS. */
function level(out: Float32Array, peakDb: number): Float32Array {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) {
    const k = db(peakDb) / peak;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

// --- The original's shape, read from its call ----------------------------------------------------------

/** A pulse call's pitch (Hz), length (s) and the rate its width sweeps a full turn (Hz). */
function pulseShape(args: number[]): { hz: number; length: number; pwm: number; width: number; inc: number } {
  const [freq, delay, dur, width, inc] = args;
  const pass = pulsePassUs(delay) / 1e6;
  return { hz: freq / 65536 / pass, length: dur * pass, pwm: Math.abs(inc) / 65536 / pass, width, inc };
}

// --- Voices ------------------------------------------------------------------------------------------

/** A held note: pulse whose width turns as the original's did, a little vibrato, soft ends. */
function held(hz: number, length: number, pwm: number, peak: number, vibrato = 0.004): Float32Array {
  const out = buffer(length);
  const p = new Pulse();
  const tri = new Triangle();
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const wob = 1 + vibrato * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.15);
    const duty = 0.3 + 0.18 * Math.sin(2 * Math.PI * Math.max(pwm, 0.4) * t);
    const v = 0.7 * p.next(hz * wob, duty) + 0.3 * tri.next(hz * wob * 0.5);
    out[i] = v * envelope(t, length, 0.02, Math.min(0.25, length / 3));
  }
  return level(out, peak);
}

/** A plucked note: fast attack, a fall like a string's. */
function pluck(hz: number, length: number, peak: number, bright: number): Float32Array {
  const out = buffer(length);
  const p = new Pulse();
  const tri = new Triangle();
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const duty = 0.125 + 0.2 * Math.min(1, t / length);
    const v = bright * p.next(hz, duty) + (1 - bright) * tri.next(hz);
    out[i] = v * hit(t, length * 0.45);
  }
  return level(out, peak);
}

/** A glide from one pitch to another, on a pulse. */
function glide(from: number, to: number, length: number, peak: number, duty = 0.25, curve = 1): Float32Array {
  const out = buffer(length);
  const p = new Pulse();
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const k = Math.pow(t / length, curve);
    const hz = from * Math.pow(to / from, k);
    out[i] = p.next(hz, duty) * envelope(t, length, 0.004, Math.min(0.05, length / 4));
  }
  return level(out, peak);
}

/** Noise, low-passed, its colour and loudness moving from start to end. */
function hiss(length: number, peak: number, clock: number, lowFrom: number, lowTo: number, decay = 0): Float32Array {
  const out = buffer(length);
  const n = new Noise();
  const lp = new Low();
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const k = t / length;
    const v = lp.next(n.next(clock), lowFrom * Math.pow(lowTo / lowFrom, k));
    out[i] = v * (decay ? hit(t, decay) : envelope(t, length, 0.01, Math.min(0.15, length / 3)));
  }
  return level(out, peak);
}

/** Notes picked at random from a pentatonic scale in a range, a step each: the spells' sparkle. */
function sparkle(low: number, high: number, step: number, length: number, peak: number, r: Random): Float32Array {
  const out = buffer(length + 0.12);
  const scale = [0, 2, 4, 7, 9];
  const notes: number[] = [];
  for (let m = 36; m < 110; m++) {
    const hz = 440 * Math.pow(2, (m - 69) / 12);
    if (hz >= low && hz <= Math.max(high, low * 2) && scale.includes(m % 12)) notes.push(hz);
  }
  const p = new Pulse();
  let hz = notes[0] ?? 440;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    if (i % Math.max(1, Math.round(step * RATE)) === 0 && t < length) hz = notes[Math.floor(r() * notes.length)] ?? hz;
    const inStep = (t % step) / step;
    const v = p.next(hz, 0.25) * Math.exp(-inStep * 2.5);
    // A short echo, as a console's second channel gave one.
    const echo = i > 0.09 * RATE ? out[i - Math.round(0.09 * RATE)] * 0.35 : 0;
    out[i] = v * envelope(t, length + 0.1, 0.005, 0.1) + echo;
  }
  return level(out, peak);
}

/** A little fanfare: a rising arpeggio and its chord. */
function fanfare(root: number, notes: number[], peak: number): Float32Array {
  const each = 0.07;
  const length = each * notes.length + 0.3;
  const out = buffer(length);
  const p = new Pulse();
  const tri = new Triangle();
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const k = Math.min(notes.length - 1, Math.floor(t / each));
    const hz = root * Math.pow(2, notes[k] / 12);
    out[i] = (0.75 * p.next(hz, 0.25) + 0.35 * tri.next(root / 2)) * envelope(t, length, 0.003, 0.25);
  }
  return level(out, peak);
}

// --- The effects ---------------------------------------------------------------------------------------

/**
 * The effects the two games share, by this game's name for the call (effects.ts), and the ultima3 port's name for
 * its voice (chip3.ts). A spell (spell1-8) is that port's spell, pitched by circle; its two long hums after (the
 * 'cast' family) are folded into it, and the victory tune's second part into its fanfare.
 */
export const SHARED: Record<string, string> = {
  step0: 'StepLeft',
  step1: 'StepRight',
  dunstep0: 'DungeonStep',
  dunstep1: 'DungeonStep',
  dunstep2: 'DungeonStep',
  dunstep3: 'DungeonStep',
  blocked: 'Bump',
  denyhi: 'Error1',
  denylo: 'Error2',
  attack: 'Swish',
  damage: 'Hit',
  burst1: 'HitMember',
  burst2: 'HitFoe',
  foefire: 'FoeShoot',
  launch: 'Shoot',
  cannon: 'Cannon',
  failure: 'FailedSpell',
  moongate: 'Moongate',
  victory1: 'CombatVictory',
  victory2: 'Rest',
  raise: 'ExpLevelUp',
  fall: 'Sink',
  trapfall: 'Trapdoor',
  whirl: 'Whirlpool',
  shake: 'Thunder',
  shock: 'Shock',
  watrfall: 'Waterfall',
  fountain: 'Fountain',
  shop0: 'HealRise',
  shop1: 'HealTurn',
  shop2: 'HealSettle',
  status: 'Lullaby',
  introhit: 'IntroHit',
  possess: 'Possess',
  gatein: 'GateIn',
  summon: 'Summon',
  regurgit: 'Regurgitate',
  absorb: 'Absorb',
  sceptuse: 'SceptreWield',
  sceptre: 'SceptreReclaimed',
  artifact: 'Artifact',
  shadowin: 'ShadowlordAppears',
  air: 'AirOfEvil',
  blackapp: 'BlackthornAppears',
  gemshard: 'GemShard',
  shrine1: 'ShrineVision',
  shrine2: 'ShrineQuest',
  revive: 'Revive',
  endmoon: 'Ending',
};

/**
 * Calls the Standard set folds into another's sound, so they are silent: the victory tune's last note (in its
 * fanfare), a spell's two hums (in the spell), and the second note of each of the healer's three (in its chord).
 */
export const FOLDED: Record<string, string> = { victory2: 'victory1', cast: 'spell1-8' };
const HEALER_SECONDS: number[][] = [
  [0x100e, 1, 0x57e4, 0x6b6c, -1],
  [0x11b2, 1, 40000, 40000, -1],
  [0x8fc, 1, 18000, 36000, -2],
];

/**
 * The Standard sound for a call: its effect (or null for one u5d has no
 * name for) and the call's own arguments. `r` varies the repeated ones.
 */
export function standard(effect: Effect | null, kind: Kind, args: number[], r: Random): Float32Array {
  const name = effect?.name ?? '';
  // A run's later calls (the gem's and the shrines' long sweeps) are the first call's one sound.
  if (effect?.continued) return new Float32Array(1);
  if (!effect && kind === 'pulse' && HEALER_SECONDS.some((h) => h.every((v, i) => v === args[i]))) return new Float32Array(1);
  const detune = REPEATED.has(name) ? Math.pow(2, ((r() - 0.5) * 0.8) / 12) : 1;
  const quiet = REPEATED.has(name) ? (r() - 0.5) * 3 : 0;
  // Blackthorn's six notes: his theme, a note a call.
  if (name === 'blackthorn') return u3Effect('BlackthornNote', 1, (effect?.note ?? 0) + 1) ?? new Float32Array(1);
  // What the two games share takes the ultima3 port's voice (chip3.ts); a spell by its circle, a dungeon step by
  // its echo (the step, then three echoes each fainter).
  const shared = SHARED[name] ?? (name.startsWith('spell') ? 'Spell' : name === 'cast' ? 'Rest' : undefined);
  if (shared) {
    const circle = name.startsWith('dunstep') ? Number(name.slice(-1)) + 1 : Number(name.slice(5)) || 1;
    const voice = u3Effect(shared, detune, circle, r);
    if (voice) return voice;
  }
  switch (name) {
    case 'blocked':
      return glide(115 * detune, 70 * detune, 0.08, -21 + quiet, 0.5);
    case 'denyhi':
      return glide(440 * detune, 415 * detune, 0.06, -22 + quiet, 0.25);
    case 'denylo':
      return glide(330 * detune, 311 * detune, 0.06, -22 + quiet, 0.25);
    case 'tickhigh':
      return pluck(1760 * detune, 0.02, -27 + quiet, 0);
    case 'ticklow':
      return pluck(1320 * detune, 0.02, -27 + quiet, 0);
    case 'attack':
      return hiss(0.09, -19 + quiet, 22000, 600 * detune, 2600 * detune, 0.05);
    case 'damage': {
      const a = hiss(0.12, -15 + quiet, 12000, 3000, 500, 0.05);
      const b = glide(170 * detune, 55 * detune, 0.12, -17 + quiet, 0.5);
      for (let i = 0; i < a.length; i++) a[i] += b[i] ?? 0;
      return level(a, -14 + quiet);
    }
    case 'drip0':
      return glide(1200 * detune, 2400 * detune, 0.035, -25 + quiet, 0.5, 0.5);
    case 'victory1':
      return fanfare(523, [0, 4, 7, 12], -13);
    case 'victory2':
      return fanfare(587, [0, 4, 7, 12, 16], -13);
    case 'chime':
      return pluck(pulseShape(args).hz, 0.5, -15, 0.35);
    case 'harpsichord':
      return pluck(pulseShape(args).hz, 0.6, -15, 0.8);
    case 'lute':
      return pluck(pulseShape(args).hz, 0.5, -15, 0.35);
    case 'shiphit':
      return hiss(noiseLength(args), -14, 16000, 3500, 250, noiseLength(args) / 2);
    case 'spiritin': {
      // The apparition's coming: its own note, a little lower and twice as long.
      const sp = pulseShape(args);
      return held(sp.hz * 0.8, sp.length * 2, sp.pwm, -14);
    }
  }
  if (name.startsWith('spell') && kind === 'noise') {
    const [rate, dur, limit] = args;
    return sparkle(150, limit * 1.6, noiseStepUs(rate) / 1e6, noiseLength([rate, dur, limit]), -15, r);
  }
  // The rest: the original's shape on chip voices.
  switch (kind) {
    case 'pulse': {
      const s = pulseShape(args);
      if (effect?.continued) return new Float32Array(1);
      if (effect && ['gemshard', 'shrine1', 'shrine2'].includes(effect.name)) {
        // The width sweeps up and down over the run of calls: one long shimmer for it.
        return held(s.hz, s.length * 920, 0.25, -14, 0.006);
      }
      const peak = ['cast', 'chant', 'blackthorn', 'apparition'].includes(name) ? -15 : -14;
      return held(s.hz, s.length, s.pwm, peak);
    }
    case 'noise':
      return hiss(noiseLength(args), -18, 12000, Math.max(200, args[2]), Math.max(150, args[2] / 2));
    case 'tone': {
      const [freq, dur] = args;
      return held(pitHz(freq), waitUs(dur) / 1e6, 0, -18, 0);
    }
    case 'sweep': {
      const [from, to, step, dur] = args;
      const length = (waitUs(step) * Math.ceil(dur / Math.max(1, step))) / 1e6;
      return glide(pitHz(from) * detune, pitHz(to) * detune, Math.max(0.03, length), REPEATED.has(name) ? -18 + quiet : -15, 0.25);
    }
  }
}

/** A noise call's length, seconds. */
function noiseLength(args: number[]): number {
  const [rate, dur] = args;
  return (noiseStepUs(rate) * Math.max(1, Math.ceil(dur / Math.max(1, rate)))) / 1e6;
}
