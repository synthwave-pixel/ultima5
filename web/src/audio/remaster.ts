/**
 * remaster.ts
 *
 * The Remastered version of the Upgrade's songs: the same notes, played by
 * soft synthesized voices in a warm room - pads, glassy bells, mallets, a
 * round bass, breathy winds - in the spirit of the Tunic soundtrack. The
 * tunes that loop for hours (the lands, the towns, the dungeons, a fight)
 * are calm: softer voices, more room, the top eased. The set pieces, heard
 * once, are grand: fuller voices, brass and timpani, wider swells.
 *
 * Plain Web Audio on any BaseAudioContext: it renders offline (the music
 * render, tools/music/render.ts, whose files the game plays) and could as well
 * be played live on any context.
 */

import type { XmiEvent, XmiSequence } from './xmi.ts';

export type Voice = 'pad' | 'keys' | 'bell' | 'mallet' | 'pluck' | 'bass' | 'breath' | 'brass' | 'timpani' | 'swell';
export type Mood = 'calm' | 'grand';

/** How one General MIDI program is played in a tune: its voice, an octave shift, and its level. */
export interface Part {
  voice: Voice;
  octave?: number;
  level?: number;
}

/** A tune's arrangement: its mood, and any program played otherwise than its mood's way (voiceFor). */
export interface Arrangement {
  mood: Mood;
  parts?: Record<number, Part>;
}

/** The sixteen tunes (game/music.ts TUNE_FILES): calm where they loop for hours, grand for the set pieces. */
export const REMASTER: Record<string, Arrangement> = {
  'U5THEME.XMI': { mood: 'grand' },
  'BRITLAND.XMI': { mood: 'calm' },
  'HORNPIPE.XMI': { mood: 'calm' },
  'ENGGMNT.XMI': { mood: 'calm' },
  'STONES.XMI': { mood: 'grand' },
  'GREYSON.XMI': { mood: 'calm' },
  'FANFARE.XMI': { mood: 'calm' },
  'MONARCH.XMI': { mood: 'grand' },
  'TRNTLLA.XMI': { mood: 'calm' },
  'HALLS.XMI': { mood: 'calm' },
  'WRLDBLW.XMI': { mood: 'calm' },
  'BLCKTHRN.XMI': { mood: 'grand' },
  'LADYNAN.XMI': { mood: 'calm' },
  'REUNION.XMI': { mood: 'grand' },
  'RULEBRIT.XMI': { mood: 'grand' },
  'AMIGA.XMI': { mood: 'grand' },
};

/** The voice a General MIDI program is played by, in a mood. */
export function voiceFor(program: number, mood: Mood): Part {
  const calm = mood === 'calm';
  if (program === 14) return { voice: 'bell', level: 0.8 };
  if (program === 47) return { voice: 'timpani', level: calm ? 0.6 : 1 };
  if (program === 119) return { voice: 'swell', level: 0.5 };
  if (program === 46) return { voice: 'pluck', level: 0.9 }; // harp
  if (program === 6 || program === 24) return { voice: 'pluck', level: 0.9 }; // harpsichord, nylon guitar
  if (program < 8) return { voice: 'keys', level: 0.9 }; // pianos
  if (program < 16) return { voice: 'mallet', level: 0.9 }; // chromatic percussion
  if (program < 24) return { voice: 'pad', level: 0.8 }; // organs, harmonica
  if (program >= 32 && program < 40) return { voice: 'bass', level: 1 };
  if (program >= 40 && program < 56) return { voice: 'pad', level: 0.9 }; // strings, ensembles
  if (program >= 56 && program < 64) return calm ? { voice: 'pad', level: 0.8 } : { voice: 'brass', level: 0.9 };
  if (program >= 64 && program < 80) return { voice: 'breath', level: 0.85 }; // reeds, pipes
  if (program >= 80 && program < 104) return { voice: 'pad', level: 0.8 }; // synth leads, pads, effects
  return { voice: 'mallet', level: 0.8 };
}

/** A note as the voices take it: when it sounds (sustain pedal included), how hard, and in what part. */
export interface Note {
  channel: number;
  program: number;
  note: number;
  velocity: number;
  start: number;
  end: number;
}

/**
 * A tune's notes, from its events: each with the program its channel had as it began, and its end held on while the
 * channel's sustain pedal (controller 64) is down.
 */
