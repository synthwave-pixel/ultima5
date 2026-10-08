/**
 * orchestrate.ts (an experiment: tools/music/styles)
 *
 * The Upgrade's tunes arranged anew for real instruments - General MIDI's,
 * played through MuseScore General (tools/music/original.ts). Not only the
 * old parts given new instruments: from the tune's key, chords and form
 * (harmony.ts) each style writes its own accompaniment - chords voiced
 * with smooth voice-leading, counter-melodies, the melody in thirds on its
 * repeats, new bass lines, ornaments - and orchestrates by section: a
 * sparse first statement, fuller repeats, contrasting middle sections, the
 * whole band at the peak, fills into each phrase.
 *
 *   strings     a string orchestra
 *   orchestra   woodwinds, strings, horns, harp, brass and timpani
 *   consort     a Renaissance consort: recorders, lute, harpsichord, viol
 *   celtic      fiddle and whistle, harp and guitar, cello, a bodhran
 *   piano       one piano, both hands written anew, pedalled
 *
 * A tune heard over and over (all but HEARD_ONCE) is arranged gentler, to be
 * easy on the ear for hours: its melody settled down to sit no higher than
 * the middle of the treble, mellower instruments where a bright one would
 * have taken it (horns, not a trumpet; a violin, not a fiddle; nylon
 * strings, not steel), a narrower range of dynamics, softer swells, the
 * harp lower and the bodhran softer, no cymbal.
 *
 * An ominous tune (Blackthorn's) goes further: its melody low, on each
 * style's darker instruments (clarinet and bassoon, horns, viola, cello; no
 * whistle), over a drone on the note its bass dwells on and a soft
 * heartbeat of timpani on every bar.
 */

import { notesOf, REMASTER, type Note } from '../../../src/audio/remaster.ts';
import { HEARD_ONCE } from '../../../src/game/music.ts';
import type { XmiEvent, XmiSequence } from '../../../src/audio/xmi.ts';
import { findGrid, findRoles, type Role } from './analysis.ts';
import {
  bassLine,
  counterMelody,
  diatonic,
  findChords,
  findKey,
  findPhrases,
  graces,
  humanize,
  inThirds,
  LOW,
  pedalOf,
  phraseAt,
  settled,
  trill,
  voice,
  type Chord,
} from './harmony.ts';

export const SAMPLED = ['strings', 'orchestra', 'consort', 'celtic', 'piano'] as const;
export type Sampled = (typeof SAMPLED)[number];

/** General MIDI's programs, by name. */
const GM = {
  piano: 0,
  harpsichord: 6,
  nylon: 24,
  steel: 25,
  violin: 40,
  viola: 41,
  cello: 42,
  contrabass: 43,
  tremolo: 44,
  pizzicato: 45,
  harp: 46,
  timpani: 47,
  strings: 48,
  slowStrings: 49,
  trumpet: 56,
  horn: 60,
  oboe: 68,
  bassoon: 70,
  clarinet: 71,
  flute: 73,
  recorder: 74,
  whistle: 78,
  fiddle: 110,
} as const;

/** General MIDI's drum keys (channel 10). */
const DRUM = {
  lowConga: 64,
  highConga: 63,
  tambourine: 54,
  lowTom: 45,
  midTom: 47,
  bigTom: 41,
  crash: 49,
  rideBell: 53,
  kick: 36,
} as const;

/** A performance being written: its events, and a channel for each instrument as it is first wanted. */
class Score {
  readonly events: XmiEvent[] = [];
  private readonly channels = new Map<string, number>();
  private next = 0;

  /** The channel `name` plays on (program `program`, its level, pan and room set at the start). */
  channel(name: string, program: number, volume = 100, pan = 64, reverb = 60): number {
    let ch = this.channels.get(name);
    if (ch === undefined) {
      ch = this.next++;
      if (ch === 9) ch = this.next++; // channel 10 is the drums'
      if (ch > 15) throw new Error('more instruments than channels');
      this.channels.set(name, ch);
      this.events.push({ time: 0, kind: 'program', channel: ch, program });
      for (const [controller, value] of [
        [7, volume],
        [10, pan],
        [91, reverb],
        [11, 110],
      ])
        this.events.push({ time: 0, kind: 'controller', channel: ch, controller, value });
    }
    return ch;
  }

