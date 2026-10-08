/**
 * engine.ts (an experiment: tools/music/styles)
 *
 * The Upgrade's tunes in the sound of three kinds of records - their
 * instruments, rhythm sections and production, never their music; the
 * notes stay Ultima's:
 *
 *   upsidedown  analog synths: held chords rippling as arpeggios through
 *               resonant filters, a pulsing bass, a long dark room
 *               (after the Stranger Things score)
 *   newwave     a drum machine with a gated snare, a chorused melodic bass,
 *               jangling chorused guitar, a bright synth lead, a ping-pong
 *               delay (after 80s New Order and The Cure)
 *   grid        a sixteenth-note pulsing bass ducking to the beat, a huge
 *               brass-and-strings bed, timpani on the bar, a cavernous room
 *               (after the Tron: Legacy score)
 *
 *   ambient     at half speed, the notes swelling in and out of a vast room,
 *               glass bells over slow pads (after Brian Eno's ambient records)
 *   trance      retimed to 138 a minute: a kick on every beat, a bass on the
 *               off-beats, a supersaw lead, pads chopped by a gate, risers
 *   lofi        slowed and swung: a dusty electric piano, a round sub bass,
 *               soft boom-bap drums, vinyl crackle, a warped tape
 *
 * A tune heard over and over is played gentler: its melody settled lower
 * (harmony.ts), the room's top softer, the high counter-melody kept down,
 * and New Wave's drum machine, bass and guitar following each phrase's
 * energy, so it breathes rather than stands as a wall. An ominous tune
 * (Blackthorn's) is played lower and darker still, over a sub drone on the
 * note its bass dwells on and a soft heartbeat on every bar. A mellow tune
 * (Britannia's, heard for hours) stays low in energy all through, its top
 * darker, nothing faster than eighths, its bass held or pulsing on the
 * beat, its drums a soft kick and light hats. A serene tune (the Fanfare) is
 * Upside Down's synths by way of Enya: slow, in a vast soft room, choir-like
 * pads, the arpeggio a shimmer, a breathy lead.
 *
 * Plain Web Audio on any BaseAudioContext; rendered offline (styles/render.ts).
 */

import { notesOf, type Note } from '../../../src/audio/remaster.ts';
import type { XmiSequence } from '../../../src/audio/xmi.ts';
import { findGrid, findRoles, type Grid, type Role } from './analysis.ts';
import {
  bassLine,
  counterMelody,
  findChords,
  findKey,
  findPhrases,
  inThirds,
  LOW,
  pedalOf,
  settled,
  voice,
  type Chord,
  type Phrase,
} from './harmony.ts';

export const STYLES = ['upsidedown', 'newwave', 'grid', 'ambient', 'trance', 'lofi'] as const;
/**
 * Electronic keyboards playing the Classical piano's arrangement (orchestrate.ts) note for note - its phrasing and its
 * pedal - in a calm room: a clean, elegant solo, only its sound electronic.
 *
 *   rhodes      an electric piano: a tine's bell over a warm body, a slow shimmer
 *   glasskeys   soft glass keys: a pure tone and a faint inharmonic ring, a gentle echo
 *   juno        an analog synth piano: detuned triangles, a low-pass closing as the note rings
 *   felt        a felt-soft synth piano: round, hushed, its top rolled away
 */
export const KEYBOARDS = ['rhodes', 'glasskeys', 'juno', 'felt'] as const;
export type Keyboard = (typeof KEYBOARDS)[number];
export type Style = (typeof STYLES)[number];

const hz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** A repeatable noise source, so renders are the same each time. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** A room's impulse: decorrelated noise tails over `seconds`, the highs dying first. */
function room(ctx: BaseAudioContext, seconds: number, seed: number, dark = 0.85): AudioBuffer {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const r = rng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (0.12 + dark * t) * (r() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 2) * Math.min(1, i / (0.01 * ctx.sampleRate));
    }
  }
  return buf;
}

/** The mix every style plays into: a dry path, a room, a delay where asked, a tone, and a limit. */
interface Mix {
  ctx: BaseAudioContext;
  dry: GainNode;
  wet: GainNode;
  delay: GainNode;
  /** A slow wow, in cents, every oscillator's detune follows (a tape's, an old synth's drift). */
  wow: AudioNode | null;
  noise: AudioBuffer;
}

function mix(
  ctx: BaseAudioContext,
  out: AudioNode,
  o: { room: number; wet: number; bright: number; delay?: number; feedback?: number; wow?: number },
): Mix {
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = o.bright;
  tone.Q.value = 0.5;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -12;
  limit.knee.value = 10;
  limit.ratio.value = 4;
  limit.attack.value = 0.008;
  limit.release.value = 0.25;
  tone.connect(limit).connect(out);
  const dry = ctx.createGain();
  dry.connect(tone);
  const verb = ctx.createConvolver();
  verb.buffer = room(ctx, o.room, 7);
  const wet = ctx.createGain();
  wet.gain.value = o.wet;
  wet.connect(verb).connect(tone);
  // A ping-pong delay: left, then right, each echo quieter.
  const delay = ctx.createGain();
  if (o.delay) {
    const l = ctx.createDelay(2);
    const r = ctx.createDelay(2);
    l.delayTime.value = o.delay;
    r.delayTime.value = o.delay;
    const fb = ctx.createGain();
    fb.gain.value = o.feedback ?? 0.35;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.7;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.7;
    delay.connect(l);
    l.connect(pl).connect(tone);
    l.connect(r);
    r.connect(pr).connect(tone);
    r.connect(fb).connect(l);
  }
  let wow: AudioNode | null = null;
  if (o.wow) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.31;
    const depth = ctx.createGain();
    depth.gain.value = o.wow;
    lfo.connect(depth);
    lfo.start(0);
    wow = depth;
  }
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const r = rng(99);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = r() * 2 - 1;
  return { ctx, dry, wet, delay, wow, noise };
}

/** Where a sound goes: dry, into the room by `send`, into the delay by `echo`, panned. */
function route(m: Mix, node: AudioNode, send: number, echo = 0, pan = 0): void {
  const p = m.ctx.createStereoPanner();
  p.pan.value = pan;
  node.connect(p);
  p.connect(m.dry);
  if (send) {
    const s = m.ctx.createGain();
    s.gain.value = send;
    p.connect(s).connect(m.wet);
  }
  if (echo) {
    const e = m.ctx.createGain();
    e.gain.value = echo;
    p.connect(e).connect(m.delay);
  }
}

