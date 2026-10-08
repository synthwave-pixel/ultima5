import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readXmiEvents } from '../src/audio/xmi.ts';
import { TUNE_FILES } from '../src/game/music.ts';

const file = (name: string): Uint8Array => new Uint8Array(readFileSync(`public/music/${name}`));

describe('the Upgrade’s tunes read as a synthesizer takes them', () => {
  it('end every note they start, at its length, in time order', () => {
    for (const name of TUNE_FILES) {
      const { events } = readXmiEvents(file(name));
      const open = new Map<string, number>();
      for (let k = 1; k < events.length; k++) expect(events[k].time).toBeGreaterThanOrEqual(events[k - 1].time);
      for (const e of events) {
        const key = e.kind === 'on' || e.kind === 'off' ? `${e.channel}.${e.note}` : '';
        if (e.kind === 'on') open.set(key, (open.get(key) ?? 0) + 1);
        if (e.kind === 'off') open.set(key, (open.get(key) ?? 0) - 1);
      }
      for (const [key, n] of open) expect(n, `${name} ${key}`).toBe(0);
    }
  });

  it('are every note of each tune, and as long as it plays', () => {
    const notes = (name: string): number => readXmiEvents(file(name)).events.filter((e) => e.kind === 'on').length;
    expect(notes('U5THEME.XMI')).toBe(1559);
    expect(notes('BRITLAND.XMI')).toBe(692);
    expect(notes('REUNION.XMI')).toBe(128);
    expect(readXmiEvents(file('STONES.XMI')).length).toBeCloseTo(144.8, 1);
    expect(readXmiEvents(file('REUNION.XMI')).length).toBeCloseTo(11.9, 1);
  });

  it('keep the programs that voice each part, and the controllers that shape it', () => {
    const theme = readXmiEvents(file('U5THEME.XMI'));
    const programs = new Set(theme.events.flatMap((e) => (e.kind === 'program' ? [e.program] : [])));
    expect([...programs].sort((a, b) => a - b)).toEqual([35, 47, 48, 56, 57]);
    expect(theme.events.some((e) => e.kind === 'controller' && e.controller === 7)).toBe(true);
    expect(theme.length).toBeGreaterThan(100);
  });

  it('sets a part’s bank before its program, whatever order the file gives them in', () => {
    // FORM XMID > EVNT: a program change, then bank select (controllers 0 and 32), all at the tune's first moment, then a note.
    const body = [0xc0, 5, 0xb0, 0, 2, 0xb0, 32, 1, 0x90, 60, 100, 10];
    const be32 = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const tag = (t: string): number[] => [...t].map((c) => c.charCodeAt(0));
    const evnt = [...tag('EVNT'), ...be32(body.length), ...body];
    const xmi = new Uint8Array([...tag('FORM'), ...be32(evnt.length + 4), ...tag('XMID'), ...evnt]);
    const order = readXmiEvents(xmi).events.map((e) => (e.kind === 'controller' ? `controller ${e.controller}` : e.kind));
    expect(order).toEqual(['controller 0', 'controller 32', 'program', 'on', 'off']);
  });

  it('refuses what is no XMI', () => {
    expect(() => readXmiEvents(new Uint8Array([1, 2, 3]))).toThrow('not an XMI file');
  });
});
