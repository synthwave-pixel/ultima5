import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notesOf, REMASTER, voiceFor, type Voice } from '../src/audio/remaster.ts';
import { readXmiEvents, type XmiEvent } from '../src/audio/xmi.ts';
import { TUNE_FILES } from '../src/game/music.ts';

const VOICES: Voice[] = ['pad', 'keys', 'bell', 'mallet', 'pluck', 'bass', 'breath', 'brass', 'timpani', 'swell'];
const on = (time: number, note = 60, channel = 0): XmiEvent => ({ time, kind: 'on', channel, note, velocity: 100 });
const off = (time: number, note = 60, channel = 0): XmiEvent => ({ time, kind: 'off', channel, note });
const pedal = (time: number, value: number, channel = 0): XmiEvent => ({ time, kind: 'controller', channel, controller: 64, value });

describe('the Remastered arrangement', () => {
  it('has an entry for every tune, and for no other', () => {
    expect(Object.keys(REMASTER).sort()).toEqual([...TUNE_FILES].sort());
  });

  it('voices every program the tunes use, in either mood', () => {
    const used = new Set<number>();
    for (const name of TUNE_FILES)
      for (const e of readXmiEvents(new Uint8Array(readFileSync(`public/music/${name}`))).events)
        if (e.kind === 'program') used.add(e.program);
    expect(used.size).toBeGreaterThan(5);
    for (const program of used)
      for (const mood of ['calm', 'grand'] as const) {
        const part = voiceFor(program, mood);
        expect(VOICES, `program ${program} ${mood}`).toContain(part.voice);
        expect(part.level ?? 1).toBeGreaterThan(0);
      }
  });
});

describe('the notes of a tune', () => {
  it('end where they are let go, with no pedal', () => {
    const [n] = notesOf([on(1), off(2)]);
    expect([n.start, n.end]).toEqual([1, 2]);
  });

  it('are held on while the sustain pedal is down, to the moment it is let up', () => {
    const [n] = notesOf([pedal(0, 127), on(1), off(2), pedal(3, 0)]);
    expect(n.end).toBe(3);
    // A note let go and a pedal pressed after it holds nothing.
    const [m] = notesOf([on(1), off(2), pedal(2.5, 127), pedal(3, 0)]);
    expect(m.end).toBe(2);
  });

  it('are held by their own channel’s pedal alone', () => {
    const [n] = notesOf([pedal(0, 127, 1), on(1, 60, 0), off(2, 60, 0), pedal(3, 0, 1)]);
    expect(n.end).toBe(2);
  });

  it('are held to the last event where the pedal is never let up', () => {
    const [n] = notesOf([pedal(0, 127), on(1), off(2), on(5, 72, 1)]);
    expect(n.end).toBe(5);
  });

  it('take the program their channel had as they began', () => {
    const notes = notesOf([
      { time: 0, kind: 'program', channel: 0, program: 46 },
      on(1),
      { time: 1.5, kind: 'program', channel: 0, program: 14 },
      off(2),
      on(3),
      off(4),
    ]);
    expect(notes.map((n) => n.program)).toEqual([46, 14]);
  });
});