function osc(m: Mix, type: OscillatorType, f: number, start: number, stop: number, cents = 0): OscillatorNode {
  const o = m.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = cents;
  if (m.wow) m.wow.connect(o.detune);
  o.start(start);
  o.stop(stop);
  return o;
}

/**
 * A gain enveloped: up over `a`, down to `s` of its peak over `d`, held to `end`, gone over `r`. Linear segments only:
 * the offline renderer's setTargetAtTime ran away on a long hold (2.8 s of a bass note; BRITLAND in newwave).
 */
function env(m: Mix, start: number, end: number, peak: number, a: number, d: number, s: number, r: number): { g: GainNode; done: number } {
  const g = m.ctx.createGain();
  const p = g.gain;
  const off = Math.max(end, start + a);
  const decayed = Math.min(off, start + a + d);
  // The level where the decay has got to by the note's end, where it ends inside the decay.
  const at = peak - (peak - peak * s) * Math.min(1, (decayed - start - a) / Math.max(1e-6, d));
  p.setValueAtTime(0, start);
  p.linearRampToValueAtTime(peak, start + a);
  p.linearRampToValueAtTime(at, decayed);
  p.setValueAtTime(at, off);
  p.linearRampToValueAtTime(0, off + r);
  return { g, done: off + r + 0.02 };
}

/** A resonant low-pass whose cutoff sweeps from `from` to `to` (Hz) over `t` seconds. */
function sweep(m: Mix, start: number, from: number, to: number, t: number, q: number): BiquadFilterNode {
  const f = m.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(Math.min(18000, from), start);
  f.frequency.setTargetAtTime(Math.min(18000, to), start, t / 3);
  return f;
}

// --- The instruments -------------------------------------------------------------------------

/** An analog lead: two saws a little apart and a square, through a resonant filter that opens and settles. */
function analogLead(m: Mix, f: number, start: number, end: number, v: number, send: number, echo = 0, pan = 0): void {
  const { g, done } = env(m, start, end, v * 0.16, 0.012, 0.4, 0.75, 0.25);
  const lp = sweep(m, start, f * 2, f * 6, 0.25, 5);
  lp.frequency.setTargetAtTime(Math.min(9000, f * 3.2), start + 0.25, 0.4);
  for (const c of [-8, 8]) osc(m, 'sawtooth', f, start, done, c).connect(lp);
  const sq = osc(m, 'square', f / 2, start, done);
  const sqG = m.ctx.createGain();
  sqG.gain.value = 0.35;
  sq.connect(sqG).connect(lp);
  lp.connect(g);
  route(m, g, send, echo, pan);
}

/** One step of an arpeggio: a saw plucked through a filter that snaps shut. */
function arpPluck(m: Mix, f: number, start: number, len: number, v: number, send: number, echo = 0, pan = 0): void {
  const { g, done } = env(m, start, start + len * 0.6, v * 0.11, 0.003, 0.12, 0.3, 0.12);
  const lp = sweep(m, start, Math.min(9000, f * 9), Math.max(400, f * 1.2), 0.14, 6);
  osc(m, 'sawtooth', f, start, done).connect(lp);
  osc(m, 'square', f, start, done, 5).connect(lp);
  lp.connect(g);
  route(m, g, send, echo, pan);
}

/** A breathy lead: a triangle and a sine an octave down, its attack soft, low-passed, a slow release into the room. */
function airLead(m: Mix, f: number, start: number, end: number, v: number, send: number, echo = 0, pan = 0): void {
  const { g, done } = env(m, start, end, v * 0.2, 0.12, 0.5, 0.8, 0.8);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(5000, f * 3);
  lp.Q.value = 0.5;
  osc(m, 'triangle', f, start, done).connect(lp);
  const low = osc(m, 'sine', f / 2, start, done);
  const lg = m.ctx.createGain();
  lg.gain.value = 0.4;
  low.connect(lg).connect(lp);
  lp.connect(g);
  route(m, g, send, echo, pan);
}

/** A slow analog pad: saws spread wide, low-passed, rising and falling slowly. */
function pad(m: Mix, f: number, start: number, end: number, v: number, send: number, bright = 900, voices = 4, pan = 0): void {
  const { g, done } = env(m, start, end, v * 0.05, 0.6, 1, 0.9, 1.4);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, bright + f * 0.6);
  lp.Q.value = 0.6;
  for (let k = 0; k < voices; k++) osc(m, 'sawtooth', f, start, done, (k - (voices - 1) / 2) * 9).connect(lp);
  lp.connect(g);
  route(m, g, send, 0, pan);
}

/** A pulsing synth bass: a square and a saw retriggered every `step`, each pulse plucked short. */
function pulseBass(m: Mix, f: number, start: number, end: number, v: number, step: number, send: number, duck?: Grid): void {
  for (let t = start; t < end - 0.01; t += step) {
    const { g, done } = env(m, t, t + step * 0.55, v * 0.3, 0.004, step * 0.6, 0.4, 0.05);
    const lp = sweep(m, t, Math.min(4000, f * 10), Math.max(160, f * 2), step * 0.8, 3);
    osc(m, 'sawtooth', f, t, done).connect(lp);
    osc(m, 'square', f / 2, t, done).connect(lp);
    lp.connect(g);
    // Ducking: the pulse on the beat quietest, as a compressor keyed to the kick would leave it.
    if (duck) {
      const phase = (((t - duck.first) % duck.beat) + duck.beat) % duck.beat;
      g.gain.value = 1;
      const d = m.ctx.createGain();
      d.gain.value = phase < step * 0.5 ? 0.45 : 1;
      g.connect(d);
      route(m, d, send);
    } else route(m, g, send);
  }
}

/** A melodic bass guitar: a saw and a square, plucked, chorused (two a little apart, panned). */
function hookBass(m: Mix, f: number, start: number, end: number, v: number, send: number): void {
  for (const [c, pan] of [
    [-9, -0.3],
    [9, 0.3],
  ] as const) {
    const { g, done } = env(m, start, end, v * 0.2, 0.004, 0.35, 0.55, 0.12);
    // A fixed filter, the pick's bite left to the envelope: a swept one here ran away in the offline renderer.
    const lp = m.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(4000, Math.max(600, f * 6));
    lp.Q.value = 0.7;
    osc(m, 'sawtooth', f, start, done, c).connect(lp);
    osc(m, 'square', f, start, done, -c).connect(lp);
    lp.connect(g);
    route(m, g, send, 0, pan);
  }
}

