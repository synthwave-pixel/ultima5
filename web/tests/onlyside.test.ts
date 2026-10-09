import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { onlySide } from '../src/game/targets.ts';
import { enterTown } from '../src/game/town.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** The one way Talk, Open or Jimmy could go from the menu (targets.ts onlySide): given where only one side has it. */
describe('the one way a command could go', () => {
  const town = async () => {
    const { g } = newGame();
    journeyOnward(g);
    Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 30 });
    await enterTown(g, true);
    for (const a of g.s.actors.slice(1)) a.tile = 0;
    Object.assign(g.s, { x: 10, y: 10 });
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) setTileAt(g, 10 + dx, 10 + dy, 0x44); // floor
    return g;
  };
  const person = (g: Awaited<ReturnType<typeof town>>, slot: number, x: number, y: number) =>
    Object.assign(g.s.actors[slot], { tile: 0x50, anim: 0x50, x, y, z: 0 });

  it('is the side of the one person in reach to talk to, and none with two', async () => {
    const g = await town();
    person(g, 1, 10, 9);
    expect(onlySide(g, 'talk')).toBe(K.Up);
    person(g, 2, 11, 10);
    expect(onlySide(g, 'talk')).toBe(0);
  });

  it('reaches two squares off only across a counter, as Talk itself does (a ladder, a wall or floor between: no one)', async () => {
    const { talkOffer } = await import('../src/game/targets.ts');
    const g = await town();
    person(g, 1, 10, 8); // two north, open floor between
    expect(talkOffer(g)).toBe('hide');
    expect(onlySide(g, 'talk')).toBe(0);
    setTileAt(g, 10, 9, 0xc8); // a ladder between
    expect(talkOffer(g)).toBe('hide');
    expect(onlySide(g, 'talk')).toBe(0);
    setTileAt(g, 10, 9, 0x4d); // a wall between
    expect(talkOffer(g)).toBe('hide');
    setTileAt(g, 10, 9, 0xa5); // a counter (the desk) between: talked to across it, as 1988 has it
    expect(talkOffer(g)).toBe('show');
    expect(onlySide(g, 'talk')).toBe(K.Up);
    // Someone on the counter's square itself is the one talked to; a chest there, no one (Talk stops at it).
    person(g, 2, 10, 9);
    expect(onlySide(g, 'talk')).toBe(K.Up);
    Object.assign(g.s.actors[2], { tile: 0x01, anim: 0x01 });
    expect(talkOffer(g)).toBe('hide');
  });

  it('leaves Talk out of the command menu with no one in reach - none two squares off past a ladder', async () => {
    const { commandMenu } = await import('../src/game/menu.ts');
    const { Pad } = await import('../src/game/io.ts');
    const labels = async (g: Awaited<ReturnType<typeof town>>): Promise<string[]> => {
      let shown: string[] = [];
      (g.p as unknown as { next: () => number }).next = () => {
        shown = [...(g.menuShown?.labels ?? [])];
        return Pad.B;
      };
      g.commandPrompt = 'town';
      await commandMenu(g).catch(() => undefined);
      return shown;
    };
    const g = await town();
    person(g, 1, 10, 8);
    setTileAt(g, 10, 9, 0xc8); // a ladder between
    expect(await labels(g)).not.toContain('Talk');
    setTileAt(g, 10, 9, 0xa5); // a counter between
    expect(await labels(g)).toContain('Talk');
  });

  it('is the side of the one door to open, and none with nothing', async () => {
    const g = await town();
    expect(onlySide(g, 'open')).toBe(0);
    setTileAt(g, 9, 10, 0xb8); // a door, west
    expect(onlySide(g, 'open')).toBe(K.Left);
  });
});