export function notesOf(events: XmiEvent[]): Note[] {
  const program = new Array<number>(16).fill(0);
  const pedal = new Array<boolean>(16).fill(false);
  const open = new Map<string, Note[]>();
  const held: Note[][] = Array.from({ length: 16 }, () => []);
  const notes: Note[] = [];
  for (const e of events) {
    if (e.kind === 'program') program[e.channel] = e.program;
    else if (e.kind === 'controller' && e.controller === 64) {
      const down = e.value >= 64;
      if (pedal[e.channel] && !down) {
        for (const n of held[e.channel]) n.end = e.time;
        held[e.channel] = [];
      }
      pedal[e.channel] = down;
    } else if (e.kind === 'on') {
      const n: Note = { channel: e.channel, program: program[e.channel], note: e.note, velocity: e.velocity, start: e.time, end: e.time };
      notes.push(n);
      const key = `${e.channel}.${e.note}`;
      open.set(key, [...(open.get(key) ?? []), n]);
    } else if (e.kind === 'off') {
      const key = `${e.channel}.${e.note}`;
      const n = open.get(key)?.shift();
      if (!n) continue;
      n.end = e.time;
      if (pedal[e.channel]) held[e.channel].push(n);
    }
  }
  // A pedal never let up holds its notes to the end of their last event.
  const last = events.at(-1)?.time ?? 0;
  for (const h of held) for (const n of h) n.end = Math.max(n.end, last);
  return notes;
}

/** The room and the mix, by mood: how much reverb, how long it rings, how bright the whole, how hard notes are played. */
const ROOM: Record<Mood, { wet: number; decay: number; bright: number; curve: number; gain: number }> = {
  calm: { wet: 0.42, decay: 3.4, bright: 4200, curve: 1.6, gain: 0.8 },
  grand: { wet: 0.3, decay: 2.6, bright: 9000, curve: 1.2, gain: 1 },
};

/** A reverb's impulse: two decorrelated noise tails, decaying over `seconds`, the highs dying first. */
function impulse(ctx: BaseAudioContext, seconds: number, seed = 1): AudioBuffer {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = seed;
  const rnd = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.1 + 0.85 * t; // darker as it dies
      lp += k * (rnd() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, 2.2) * (i < 0.012 * ctx.sampleRate ? i / (0.012 * ctx.sampleRate) : 1);
    }
  }
  return buf;
}

const hz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

/** A channel's part bus: its volume and expression (a gain), its pan, and its bend (cents, into every voice's detune). */
interface Bus {
  gain: GainNode;
  pan: StereoPannerNode;
  bend: ConstantSourceNode;
}

/**
 * Play `seq` (`tune`, of REMASTER) into `out` from `at` (the context's seconds) - every note scheduled at once, as an
 * offline render wants, and any context could afford.
 */
export function playRemaster(ctx: BaseAudioContext, out: AudioNode, seq: XmiSequence, tune: string, at = ctx.currentTime): void {
  const arrangement = REMASTER[tune] ?? { mood: 'calm' };
  const room = ROOM[arrangement.mood];
  // The mix: the parts, dry and through the room, eased at the top, held under a soft limit.
  const mix = ctx.createGain();
  mix.gain.value = room.gain;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, room.decay);
  const send = ctx.createGain();
  send.gain.value = room.wet;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = room.bright;
  tone.Q.value = 0.5;
  const limit = ctx.createDynamicsCompressor();
  limit.threshold.value = -14;
  limit.knee.value = 12;
  limit.ratio.value = 4;
  limit.attack.value = 0.01;
  limit.release.value = 0.3;
  mix.connect(tone);
  mix.connect(send).connect(reverb).connect(tone);
  tone.connect(limit).connect(out);

  const buses = new Map<number, Bus>();
  const bus = (channel: number): Bus => {
    let b = buses.get(channel);
    if (!b) {
      const gain = ctx.createGain();
      gain.gain.value = (100 / 127) * 1;
      const pan = ctx.createStereoPanner();
      const bend = ctx.createConstantSource();
      bend.offset.value = 0;
      bend.start(at);
      gain.connect(pan).connect(mix);
      b = { gain, pan, bend };
      buses.set(channel, b);
    }
    return b;
  };
  // The parts' shaping, at its times: volume (7) and expression (11) as the bus's gain, pan (10), bend (±2 semitones).
  const volume = new Array<number>(16).fill(100);
  const expression = new Array<number>(16).fill(127);
  for (const e of seq.events) {
    const t = at + e.time;
    if (e.kind === 'controller') {
      const b = bus(e.channel);
      if (e.controller === 7 || e.controller === 11) {
        if (e.controller === 7) volume[e.channel] = e.value;
        else expression[e.channel] = e.value;
        b.gain.gain.setTargetAtTime((volume[e.channel] / 127) * (expression[e.channel] / 127), t, 0.02);
      } else if (e.controller === 10) b.pan.pan.setValueAtTime((e.value - 64) / 64, t);
    } else if (e.kind === 'bend') bus(e.channel).bend.offset.setValueAtTime(((e.value - 8192) / 8192) * 200, t);
  }
  for (const n of notesOf(seq.events)) {
    const part = arrangement.parts?.[n.program] ?? voiceFor(n.program, arrangement.mood);
    const b = bus(n.channel);
    const loud = Math.pow(n.velocity / 127, room.curve) * (part.level ?? 1);
    voice(
      ctx,
      part.voice,
      b,
      hz(n.note + 12 * (part.octave ?? 0)),
      at + n.start,
      at + Math.max(n.end, n.start + 0.05),
      loud,
      arrangement.mood,
    );
  }
}