/** A chorused guitar string: a triangle and a thin saw, bright and short, two a little apart. */
function jangle(m: Mix, f: number, start: number, len: number, v: number, send: number, echo: number, pan: number): void {
  const { g, done } = env(m, start, start + len, v * 0.07, 0.002, 0.25, 0.35, 0.2);
  const lp = sweep(m, start, 8000, Math.max(1800, f * 3), 0.3, 0.8);
  for (const c of [-7, 7]) {
    osc(m, 'triangle', f, start, done, c).connect(lp);
    osc(m, 'sawtooth', f * 2, start, done, -c).connect(lp);
  }
  lp.connect(g);
  route(m, g, send, echo, pan);
}

/** A bright square lead with a vibrato that comes in as it is held. */
function squareLead(m: Mix, f: number, start: number, end: number, v: number, send: number, echo: number): void {
  const { g, done } = env(m, start, end, v * 0.11, 0.008, 0.3, 0.85, 0.15);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(9000, f * 5);
  const o1 = osc(m, 'square', f, start, done);
  const o2 = osc(m, 'sawtooth', f, start, done, 6);
  const lfo = osc(m, 'sine', 5.6, start, done);
  const depth = m.ctx.createGain();
  depth.gain.setValueAtTime(0, start);
  depth.gain.linearRampToValueAtTime(14, start + 0.35);
  lfo.connect(depth);
  depth.connect(o1.detune);
  depth.connect(o2.detune);
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g);
  route(m, g, send, echo);
}

/** Brass, Tron-sized: a stack of saws under a filter that swells open, an octave beneath. */
function bigBrass(m: Mix, f: number, start: number, end: number, v: number, send: number, swell = 0.12): void {
  const { g, done } = env(m, start, end, v * 0.09, swell, 0.5, 0.9, 0.5);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(f * 1.5, start);
  lp.frequency.linearRampToValueAtTime(Math.min(7000, f * 6), start + swell + 0.15);
  lp.frequency.setTargetAtTime(Math.min(5000, f * 3.5), start + swell + 0.15, 0.6);
  for (const c of [-12, -4, 4, 12]) osc(m, 'sawtooth', f, start, done, c).connect(lp);
  osc(m, 'sawtooth', f / 2, start, done).connect(lp);
  lp.connect(g);
  route(m, g, send);
}

/** A drum machine's voices. */
function kick(m: Mix, t: number, v: number, send = 0): void {
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.9, t);
  g.gain.setTargetAtTime(0, t + 0.02, 0.09);
  const o = m.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.setTargetAtTime(48, t, 0.03);
  o.start(t);
  o.stop(t + 0.5);
  o.connect(g);
  route(m, g, send);
}

/** A snare through a gated room: a burst of noise ringing densely, cut off short - the 80s' snare. */
function gatedSnare(m: Mix, t: number, v: number): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  const bp = m.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 0.6;
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.5, t);
  g.gain.setTargetAtTime(v * 0.22, t + 0.004, 0.05);
  g.gain.setValueAtTime(v * 0.18, t + 0.22);
  g.gain.linearRampToValueAtTime(0, t + 0.26); // the gate
  src.connect(bp).connect(g);
  src.start(t, (t * 7.3) % 0.5);
  src.stop(t + 0.3);
  const body = m.ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(190, t);
  body.frequency.setTargetAtTime(160, t, 0.02);
  const bg = m.ctx.createGain();
  bg.gain.setValueAtTime(v * 0.35, t);
  bg.gain.setTargetAtTime(0, t, 0.04);
  body.connect(bg);
  body.start(t);
  body.stop(t + 0.25);
  route(m, g, 0.08);
  route(m, bg, 0.05);
}

function hat(m: Mix, t: number, v: number, open = false, pan = 0.25): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  const hp = m.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.12, t);
  g.gain.setTargetAtTime(0, t, open ? 0.09 : 0.018);
  src.connect(hp).connect(g);
  src.start(t, (t * 3.1) % 0.5);
  src.stop(t + (open ? 0.4 : 0.08));
  route(m, g, 0.02, 0, pan);
}

/** A timpani-like boom, a sub drop under it. */
function boom(m: Mix, t: number, f: number, v: number): void {
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.7, t);
  g.gain.setTargetAtTime(0, t + 0.01, 0.4);
  const o = m.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.5, t);
  o.frequency.setTargetAtTime(f, t, 0.05);
  o.start(t);
  o.stop(t + 2);
  o.connect(g);
  route(m, g, 0.35);
}

/** A cymbal swept backwards up to the note's end. */
function swell(m: Mix, start: number, end: number, v: number): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const hp = m.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3500;
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(v * 0.07, end);
  g.gain.linearRampToValueAtTime(0, end + 0.06);
  src.connect(hp).connect(g);
  src.start(start);
  src.stop(end + 0.1);
  route(m, g, 0.4);
}

// --- The keyboards ---------------------------------------------------------------------------

/** A sine at `ratio` times `f` into `into`'s frequency, its depth falling from `from` to `to` (times `f`) over `t` seconds. */
function fm(
  m: Mix,
  into: OscillatorNode,
  f: number,
  ratio: number,
  start: number,
  done: number,
  from: number,
  to: number,
  t: number,
): void {
  const mod = osc(m, 'sine', f * ratio, start, done);
  const depth = m.ctx.createGain();
  depth.gain.setValueAtTime(f * from, start);
  depth.gain.linearRampToValueAtTime(f * to, start + t);
  mod.connect(depth).connect(into.frequency);
}