  note(channel: number, note: number, velocity: number, start: number, end: number): void {
    if (note < 12 || note > 115 || end <= start + 0.005) return;
    const v = Math.max(1, Math.min(127, Math.round(velocity)));
    this.events.push({ time: Math.max(0, start), kind: 'on', channel, note, velocity: v });
    this.events.push({ time: end, kind: 'off', channel, note });
  }

  notes(channel: number, notes: Note[], scale = 1): void {
    for (const n of notes) this.note(channel, n.note, n.velocity * scale, n.start, n.end);
  }

  cc(channel: number, controller: number, value: number, time: number): void {
    this.events.push({
      time: Math.max(0, time),
      kind: 'controller',
      channel,
      controller,
      value: Math.max(0, Math.min(127, Math.round(value))),
    });
  }

  drum(key: number, velocity: number, time: number): void {
    this.note(9, key, velocity, time, time + 0.1);
  }

  /** A held line swelling and easing on its channel's expression (controller 11). */
  swell(channel: number, start: number, end: number, low: number, high: number): void {
    if (end - start < 0.5) return;
    this.cc(channel, 11, low, start);
    this.cc(channel, 11, high, start + (end - start) * 0.45);
    this.cc(channel, 11, low + (high - low) * 0.6, end);
  }

  sequence(length: number): XmiSequence {
    const rank: Record<XmiEvent['kind'], number> = { off: 0, program: 1, controller: 2, bend: 3, on: 4 };
    this.events.sort((a, b) => a.time - b.time || rank[a.kind] - rank[b.kind]);
    return { events: this.events, length };
  }
}

/** The notes of `notes` sounding within [start, end). */
const within = (notes: Note[], start: number, end: number): Note[] => notes.filter((n) => n.start >= start - 1e-3 && n.start < end - 1e-3);

/** A pattern of a voiced chord's notes, one at a time every `step` through the chord: as a harp, a lute or a left hand picks them. */
function broken(c: Chord, voicing: number[], step: number, pattern: number[], velocity: number): Note[] {
  const out: Note[] = [];
  let k = 0;
  for (let t = c.start; t < c.end - 1e-3; t += step, k++) {
    const i = pattern[k % pattern.length];
    out.push({
      channel: 0,
      program: 0,
      note: voicing[Math.min(voicing.length - 1, i)],
      velocity: velocity * (k % pattern.length === 0 ? 1 : 0.82),
      start: t,
      end: t + step * 1.8,
    });
  }
  return out;
}