/** An oscillator of `type` at `freq`, its detune following the bus's bend, started and stopped. */
function osc(ctx: BaseAudioContext, b: Bus, type: OscillatorType, freq: number, start: number, stop: number, cents = 0): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = cents;
  b.bend.connect(o.detune);
  o.start(start);
  o.stop(stop);
  return o;
}

/** A gain shaped as an envelope: up over `attack`, held to `end`, down over `release`; the node and when all is done. */
function envelope(
  ctx: BaseAudioContext,
  start: number,
  end: number,
  peak: number,
  attack: number,
  release: number,
  sustain = 1,
  decay = 0.3,
): { g: GainNode; done: number } {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, start);
  p.linearRampToValueAtTime(peak, start + attack);
  if (sustain < 1) p.setTargetAtTime(peak * sustain, start + attack, decay);
  p.setTargetAtTime(0, Math.max(end, start + attack), release / 4);
  return { g, done: Math.max(end, start + attack) + release * 1.5 };
}

/** One note in one voice, into its channel's bus. */
function voice(ctx: BaseAudioContext, v: Voice, b: Bus, f: number, start: number, end: number, loud: number, mood: Mood): void {
  const into = b.gain;
  switch (v) {
    case 'pad': {
      // Three saws a little apart and a sine beneath, low-passed: a warm, slow pad.
      const attack = mood === 'calm' ? 0.35 : 0.18;
      const { g, done } = envelope(ctx, start, end, loud * 0.11, attack, mood === 'calm' ? 1.1 : 0.7, 0.85, 0.6);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(9000, 700 + f * 1.5 + loud * 900);
      lp.Q.value = 0.4;
      for (const c of [-7, 0, 7]) osc(ctx, b, 'sawtooth', f, start, done, c).connect(lp);
      const sub = osc(ctx, b, 'sine', f / 2, start, done);
      const subG = ctx.createGain();
      subG.gain.value = 0.6;
      sub.connect(subG).connect(lp);
      lp.connect(g).connect(into);
      break;
    }
    case 'keys': {
      // A soft electric piano: a sine whose frequency a decaying modulator stirs.
      const { g, done } = envelope(ctx, start, end, loud * 0.35, 0.006, 0.6, 0.45, 0.9);
      const carrier = osc(ctx, b, 'sine', f, start, done);
      const mod = osc(ctx, b, 'sine', f, start, done);
      const index = ctx.createGain();
      index.gain.setValueAtTime(f * 1.4, start);
      index.gain.setTargetAtTime(f * 0.15, start, 0.25);
      mod.connect(index).connect(carrier.frequency);
      carrier.connect(g).connect(into);
      break;
    }
    case 'bell': {
      // A glassy bell: an inharmonic modulator dying away, the tone ringing on.
      const ring = Math.max(end, start + 1.6);
      const { g, done } = envelope(ctx, start, ring, loud * 0.22, 0.003, 1.8, 0.35, 0.8);
      const carrier = osc(ctx, b, 'sine', f, start, done);
      const mod = osc(ctx, b, 'sine', f * 3.5, start, done);
      const index = ctx.createGain();
      index.gain.setValueAtTime(f * 2.2, start);
      index.gain.setTargetAtTime(f * 0.2, start, 0.4);
      mod.connect(index).connect(carrier.frequency);
      carrier.connect(g).connect(into);
      break;
    }
    case 'mallet': {
      // Wood or glass struck: a sine and a high partial, dying of themselves.
      const stop = start + 1.2;
      for (const [ratio, level, decay] of [
        [1, 0.3, 0.35],
        [4, 0.06, 0.08],
      ] as const) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(loud * level, start + 0.003);
        g.gain.setTargetAtTime(0, start + 0.003, decay);
        osc(ctx, b, 'sine', f * ratio, start, stop)
          .connect(g)
          .connect(into);
      }
      break;
    }
    case 'pluck': {
      // A string plucked: a triangle through a filter that closes as it rings.
      const ring = Math.min(end, start + 2.5);
      const { g, done } = envelope(ctx, start, ring, loud * 0.3, 0.004, 0.35, 0.25, 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(Math.min(9000, f * 8), start);
      lp.frequency.setTargetAtTime(Math.max(300, f * 1.5), start, 0.18);
      osc(ctx, b, 'triangle', f, start, done).connect(lp);
      lp.connect(g).connect(into);
      break;
    }
    case 'bass': {
      // A round bass: a sine and a little triangle, low-passed.
      const { g, done } = envelope(ctx, start, end, loud * 0.42, 0.012, 0.18, 0.9, 0.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      osc(ctx, b, 'sine', f, start, done).connect(lp);
      const tri = osc(ctx, b, 'triangle', f, start, done);
      const triG = ctx.createGain();
      triG.gain.value = 0.25;
      tri.connect(triG).connect(lp);
      lp.connect(g).connect(into);
      break;
    }
    case 'breath': {
      // A wind: a sine, a breath of triangle, and a slow vibrato that comes in as the note is held.
      const { g, done } = envelope(ctx, start, end, loud * 0.26, 0.07, 0.2, 0.92, 0.5);
      const tone = osc(ctx, b, 'sine', f, start, done);
      const edge = osc(ctx, b, 'triangle', f, start, done);
      const edgeG = ctx.createGain();
      edgeG.gain.value = 0.18;
      const lfo = osc(ctx, b, 'sine', 5.2, start, done);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, start);
      depth.gain.linearRampToValueAtTime(9, start + 0.5);
      lfo.connect(depth);
      depth.connect(tone.detune);
      depth.connect(edge.detune);
      tone.connect(g);
      edge.connect(edgeG).connect(g);
      g.connect(into);
      break;
    }
    case 'brass': {
      // Warm brass: a saw whose filter opens with the breath, then settles.
      const { g, done } = envelope(ctx, start, end, loud * 0.16, 0.045, 0.22, 0.85, 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1;
      lp.frequency.setValueAtTime(f * 1.2, start);
      lp.frequency.linearRampToValueAtTime(Math.min(8000, f * (3 + loud * 4)), start + 0.08);
      lp.frequency.setTargetAtTime(Math.min(6000, f * 2.5), start + 0.08, 0.3);
      for (const c of [-4, 4]) osc(ctx, b, 'sawtooth', f, start, done, c).connect(lp);
      lp.connect(g).connect(into);
      break;
    }
    case 'timpani': {
      // A soft timpani: a sine whose pitch settles as it booms, over a low thump.
      const stop = start + 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(loud * 0.6, start + 0.005);
      g.gain.setTargetAtTime(0, start + 0.005, 0.45);
      const o = osc(ctx, b, 'sine', f * 1.08, start, stop);
      o.frequency.setTargetAtTime(f, start, 0.04);
      o.connect(g).connect(into);
      break;
    }
    case 'swell': {
      // A cymbal played backwards: noise rising to the note's end, high-passed, then gone.
      const n = Math.max(0.1, end - start);
      const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * (n + 0.1)), ctx.sampleRate);
      const d = buf.getChannelData(0);
      // Seeded by where the note begins, so a render comes out the same each time.
      let s = Math.round(start * 1000) + 1;
      for (let i = 0; i < d.length; i++) d[i] = ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(loud * 0.08, start + n);
      g.gain.linearRampToValueAtTime(0, start + n + 0.08);
      src.connect(hp).connect(g).connect(into);
      src.start(start);
      src.stop(start + n + 0.1);
      break;
    }
  }
}