/** One note of a keyboard: struck at `start`, ringing away as a piano's does, let go at `end`. */
function key(m: Mix, kind: Keyboard, note: number, start: number, end: number, v: number): void {
  const f = hz(note);
  // Low notes ring longer, as a piano's strings do.
  const ring = 1.6 + 2.4 * Math.max(0, Math.min(1, (84 - note) / 48));
  // The keyboard spread across the stereo field, low on the left, high on the right.
  const pan = Math.max(-0.5, Math.min(0.5, (note - 64) / 40));
  if (kind === 'rhodes') {
    const { g, done } = env(m, start, end, v * 0.2, 0.004, ring, 0.02, 0.35);
    const body = osc(m, 'sine', f, start, done);
    fm(m, body, f, 1, start, done, 1.6, 0.25, 0.5);
    const tine = osc(m, 'sine', f, start, done);
    fm(m, tine, f, 14, start, done, 3.5, 0, 0.15);
    const tg = m.ctx.createGain();
    tg.gain.value = 0.4;
    tine.connect(tg).connect(g);
    // A slow shimmer of tremolo.
    const trem = m.ctx.createGain();
    const lfo = osc(m, 'sine', 3.4, start, done);
    const depth = m.ctx.createGain();
    depth.gain.value = 0.08;
    lfo.connect(depth).connect(trem.gain);
    body.connect(trem).connect(g);
    route(m, g, 0.35, 0, pan);
  } else if (kind === 'glasskeys') {
    const { g, done } = env(m, start, end, v * 0.2, 0.003, ring * 0.8, 0.02, 0.5);
    osc(m, 'sine', f, start, done).connect(g);
    // Its overtones: the octave and the twelfth, and the glass's inharmonic ring, each dying away sooner than the last.
    for (const [ratio, level, d] of [
      [2, 0.4, 1.2],
      [3, 0.18, 0.7],
      [2.76, 0.2, 0.9],
      [5.4, 0.08, 0.3],
    ]) {
      const { g: pg, done: pd } = env(m, start, Math.min(end, start + d), level, 0.002, d, 0, 0.3);
      osc(m, 'sine', f * ratio, start, Math.min(done, pd))
        .connect(pg)
        .connect(g);
    }
    route(m, g, 0.45, 0.25, pan);
  } else if (kind === 'juno') {
    const { g, done } = env(m, start, end, v * 0.13, 0.006, ring, 0.04, 0.4);
    const lp = sweep(m, start, Math.min(9000, f * 8), Math.max(300, f * 1.4), 1.2, 1);
    for (const c of [-6, 6]) osc(m, 'triangle', f, start, done, c).connect(lp);
    const saw = osc(m, 'sawtooth', f, start, done);
    const sg = m.ctx.createGain();
    sg.gain.value = 0.3;
    saw.connect(sg).connect(lp);
    lp.connect(g);
    route(m, g, 0.4, 0.15, pan * 1.4);
  } else {
    const { g, done } = env(m, start, end, v * 0.22, 0.012, ring, 0, 0.6);
    const lp = m.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(1400, Math.min(4000, f * 4));
    lp.Q.value = 0.4;
    osc(m, 'sine', f, start, done).connect(lp);
    const tri = osc(m, 'triangle', f, start, done);
    const tg = m.ctx.createGain();
    tg.gain.value = 0.7;
    tri.connect(tg).connect(lp);
    lp.connect(g);
    route(m, g, 0.4, 0, pan);
  }
}

/** `seq` - the Classical piano's arrangement (orchestrate.ts) - played note for note on keyboard `kind`, into `out`. */
export function playKeyboard(ctx: BaseAudioContext, out: AudioNode, seq: XmiSequence, kind: Keyboard): void {
  const notes = notesOf(seq.events);
  const beat = findGrid(notes).beat;
  const room = {
    rhodes: { room: 2.8, wet: 0.3, bright: 7000 },
    glasskeys: { room: 4, wet: 0.4, bright: 8000, delay: beat * 1.5, feedback: 0.3 },
    juno: { room: 3.5, wet: 0.35, bright: 6000, wow: 3 },
    felt: { room: 3, wet: 0.35, bright: 4500 },
  }[kind];
  const m = mix(ctx, out, room);
  for (const n of notes) key(m, kind, n.note, n.start, n.end, n.velocity / 127);
}

// --- The styles ------------------------------------------------------------------------------

/** The notes of `role`, in time order. */
const ofRole = (notes: Note[], roles: Map<number, Role>, role: Role): Note[] => notes.filter((n) => roles.get(n.channel) === role);

/** Under an ominous tune: a sub drone on `low` and its fifth through each phrase, and a heartbeat on every bar. */
function menace(m: Mix, phrases: { start: number; end: number }[], grid: Grid, end: number, low: number): void {
  for (const p of phrases) {
    sub(m, hz(low), p.start, p.end + 0.5, 0.5, 0.3);
    for (const n of [low + 12, low + 19]) pad(m, hz(n), p.start, p.end + 0.5, 0.35, 0.6, 400, 3);
  }
  for (let t = grid.first; t < end - grid.beat; t += grid.beat * 4) {
    boom(m, t, hz(low + 12), 0.7);
    boom(m, t + grid.beat * 0.75, hz(low + 12), 0.45);
  }
}

/**
 * How a tune is played: gentler for one heard over and over, dark for an ominous one, low in energy for a mellow one,
 * and - in Upside Down - serene: peaceful, its synths in a vast soft room (after Enya's records).
 */
export interface How {
  gentle?: boolean;
  ominous?: boolean;
  mellow?: boolean;
  serene?: boolean;
}

