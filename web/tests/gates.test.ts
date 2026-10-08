import { describe, expect, it } from 'vitest';
import { Fog } from '../src/game/fog.ts';
import { marksFor } from '../src/ui/mapMarks.ts';
import { readBritannia } from '../src/data/maps.ts';
import { newGame } from './helpers.ts';

/** Every gate the party rides writes itself onto the map: the ring fills, and it is named by where it led. */
describe('moongates learned', () => {
  it('keeps where a gate led, and forgets nothing on a merge', () => {
    const fog = new Fog();
    expect(fog.gateLeadsTo(96, 102)).toBeNull();
    fog.learnGate(96, 102, 224, 133);
    expect(fog.gateLeadsTo(96, 102)).toEqual([224, 133]);
    const other = new Fog();
    other.learnGate(38, 224, 50, 37);
    fog.merge(other);
    expect(fog.gateLeadsTo(38, 224)).toEqual([50, 37]);
    expect(fog.gateLeadsTo(96, 102)).toEqual([224, 133]);
  });

  it('travels in the save and starts blank for a new game', () => {
    const fog = new Fog();
    fog.learnGate(96, 102, 224, 133);
    const back = Fog.decode(fog.encode());
    expect(back.gateLeadsTo(96, 102)).toEqual([224, 133]);
    back.clear();
    expect(back.gateLeadsTo(96, 102)).toBeNull();
  });

  it('marks a ridden gate as known, and names it by where it goes', () => {
    const { g } = newGame();
    const brit = readBritannia(g.data.files, g.data.ovl).tiles;
    const plain = marksFor(g.data.ovl, g.s, brit, false, g.fog);
    const gate = plain.find((m) => m.kind === 'moongate');
    expect(gate).toBeDefined();
    expect(plain.some((m) => m.kind === 'gate-known')).toBe(false);

    // Ride it to Britain's gate, wherever the save says that stone lies.
    const town = plain.find((m) => m.name === 'Britain')!;
    g.fog.learnGate(g.s.moonstoneX[0], g.s.moonstoneY[0], town.x, town.y);
    const learnt = marksFor(g.data.ovl, g.s, brit, false, g.fog);
    const known = learnt.find((m) => m.kind === 'gate-known');
    expect(known).toBeDefined();
    expect(known!.name).toMatch(/to Britain/);
  });

  it('puts on the paper what the cloth map draws: towns and keeps, but no hut or dungeon', () => {
    const { g } = newGame();
    const brit = readBritannia(g.data.files, g.data.ovl).tiles;
    const marks = marksFor(g.data.ovl, g.s, brit, false, g.fog);
    const paper = (name: string): boolean | undefined => marks.find((m) => m.name === name)?.onPaper;
    expect(paper('Britain')).toBe(true);
    expect(paper('Fogsbane')).toBe(true); // a lighthouse
    expect(paper('Bordermarch')).toBe(true); // a keep
    expect(paper("Iolo's Hut")).toBe(false);
    expect(paper('Despise')).toBe(false);
    expect(marks.filter((m) => m.kind === 'shrine').every((m) => m.onPaper)).toBe(true);
  });
});