/** `seq` (`tune`) arranged for `style`; `ominous` for a tune to be played dark. */
export function orchestrate(seq: XmiSequence, tune: string, style: Sampled, ominous = false): XmiSequence {
  const notes = notesOf(seq.events);
  const grid = findGrid(notes);
  const roles = findRoles(notes);
  const gentle = !HEARD_ONCE.includes(tune);
  const of = (role: Role): Note[] => notes.filter((n) => roles.get(n.channel) === role);
  const melody = ominous ? settled(of('melody'), LOW) : gentle ? settled(of('melody')) : of('melody');
  const bass = of('bass');
  const struck = of('percussion');
  const key = findKey(notes);
  const end = seq.length;
  const chords = findChords(notes, roles, grid, end);
  const phrases = findPhrases(melody, grid, end);
  const grand = (REMASTER[tune]?.mood ?? 'calm') === 'grand';
  const s = new Score();
  const beat = grid.beat;
  /** The dynamic of the moment: the phrase's energy (a gentle tune's within a narrower range), the tune's mood. */
  const dyn = (t: number): number =>
    (gentle ? 0.62 + 0.3 * phraseAt(phrases, t).energy : 0.55 + 0.45 * phraseAt(phrases, t).energy) * (grand ? 1 : 0.88);
  const mel = humanize(melody, 11);

  switch (style) {
    case 'strings': {
      const solo = s.channel('violin', ominous ? GM.viola : GM.violin, 105, 72, 80);
      const violins = s.channel('violins', GM.strings, 108, 48, 90);
      const violas = s.channel('violas', GM.viola, 92, 78, 85);
      const inner = s.channel('inner', GM.slowStrings, 88, 64, 95);
      const tremolo = s.channel('tremolo', GM.tremolo, 80, 60, 90);
      const cellos = s.channel('cellos', GM.cello, 100, 40, 80);
      const basses = s.channel('basses', GM.contrabass, 95, 54, 70);
      const pizz = s.channel('pizzicato', GM.pizzicato, 95, 64, 70);
      const counter = counterMelody(melody, chords, key, grid, 62, 79);
      let voicing: number[] | null = null;
      for (const p of phrases) {
        const m = within(mel, p.start, p.end);
        const middle = p.label !== 'A';
        // The melody: a solo violin alone to begin; the section on its repeats; the cellos singing it in the middle
        // sections, the violins' counter-melody over them.
        if (p.index === 0) s.notes(solo, m, dyn(p.start) * 0.95);
        else if (middle) {
          s.notes(
            cellos,
            m.map((n) => ({ ...n, note: n.note > 64 ? n.note - 12 : n.note })),
            dyn(p.start),
          );
          s.notes(violins, within(counter, p.start, p.end), dyn(p.start) * 0.8);
        } else {
          s.notes(violins, m, dyn(p.start) * 0.92);
          if (!gentle) s.notes(solo, m, dyn(p.start) * 0.7);
          if (p.repeat > 1)
            s.notes(
              violas,
              within(counter, p.start, p.end).map((n) => ({ ...n, note: n.note - 12 })),
              dyn(p.start) * 0.7,
            );
        }
        for (const n of m) s.swell(middle ? cellos : violins, n.start, n.end, 82, gentle ? 102 : 118);
        // The harmony, re-voiced: held chords, trembling at the peak.
        for (const c of chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3)) {
          voicing = voice(c, 55, 74, p.energy > 0.75 ? 4 : 3, voicing);
          const ch = p.energy > 0.92 && grand && !gentle ? tremolo : inner;
          for (const n of voicing) s.note(ch, n, 70 * dyn(c.start), c.start, c.end);
        }
        // The bass: plucked to begin, bowed after, the basses an octave beneath.
        const b = within(bass, p.start, p.end);
        if (p.energy < 0.5)
          for (const n of bassLine(
            chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3),
            grid,
            'root',
            36,
          ))
            s.note(pizz, n.note, n.velocity * dyn(n.start), n.start, n.start + beat * 0.5);
        else
          for (const n of b) {
            s.note(cellos, n.note, n.velocity * dyn(n.start), n.start, n.end);
            s.note(basses, n.note - 12, n.velocity * dyn(n.start) * 0.85, n.start, n.end);
          }
      }
      for (const n of struck)
        if (n.program === GM.timpani) s.note(s.channel('timpani', GM.timpani, 90, 64, 80), n.note, n.velocity, n.start, n.end);
      break;
    }
    case 'orchestra': {
      const flute = s.channel('flute', ominous ? GM.clarinet : GM.flute, 105, 70, 70);
      const oboe = s.channel('oboe', ominous ? GM.bassoon : GM.oboe, 95, 58, 70);
      const clarinet = s.channel('clarinet', GM.clarinet, 90, 80, 70);
      const trumpet = s.channel('trumpet', GM.trumpet, 98, 64, 75);
      const horns = s.channel('horns', GM.horn, 90, 76, 85);
      const violins = s.channel('violins', GM.strings, 105, 46, 90);
      const harp = s.channel('harp', GM.harp, 92, 36, 80);
      const cellos = s.channel('cellos', GM.cello, 100, 50, 75);
      const basses = s.channel('basses', GM.contrabass, 92, 60, 70);
      const timpani = s.channel('timpani', GM.timpani, 100, 64, 85);
      const counter = counterMelody(melody, chords, key, grid, gentle ? 62 : 67, gentle ? 79 : 84);
      let strings: number[] | null = null;
      let brass: number[] | null = null;
      const low = Math.max(36, Math.min(48, ((bass.length ? Math.min(...bass.map((n) => n.note)) : 43) % 12) + 36));
      for (const p of phrases) {
        const m = within(mel, p.start, p.end);
        const cs = chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3);
        const peak = p.energy >= 0.9;
        // The melody passed about the orchestra, section by section.
        if (p.index === 0) s.notes(flute, m, dyn(p.start));
        else if (peak) {
          s.notes(gentle ? horns : trumpet, m, dyn(p.start));
          s.notes(violins, m, dyn(p.start) * 0.9);
          s.notes(
            horns,
            inThirds(m, key).map((n) => ({ ...n, note: n.note - 12 })),
            dyn(p.start) * 0.75,
          );
        } else if (p.label !== 'A') {
          s.notes(violins, m, dyn(p.start));
          s.notes(flute, within(counter, p.start, p.end), dyn(p.start) * 0.8);
        } else {
          s.notes(oboe, m, dyn(p.start));
          s.notes(clarinet, inThirds(m, key), dyn(p.start) * 0.75);
        }
        // Strings holding the harmony, horns under it from the repeats on; the harp picking it out.
        for (const c of cs) {
          strings = voice(c, 55, 76, 4, strings);
          if (!peak || p.label !== 'A') for (const n of strings) s.note(violins, n, 62 * dyn(c.start), c.start, c.end);
          if (p.index > 0) {
            brass = voice(c, 48, 65, 3, brass);
            for (const n of brass) s.note(horns, n, 58 * dyn(c.start), c.start, c.end);
          }
          s.notes(harp, broken(c, voice(c, 50, 79, 6, null), beat / 2, [0, 2, 4, 5, 3, 1], 70 * dyn(c.start)));
        }
        for (const n of within(bass, p.start, p.end)) {
          s.note(cellos, n.note, n.velocity * dyn(n.start), n.start, n.end);
          if (p.index > 0) s.note(basses, n.note - 12, n.velocity * dyn(n.start) * 0.85, n.start, n.end);
        }
        // Timpani on the bar at the peak, rolling into the next phrase; a cymbal on its downbeat.
        if (peak && grand) {
          for (let t = p.start; t < p.end - 1e-3; t += beat * 4) s.note(timpani, low, 100, t, t + 0.5);
          if (!gentle) s.drum(DRUM.crash, 80, p.start);
        }
        if (p.energy > 0.7 && !p.last)
          for (let t = p.end - beat; t < p.end - 1e-3; t += beat / 6)
            s.note(timpani, low, 55 + 45 * ((t - (p.end - beat)) / beat), t, t + 0.12);
      }
      for (const n of struck) if (n.program === GM.timpani) s.note(timpani, n.note, n.velocity, n.start, n.end);
      break;
    }
    case 'consort': {
      const recorder = s.channel('recorder', GM.recorder, 105, 56, 45);
      const alto = s.channel('alto recorder', GM.recorder, 85, 76, 45);
      const lute = s.channel('lute', GM.nylon, 100, 40, 40);
      const harpsichord = s.channel('harpsichord', GM.harpsichord, gentle ? 60 : 72, 88, 40);
      const viol = s.channel('viol', GM.cello, 85, 66, 40);
      const top = ominous ? 67 : gentle ? 79 : 84;
      const fit = (n: number): number => (n > top ? n - 12 : n < top - 24 ? n + 12 : n);
      for (const p of phrases) {
        const m = within(mel, p.start, p.end).map((n) => ({ ...n, note: fit(n.note) }));
        const cs = chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3);
        // The melody, its longest notes trilled on the repeats, grace notes before the long ones; a second recorder
        // a third below from the second time through.
        for (const n of m) {
          if (p.repeat > 0 && n.end - n.start >= beat * 1.5) s.notes(recorder, trill(n, key, beat), dyn(n.start));
          else s.note(recorder, n.note, n.velocity * dyn(n.start), n.start, n.end);
        }
        s.notes(recorder, graces(m, key, beat, 3), dyn(p.start) * 0.9);
        if (p.repeat > 0) s.notes(alto, inThirds(m, key), dyn(p.start) * 0.8);
        // The lute's broken chords in the first sections, strummed in the others; the harpsichord's Alberti figure.
        for (const c of cs) {
          const v = voice(c, 48, 67, 4, null);
          if (p.label === 'A') s.notes(lute, broken(c, v, beat / 2, [0, 2, 1, 3], 78 * dyn(c.start)));
          else
            for (let t = c.start; t < c.end - 1e-3; t += beat)
              v.forEach((n, i) => s.note(lute, n, 70 * dyn(t), t + i * 0.015, t + beat * 0.9));
          if (p.index > 0) s.notes(harpsichord, broken(c, voice(c, 55, 72, 3, null), beat / 2, [0, 2, 1, 2], 58 * dyn(c.start)));
        }
        // The viol: roots and fifths to begin, the tune's own bass once it grows.
        if (p.energy < 0.65) s.notes(viol, bassLine(cs, grid, 'root', 41), dyn(p.start) * 0.85);
        else s.notes(viol, within(bass, p.start, p.end), dyn(p.start) * 0.85);
        // Tambourine and hand drum, a roll of tambourine into the next phrase.
        for (let t = p.start, k = 0; t < p.end - 1e-3; t += beat, k++) {
          if (k % 2 === 1) s.drum(DRUM.tambourine, (grand ? 70 : 48) * dyn(t), t);
          else s.drum(DRUM.lowConga, (grand ? 80 : 58) * dyn(t), t);
          if (p.energy > 0.6 && k % 4 === 3) s.drum(DRUM.highConga, 45 * dyn(t), t + beat / 2);
        }
        if (!p.last && p.energy > 0.5) for (let t = p.end - beat; t < p.end - 1e-3; t += beat / 4) s.drum(DRUM.tambourine, 50 * dyn(t), t);
      }
      break;
    }
    case 'celtic': {
      const fiddle = s.channel('fiddle', ominous ? GM.cello : gentle ? GM.violin : GM.fiddle, gentle ? 90 : 100, 70, 55);
      const whistle = s.channel('whistle', GM.whistle, gentle ? 68 : 82, 52, 60);
      const harp = s.channel('harp', GM.harp, 95, 36, 60);
      const guitar = s.channel('guitar', gentle ? GM.nylon : GM.steel, gentle ? 66 : 78, 92, 45);
      const cello = s.channel('cello', GM.cello, 90, 64, 50);
      const counter = counterMelody(melody, chords, key, grid, gentle ? 67 : 74, gentle ? 84 : 91);
      /** The whistle's highest note: a gentle tune's an octave and a third lower. */
      const high = gentle ? 81 : 96;
      let strum: number[] | null = null;
      for (const p of phrases) {
        const m = within(mel, p.start, p.end);
        const cs = chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3);
        // The fiddle, with cuts before its long notes; the whistle silent the first time, then an octave above, then
        // its own counter-melody in the middle sections, a third above at the peak.
        s.notes(fiddle, m, dyn(p.start));
        s.notes(fiddle, graces(m, key, beat, 2, 2), dyn(p.start) * 0.8);
        if (ominous) {
          // No whistle.
        } else if (p.label !== 'A') s.notes(whistle, within(counter, p.start, p.end), dyn(p.start) * (gentle ? 0.6 : 0.75));
        else if (p.energy >= 0.9)
          s.notes(
            whistle,
            m.map((n) => ({ ...n, note: diatonic(n.note, 2, key) + 12 > high ? diatonic(n.note, 2, key) : diatonic(n.note, 2, key) + 12 })),
            dyn(p.start) * 0.6,
          );
        else if (p.index > 0)
          s.notes(
            whistle,
            m.map((n) => ({ ...n, note: n.note + 12 > high ? n.note : n.note + 12 })),
            dyn(p.start) * 0.55,
          );
        // The harp rippling up and down, the guitar strumming down-down-up from the second phrase.
        for (const c of cs) {
          s.notes(
            harp,
            broken(c, voice(c, gentle ? 45 : 50, gentle ? 74 : 81, 7, null), beat / 2, [0, 2, 4, 6, 5, 3, 1, 3], 72 * dyn(c.start)),
          );
          strum = voice(c, 48, 67, 4, strum);
          if (p.index > 0)
            for (let t = c.start, k = 0; t < c.end - 1e-3; t += beat / 2, k++) {
              const up = k % 4 === 3;
              if (k % 4 === 2) continue;
              (up ? [...strum].reverse() : strum).forEach((n, i) =>
                s.note(guitar, n, (up ? 50 : 68) * dyn(t), t + i * 0.012, t + beat * 0.45),
              );
            }
        }
        s.notes(cello, bassLine(cs, grid, 'root', 36), dyn(p.start) * 0.9);
        // The bodhran: eighths, the beat hardest, a triplet roll into the next phrase.
        for (let t = p.start, k = 0; t < p.end - 1e-3; t += beat / 2, k++)
          s.drum(k % 2 === 0 ? DRUM.lowTom : DRUM.bigTom, (k % 8 === 0 ? 88 : k % 2 === 0 ? 66 : 44) * dyn(t) * (gentle ? 0.75 : 1), t);
        if (!p.last) for (let t = p.end - beat; t < p.end - 1e-3; t += beat / 3) s.drum(DRUM.midTom, 70 * dyn(t) * (gentle ? 0.75 : 1), t);
      }
      break;
    }
    case 'piano': {
      const piano = s.channel('piano', GM.piano, 112, 64, 72);
      let inner: number[] | null = null;
      for (const p of phrases) {
        const m = within(mel, p.start, p.end);
        const cs = chords.filter((c) => c.start >= p.start - 1e-3 && c.start < p.end - 1e-3);
        const peak = p.energy >= 0.9;
        // The right hand: the melody, its arc rising to the phrase's middle; in octaves at the peak; a voice of the
        // chord beneath it where the harmony moves.
        const mid = (p.start + p.end) / 2;
        for (const n of m) {
          const arc = 0.85 + 0.15 * (1 - Math.abs(n.start - mid) / ((p.end - p.start) / 2));
          s.note(piano, n.note, n.velocity * dyn(n.start) * arc, n.start, n.end);
          if (peak) s.note(piano, n.note - 12, n.velocity * dyn(n.start) * 0.7 * arc, n.start, n.end);
        }
        // The left hand, a figure for each section: a broken chord spanning a tenth, an Alberti figure, block
        // chords over an octave bass at the peak.
        for (const c of cs) {
          inner = voice(c, 57, 67, 2, inner);
          if (!peak) for (const n of inner) s.note(piano, n, 48 * dyn(c.start), c.start, c.end);
          const root = 36 + ((c.root - 36 + 120) % 12);
          const fifth = root + 7;
          const tenth = root + (c.quality === 'min' || c.quality === 'm7' || c.quality === 'dim' ? 15 : 16);
          if (peak) {
            for (let t = c.start; t < c.end - 1e-3; t += beat * 2) {
              s.note(piano, root - 12, 90 * dyn(t), t, t + beat * 1.9);
              s.note(piano, root, 85 * dyn(t), t, t + beat * 1.9);
              for (const n of voice(c, 52, 64, 3, null)) s.note(piano, n, 62 * dyn(t), t + beat, t + beat * 1.9);
            }
          } else if (p.label === 'A' && p.repeat > 0) {
            s.notes(
              piano,
              broken(c, [root, fifth, root + 12 + ((c.tones[1] - c.root + 12) % 12)], beat / 2, [0, 2, 1, 2], 62 * dyn(c.start)),
            );
          } else {
            s.notes(piano, broken(c, [root, fifth, tenth, fifth + 12], beat / 2, [0, 1, 2, 3, 2, 1], 60 * dyn(c.start)));
          }
          // The pedal caught again as each chord begins.
          s.cc(piano, 64, 0, c.start - 0.02);
          s.cc(piano, 64, 127, c.start + 0.03);
        }
      }
      s.cc(piano, 64, 0, end);
      break;
    }
  }
  if (ominous) {
    // The drone: the bass's own note and its fifth, held low through each phrase, swelling with it; the piano's a low
    // octave struck every other bar. And a heartbeat on every bar, two beats of timpani (on the piano, low).
    const low = 31 + ((pedalOf(bass) - 7 + 12) % 12);
    const bar = beat * 4;
    for (const p of phrases.length ? phrases : [{ start: 0, end }]) {
      if (style === 'piano') {
        for (let t = p.start; t < p.end - 1e-3; t += bar * 2) s.note(s.channel('piano', GM.piano), low, 60 * dyn(t), t, t + bar * 2);
        continue;
      }
      const drone = s.channel('drone', GM.slowStrings, 82, 64, 90);
      for (const n of [low + 12, low + 19]) s.note(drone, n, 70, p.start, p.end);
      s.swell(drone, p.start, p.end, 70, 105);
    }
    const heart = style === 'piano' ? s.channel('piano', GM.piano) : s.channel('heartbeat', GM.timpani, 90, 64, 70);
    for (let t = grid.first; t < end - beat; t += bar) {
      s.note(heart, low + 12, 64 * dyn(t), t, t + 0.4);
      s.note(heart, low + 12, 44 * dyn(t), t + beat * 0.75, t + beat * 0.75 + 0.4);
    }
  }
  return s.sequence(end);
}