/** `seq` played in `style` into `out`, from 0: written anew from its key, chords and form (harmony.ts), as `how` says. */
export function playStyle(ctx: BaseAudioContext, out: AudioNode, seq: XmiSequence, style: Style, how: How = {}): void {
  const { gentle = false, ominous = false, mellow = false, serene = false } = how;
  /** A bass held: a mellow tune's. */
  const held = mellow;
  const notes = notesOf(seq.events);
  const grid = findGrid(notes);
  const roles = findRoles(notes);
  const melody = ominous
    ? settled(ofRole(notes, roles, 'melody'), LOW)
    : gentle
      ? settled(ofRole(notes, roles, 'melody'))
      : ofRole(notes, roles, 'melody');
  /** A mix's top, darker for an ominous or a mellow tune. */
  const top = (hz: number): number => (ominous || mellow ? hz * 0.65 : hz);
  const low = 31 + ((pedalOf(ofRole(notes, roles, 'bass')) - 7 + 12) % 12);
  const struck = ofRole(notes, roles, 'percussion');
  const key = findKey(notes);
  const end = seq.length;
  const chords = findChords(notes, roles, grid, end);
  // A mellow tune's phrases at four tenths of their energy: its peak layers never come in.
  const phrases = findPhrases(melody, grid, end).map((p) => (mellow ? { ...p, energy: p.energy * 0.4 } : p));
  const span = phrases.length ? phrases : [{ start: 0, end }];
  const v = (n: Note): number => n.velocity / 127;
  const beat = grid.beat;
  const eighth = beat / 2;
  /** The quickest step: a sixteenth, a mellow tune's an eighth. */
  const sixteenth = mellow ? eighth : beat / 4;
  /** The chords of phrase `p`. */
  const chordsOf = (p: Phrase): Chord[] => chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3);
  const melodyOf = (p: Phrase): Note[] => melody.filter((n) => n.start >= p.start - 1e-3 && n.start < p.end - 1e-3);
  const counter = counterMelody(melody, chords, key, grid, 60, 76);
  const counterOf = (p: Phrase): Note[] => counter.filter((n) => n.start >= p.start - 1e-3 && n.start < p.end - 1e-3);

  if (style === 'upsidedown' && serene) {
    // Serene: a vast soft room and a slow echo; wide pads, a chord to a voice, overlapping as one chord gives way to
    // the next; the arpeggio a quiet shimmer heard mostly in the room; a breathy lead, a faint bell an octave above
    // its long notes; a warm sub held beneath.
    const m = mix(ctx, out, { room: 7.5, wet: 0.6, bright: 4200, delay: beat * 1.5, feedback: 0.45, wow: 4 });
    let padV: number[] | null = null;
    for (const p of span) {
      for (const c of chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3)) {
        const arp = voice(c, 64, 83, 4, null);
        let k = 0;
        for (let t = c.start; t < c.end - 1e-3; t += eighth, k++)
          arpPluck(m, hz(arp[[0, 1, 2, 3, 2, 1][k % 6] % arp.length]), t, eighth, 0.28, 0.85, 0.45, Math.sin(t * 0.9) * 0.6);
        padV = voice(c, 50, 72, 5, padV);
        for (const n of padV) pad(m, hz(n), c.start, c.end + beat, 0.6, 0.85, 700, 6, Math.sin(n * 1.3) * 0.6);
        sub(m, hz(36 + ((c.root - 36 + 120) % 12)), c.start, c.end, 0.4, 0.35);
      }
    }
    for (const n of melody) {
      airLead(m, hz(n.note), n.start, n.end, v(n) * 0.7, 0.7, 0.4);
      if (n.end - n.start >= beat) glass(m, hz(n.note + 12), n.start, n.end, 0.3, 0.85, 0.5);
    }
    for (const n of struck) if (n.program === 119) swell(m, n.start, n.end, v(n));
  } else if (style === 'upsidedown') {
    const m = mix(ctx, out, { room: 4.8, wet: 0.4, bright: top(gentle ? 5500 : 6500), delay: beat * 0.75, feedback: 0.4, wow: 7 });
    if (ominous) menace(m, span, grid, end, low);
    let padV: number[] | null = null;
    for (const p of phrases) {
      // The arpeggio's figure turns with the form: rising, rising and falling, leaping octaves; in eighths when
      // quiet, sixteenths as it grows.
      const figure = p.label === 'A' ? [0, 1, 2, 3] : p.label === 'B' ? [0, 1, 2, 3, 2, 1] : [0, 3, 1, 3, 2, 3];
      const step = p.energy > 0.6 ? sixteenth : eighth;
      for (const c of chordsOf(p)) {
        const arp = voice(c, 60, 79, 4, null);
        let k = 0;
        for (let t = c.start; t < c.end - 1e-3; t += step, k++)
          arpPluck(
            m,
            hz(arp[figure[k % figure.length] % arp.length]),
            t,
            step,
            (mellow ? 0.4 : 0.55) + 0.45 * p.energy,
            0.5,
            0.2,
            Math.sin(t * 1.7) * 0.5,
          );
        padV = voice(c, 48, 67, 4, padV);
        for (const n of padV) pad(m, hz(n), c.start, c.end, 0.5 + 0.4 * p.energy, 0.7, 500 + 900 * p.energy);
      }
      // The lead from the first repeat; a second, softer, voice on the counter-melody in the middle sections.
      if (p.index > 0) for (const n of melodyOf(p)) analogLead(m, hz(n.note), n.start, n.end, v(n) * (0.7 + 0.3 * p.energy), 0.45, 0.25);
      if (p.label !== 'A') for (const n of counterOf(p)) analogLead(m, hz(n.note), n.start, n.end, 0.45, 0.5, 0.2, -0.4);
      for (const n of bassLine(chordsOf(p), grid, held ? 'root' : 'pulse', 33))
        pulseBass(m, hz(n.note), n.start, n.end, 0.6 + 0.4 * p.energy, held ? n.end - n.start : eighth, 0.15);
    }
    if (!phrases.length) for (const n of melody) analogLead(m, hz(n.note), n.start, n.end, v(n), 0.45, 0.25);
    for (const n of struck)
      if (n.program === 119) swell(m, n.start, n.end, v(n));
      else boom(m, n.start, hz(n.note), v(n));
  } else if (style === 'newwave') {
    const m = mix(ctx, out, { room: 2.2, wet: 0.22, bright: top(gentle ? 7500 : 11000), delay: beat * 0.75, feedback: 0.3 });
    if (ominous) menace(m, span, grid, end, low);
    let guitarV: number[] | null = null;
    for (const p of phrases) {
      // How hard the band plays: in full always, or a gentle tune's following its phrase's energy.
      const lift = gentle ? 0.45 + 0.55 * p.energy : 1;
      // The drum machine: kick and hats alone the first time, the gated snare from the second, a fill into each
      // phrase, a crash on its downbeat (a gentle tune's only at its peak).
      if (mellow)
        // A mellow tune's: a soft kick on the first and third beats, light hats on the eighths.
        for (let t = p.start, k = 0; t < p.end - 1e-3; t += eighth, k++) {
          if (k % 4 === 0) kick(m, t, 0.45);
          hat(m, t, k % 2 === 0 ? 0.3 : 0.18);
        }
      else
        for (let t = p.start, k = 0; t < p.end - 1e-3; t += beat / 4, k++) {
          const step = k % 16;
          const fill = !p.last && t >= p.end - beat - 1e-3;
          if (step % 4 === 0 && !fill) kick(m, t, gentle ? 0.6 + 0.4 * p.energy : 1);
          if (p.index > 0 && (step === 4 || step === 12) && !fill) gatedSnare(m, t, lift);
          if (fill && p.index > 0) gatedSnare(m, t, (0.45 + 0.55 * ((t - (p.end - beat)) / beat)) * lift);
          else hat(m, t, (step % 2 === 0 ? 1 : 0.55) * lift * lift, step % 8 === 6);
        }
      if (p.index > 0 && !mellow && (!gentle || p.energy >= 0.9)) crash(m, p.start, 0.7);
      // The bass: the root and its octave in eighths - the high, melodic bass of the records.
      for (const c of chordsOf(p)) {
        const root = 40 + ((c.root - 40 + 120) % 12);
        let k = 0;
        for (let t = c.start; t < c.end - 1e-3; t += held ? beat : eighth, k++)
          hookBass(
            m,
            hz(k % 4 === 3 ? root + 12 : k % 4 === 1 ? root + 7 : root),
            t,
            t + (held ? beat : eighth) * 0.9,
            0.85 * (gentle ? 0.7 + 0.3 * p.energy : 1),
            0.1,
          );
        // The guitar picking the chord in eighths, re-voiced; the lead takes the melody from the second phrase.
        guitarV = voice(c, 60, 76, 4, guitarV);
        const fig = p.label === 'A' ? [0, 2, 1, 3] : [0, 1, 2, 3, 2, 1];
        k = 0;
        for (let t = c.start; t < c.end - 1e-3; t += eighth, k++)
          jangle(m, hz(guitarV[fig[k % fig.length] % guitarV.length]), t, eighth * 1.6, 0.8 * lift, 0.3, 0.25, 0.4);
        for (const n of guitarV.slice(0, 3)) pad(m, hz(n - 12), c.start, c.end, 0.3, 0.5, 1800, 2, -0.3);
      }
      const mel = melodyOf(p);
      if (p.index > 0 || phrases.length === 1)
        for (const n of mel) squareLead(m, hz(n.note), n.start, n.end, v(n) * (mellow ? 0.75 : 1), 0.3, 0.3);
      // In the middle sections and at the peak, a second line a third below.
      if (p.label !== 'A' || p.energy >= 0.9)
        for (const n of inThirds(mel, key)) squareLead(m, hz(n.note), n.start, n.end, v(n) * 0.6, 0.3, 0.3);
    }
    for (const n of struck) if (n.program === 119) swell(m, n.start, n.end, v(n));
  } else if (style === 'grid') {
    const m = mix(ctx, out, { room: 5.5, wet: 0.32, bright: top(gentle ? 6500 : 8500) });
    if (ominous) menace(m, span, grid, end, low);
    let brassV: number[] | null = null;
    let stringV: number[] | null = null;
    for (const p of phrases) {
      // Layer upon layer as the energy grows: the pulse and strings; then the brass chords; then the melody in brass,
      // the timpani and the hats; at the peak the counter-melody high above and a roll into each phrase.
      for (const c of chordsOf(p)) {
        const root = 36 + ((c.root - 36 + 120) % 12);
        pulseBass(m, hz(root), c.start, c.end, (mellow ? 0.55 : 0.75) + 0.25 * p.energy, held ? beat : sixteenth, 0.08, grid);
        stringV = voice(c, 60, 79, 4, stringV);
        for (const n of stringV) pad(m, hz(n), c.start, c.end, 0.35 + 0.35 * p.energy, 0.6, 2500, 6);
        if (p.energy > 0.55) {
          brassV = voice(c, 48, 64, 3, brassV);
          for (const n of brassV) bigBrass(m, hz(n), c.start, c.end, 0.45 + 0.4 * p.energy, 0.5, 0.35);
        }
      }
      if (p.energy > 0.7 || p.index > 1)
        for (const n of melodyOf(p)) bigBrass(m, hz(n.note), n.start, n.end, v(n) * (mellow ? 0.75 : 1.1), 0.4, mellow ? 0.12 : 0.06);
      if (p.energy >= 0.9) for (const n of counterOf(p)) bigBrass(m, hz(n.note + (gentle ? 0 : 12)), n.start, n.end, 0.5, 0.5, 0.08);
      if (p.energy > 0.7) {
        const low = chordsOf(p)[0] ? 28 + ((chordsOf(p)[0].root - 28 + 120) % 12) : 33;
        for (let t = p.start, k = 0; t < p.end - 1e-3; t += sixteenth, k++) {
          if (k % 16 === 0) boom(m, t, hz(low), 1);
          hat(m, t, k % 4 === 2 ? 0.7 : 0.35, false, k % 2 ? 0.4 : -0.4);
        }
      }
      if (p.energy >= 0.85 && !p.last)
        for (let t = p.end - beat * 2; t < p.end - 1e-3; t += sixteenth / 2)
          gatedSnare(m, t, 0.25 + 0.6 * ((t - (p.end - beat * 2)) / (beat * 2)));
    }
    for (const n of struck)
      if (n.program === 119) swell(m, n.start, n.end, v(n));
      else boom(m, n.start, hz(n.note), v(n));
  } else if (style === 'ambient') {
    const m = mix(ctx, out, { room: 8, wet: 0.6, bright: 5200, delay: beat * 1.5, feedback: 0.5, wow: 4 });
    let padV: number[] | null = null;
    for (const p of phrases) {
      for (const c of chordsOf(p)) {
        padV = voice(c, 50, 70, 4, padV);
        for (const n of padV) pad(m, hz(n), c.start, c.end + 2, 0.75, 0.9, 600, 4, Math.sin(n) * 0.6);
        // A bell on each new chord's top note.
        glass(m, hz(padV[padV.length - 1] + 12), c.start, c.start + beat * 2, 0.5, 0.85, 0.4);
        sub(m, hz(36 + ((c.root - 36 + 120) % 12)), c.start, c.end + 1, 0.55, 0.4);
      }
      // The melody only as fragments: the first note of each bar, from the second phrase on.
      if (p.index > 0)
        for (let t = p.start; t < p.end - 1e-3; t += beat * 4) {
          const n = melody.find((x) => x.start >= t - 1e-3 && x.start < t + beat * 4);
          if (n) glass(m, hz(n.note + 12), n.start, n.start + beat * 2.5, v(n), 0.8, 0.35);
        }
    }
    for (const n of struck) if (n.program === 119) swell(m, n.start, n.end, v(n));
  } else if (style === 'trance') {
    const m = mix(ctx, out, { room: 3, wet: 0.25, bright: 12000, delay: beat * 0.75, feedback: 0.35 });
    let padV: number[] | null = null;
    for (const p of phrases) {
      // The form of a trance track: an intro, a breakdown on the first new section (no kick, the pads and lead alone,
      // a riser into what follows), the drop after it with everything.
      const breakdown = p.label === 'B' && p.repeat === 0;
      const intro = p.index === 0;
      for (let t = p.start, k = 0; t < p.end - 1e-3; t += sixteenth, k++) {
        const step = k % 16;
        if (!breakdown) {
          if (step % 4 === 0) kick(m, t, 1.1);
          if (!intro && (step === 4 || step === 12)) clap(m, t, 0.9);
          if (step % 4 === 2) hat(m, t, 0.9, true);
          else if (!intro) hat(m, t, 0.35);
        }
      }
      if (breakdown) riser(m, p.end - beat * 8, beat * 8);
      else if (!intro) crash(m, p.start, 0.8);
      for (const c of chordsOf(p)) {
        padV = voice(c, 55, 74, 4, padV);
        for (const n of padV) gatedPad(m, hz(n), c.start, c.end, breakdown ? 0.9 : 0.75, breakdown ? beat * 4 : sixteenth);
        if (!breakdown)
          for (let t = c.start + eighth; t < c.end - 1e-3; t += beat)
            offbeatBass(m, hz(36 + ((c.root - 36 + 120) % 12)), t, eighth * 0.9, 0.9);
        // A plucked arpeggio of the chord in sixteenths, from the drop on.
        if (!intro && !breakdown) {
          const arp = voice(c, 67, 86, 4, null);
          let k = 0;
          for (let t = c.start; t < c.end - 1e-3; t += sixteenth, k++)
            arpPluck(m, hz(arp[[0, 2, 1, 3][k % 4] % arp.length]), t, sixteenth, 0.5, 0.4, 0.25, k % 2 ? 0.4 : -0.4);
        }
      }
      for (const n of melodyOf(p)) supersaw(m, hz(n.note), n.start, n.end, v(n) * (intro ? 0.6 : 1), 0.35, 0.3);
      if (p.energy >= 0.9) for (const n of inThirds(melodyOf(p), key)) supersaw(m, hz(n.note), n.start, n.end, v(n) * 0.55, 0.35, 0.3);
    }
  } else {
    const m = mix(ctx, out, { room: 1.6, wet: 0.18, bright: 4200, wow: 10 });
    crackle(m, end + 2);
    let keysV: number[] | null = null;
    for (const p of phrases) {
      for (let t = p.start, k = 0; t < p.end - 1e-3; t += eighth, k++) {
        const step = k % 8;
        if (step === 0 || step === 5) kick(m, t, 0.8);
        if (p.index > 0 && (step === 2 || step === 6)) softSnare(m, t, 0.7);
        if (p.index > 0 && step === 7 && k % 16 === 15) softSnare(m, t + eighth / 2, 0.3); // a ghost note
        hat(m, t, step % 2 === 0 ? 0.5 : 0.3);
      }
      for (const c of chordsOf(p)) {
        // The chord with its seventh and ninth, comped on the beat and the and of two.
        const rich = {
          ...c,
          tones: [...new Set([...c.tones, (c.root + (c.quality === 'maj' || c.quality === 'maj7' ? 11 : 10)) % 12, (c.root + 2) % 12])],
        };
        keysV = voice(rich, 55, 74, 4, keysV);
        for (let t = c.start; t < c.end - 1e-3; t += beat * 2) {
          for (const n of keysV) keys(m, hz(n), t, t + beat * 1.2, 0.5, 0.3);
          if (t + beat * 1.5 < c.end) for (const n of keysV) keys(m, hz(n), t + beat * 1.5, t + beat * 1.9, 0.35, 0.3);
        }
      }
      for (const n of bassLine(chordsOf(p), grid, 'walking', 33)) sub(m, hz(n.note), n.start, n.end, v(n), 0.05);
      if (p.index > 0 || phrases.length === 1)
        for (const n of melodyOf(p)) keys(m, hz(n.note + (n.note < 64 ? 12 : 0)), n.start, n.end, v(n), 0.3, 0.2);
    }
  }
}

