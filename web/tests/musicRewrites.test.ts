import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readXmiEvents, type XmiSequence } from '../src/audio/xmi.ts';
import { rewritten } from '../tools/music/rewrites.ts';

const upgrade = (tune: string): XmiSequence => readXmiEvents(new Uint8Array(readFileSync(`public/music/${tune}`)));

describe('a rewritten tune', () => {
  const reunion = rewritten('REUNION.XMI', upgrade('REUNION.XMI'));

  it('is a tune a synthesizer can play: in time order, each note ended after it starts, an end before a start at one moment', () => {
    const { events } = reunion;
    for (let i = 1; i < events.length; i++) {
      expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time);
      if (events[i].time === events[i - 1].time) expect(events[i - 1].kind === 'on' && events[i].kind === 'off').toBe(false);
    }
    const sounding = new Map<string, number>();
    for (const e of events) {
      if (e.kind === 'on') sounding.set(`${e.channel}:${e.note}`, e.time);
      if (e.kind === 'off') {
        expect(sounding.get(`${e.channel}:${e.note}`)).toBeLessThan(e.time);
        sounding.delete(`${e.channel}:${e.note}`);
      }
    }
    expect(sounding.size).toBe(0);
    expect(reunion.length).toBe(events[events.length - 1].time);
  });

  it('is about as long as the Upgrade’s, and its melody always the highest part', () => {
    expect(Math.abs(reunion.length - upgrade('REUNION.XMI').length)).toBeLessThan(2);
    const sounding = new Map<number, number>();
    for (const e of reunion.events) {
      if (e.kind === 'off') sounding.delete(e.channel * 128 + e.note);
      if (e.kind !== 'on') continue;
      sounding.set(e.channel * 128 + e.note, e.note);
      const melody = [...sounding].filter(([k]) => k >> 7 === 1).map(([, n]) => n);
      const others = [...sounding].filter(([k]) => k >> 7 !== 1).map(([, n]) => n);
      if (melody.length && others.length) expect(Math.max(...others)).toBeLessThan(Math.min(...melody));
    }
  });

  it('is no longer the Upgrade’s notes, while every other tune is', () => {
    expect(reunion).not.toEqual(upgrade('REUNION.XMI'));
    const britland = upgrade('BRITLAND.XMI');
    expect(rewritten('BRITLAND.XMI', britland)).toBe(britland);
  });
});