/** A crash cymbal: bright noise dying over a second or so. */
function crash(m: Mix, t: number, v: number): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const hp = m.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.18, t);
  g.gain.linearRampToValueAtTime(v * 0.05, t + 0.4);
  g.gain.linearRampToValueAtTime(0, t + 1.6);
  src.connect(hp).connect(g);
  src.start(t, (t * 2.3) % 0.5);
  src.stop(t + 1.7);
  route(m, g, 0.3);
}

// --- Voices of the later styles --------------------------------------------------------------

/** A glass bell swelling in slowly rather than struck: a sine and its fifth above, soft. */
function glass(m: Mix, f: number, start: number, end: number, v: number, send: number, echo: number): void {
  const { g, done } = env(m, start, end + 0.5, v * 0.12, 0.35, 0.8, 0.8, 1.6);
  osc(m, 'sine', f, start, done).connect(g);
  const fifth = osc(m, 'triangle', f * 1.5, start, done);
  const fg = m.ctx.createGain();
  fg.gain.value = 0.18;
  fifth.connect(fg).connect(g);
  route(m, g, send, echo);
}

/** A round sub bass: a sine and a whisper of its octave. */
function sub(m: Mix, f: number, start: number, end: number, v: number, send: number): void {
  const { g, done } = env(m, start, end, v * 0.32, 0.015, 0.3, 0.9, 0.15);
  osc(m, 'sine', f, start, done).connect(g);
  const up = osc(m, 'sine', f * 2, start, done);
  const ug = m.ctx.createGain();
  ug.gain.value = 0.12;
  up.connect(ug).connect(g);
  route(m, g, send);
}

/** A trance lead: seven saws spread wide, low-passed a little. */
function supersaw(m: Mix, f: number, start: number, end: number, v: number, send: number, echo: number): void {
  const { g, done } = env(m, start, end, v * 0.07, 0.01, 0.3, 0.85, 0.25);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(12000, f * 8);
  for (const c of [-24, -15, -7, 0, 7, 15, 24]) osc(m, 'sawtooth', f, start, done, c).connect(lp);
  lp.connect(g);
  route(m, g, send, echo);
}

/** A pad chopped by a gate: open on three sixteenths of every four. */
function gatedPad(m: Mix, f: number, start: number, end: number, v: number, step: number): void {
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(8000, 1500 + f);
  const gate = m.ctx.createGain();
  gate.gain.setValueAtTime(0, start);
  let k = 0;
  for (let t = start; t < end; t += step, k++) {
    const open = k % 4 !== 3;
    gate.gain.setValueAtTime(open ? v * 0.045 : 0, t);
    gate.gain.setValueAtTime(0, t + step * 0.8);
  }
  for (const c of [-12, 0, 12]) osc(m, 'sawtooth', f, start, end + 0.05, c).connect(lp);
  lp.connect(gate);
  route(m, gate, 0.4, 0.2, 0);
}

/** A trance bass on the off-beat: a plucked saw an octave down. */
function offbeatBass(m: Mix, f: number, t: number, len: number, v: number): void {
  const { g, done } = env(m, t, t + len * 0.6, v * 0.28, 0.003, len * 0.5, 0.5, 0.04);
  const lp = m.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(2500, f * 6);
  lp.Q.value = 2;
  osc(m, 'sawtooth', f, t, done).connect(lp);
  osc(m, 'square', f / 2, t, done).connect(lp);
  lp.connect(g);
  route(m, g, 0.05);
}

/** A clap: three bursts of bright noise close together, then a short tail. */
function clap(m: Mix, t: number, v: number): void {
  for (const [dt, level] of [
    [0, 0.6],
    [0.011, 0.5],
    [0.022, 1],
  ] as const) {
    const src = m.ctx.createBufferSource();
    src.buffer = m.noise;
    const bp = m.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.8;
    const g = m.ctx.createGain();
    const at = t + dt;
    g.gain.setValueAtTime(v * 0.3 * level, at);
    g.gain.linearRampToValueAtTime(0, at + (dt === 0.022 ? 0.16 : 0.012));
    src.connect(bp).connect(g);
    src.start(at, (at * 5.7) % 0.5);
    src.stop(at + 0.2);
    route(m, g, 0.15);
  }
}

/** White noise rising through a filter opening over `len` seconds, into the downbeat. */
function riser(m: Mix, t: number, len: number): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const bp = m.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.linearRampToValueAtTime(9000, t + len);
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + len);
  g.gain.linearRampToValueAtTime(0, t + len + 0.05);
  src.connect(bp).connect(g);
  src.start(t);
  src.stop(t + len + 0.1);
  route(m, g, 0.4);
}

/** An electric piano: a sine stirred by a modulator that dies away, a slow tremolo over it. */
function keys(m: Mix, f: number, start: number, end: number, v: number, send: number, echo = 0): void {
  const { g, done } = env(m, start, end, v * 0.2, 0.005, 1.2, 0.35, 0.4);
  const carrier = osc(m, 'sine', f, start, done);
  const mod = osc(m, 'sine', f, start, done);
  const index = m.ctx.createGain();
  index.gain.setValueAtTime(f * 1.2, start);
  index.gain.linearRampToValueAtTime(f * 0.1, start + 0.6);
  mod.connect(index).connect(carrier.frequency);
  const trem = m.ctx.createGain();
  trem.gain.value = 1;
  const lfo = osc(m, 'sine', 4.2, start, done);
  const depth = m.ctx.createGain();
  depth.gain.value = 0.18;
  lfo.connect(depth).connect(trem.gain);
  carrier.connect(trem).connect(g);
  route(m, g, send, echo, Math.sin(f) * 0.3);
}

/** A soft snare, not gated: a brush of noise and a little body. */
function softSnare(m: Mix, t: number, v: number): void {
  const src = m.ctx.createBufferSource();
  src.buffer = m.noise;
  const bp = m.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 0.5;
  const g = m.ctx.createGain();
  g.gain.setValueAtTime(v * 0.25, t);
  g.gain.linearRampToValueAtTime(0, t + 0.16);
  src.connect(bp).connect(g);
  src.start(t, (t * 4.3) % 0.5);
  src.stop(t + 0.2);
  route(m, g, 0.1);
}

/** A record's surface: a faint hiss, and a click now and then. */
function crackle(m: Mix, seconds: number): void {
  const buf = m.ctx.createBuffer(1, Math.round(seconds * m.ctx.sampleRate), m.ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(31);
  let hiss = 0;
  for (let i = 0; i < d.length; i++) {
    hiss += 0.2 * (r() * 2 - 1 - hiss);
    d[i] = hiss * 0.012 + (r() < 0.0004 ? (r() * 2 - 1) * 0.35 : 0);
  }
  const src = m.ctx.createBufferSource();
  src.buffer = buf;
  const hp = m.ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  src.connect(hp);
  src.start(0);
  route(m, hp, 0);
}

/**
 * `seq` made ready for `style`: retimed where the style plays at its own pace - trance at 138 a minute (a slow tune
 * counted in double time), ambient at half speed, lofi slowed to some 82 a minute and swung - else as it is.
 */
export function prepare(seq: XmiSequence, style: Style): XmiSequence {
  const notes = notesOf(seq.events);
  let beat = findGrid(notes).beat;
  let factor = 1;
  if (style === 'ambient') factor = 2;
  else if (style === 'trance') {
    while (60 / beat < 100) beat /= 2;
    factor = 60 / 138 / beat;
  } else if (style === 'lofi') {
    while (60 / beat > 120) beat *= 2;
    factor = Math.max(1, Math.min(1.6, 60 / 82 / beat));
  }
  if (factor === 1) return seq;
  const grid = findGrid(notes);
  const swing = style === 'lofi';
  const at = (t: number): number => {
    let out = t * factor;
    if (swing) {
      // An off-beat eighth pushed late, as a hand plays it behind the beat.
      const b = grid.beat * factor;
      const p = (((out - grid.first * factor) % b) + b) % b;
      if (Math.abs(p - b / 2) < b * 0.08) out += b * 0.12;
    }
    return out;
  };
  return { events: seq.events.map((e) => ({ ...e, time: at(e.time) })), length: seq.length * factor };
}
