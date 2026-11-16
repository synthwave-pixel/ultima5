import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { appearanceLines, gameplayLines, wrap } from '../src/game/menu.ts';
import { K, Pad } from '../src/game/io.ts';
import { loadOptions, PC_TILES, SETTINGS_KEY, TILES } from '../src/game/settings.ts';
import { egaTileArt } from '../src/ui/egaTiles.ts';
import { EgaArt, HI_WIDTH } from '../src/ui/framebuffer.ts';
import { CELL } from '../src/ui/standardArt.ts';
import { gameFiles, newGame } from './helpers.ts';

/**
 * The PC EGA tiles (egaTiles.ts): the 1988 PC game's tiles in the Enhanced interface's screen; and the interface
 * (Gameplay's, Enhanced or Retro) and the one Tiles setting (Appearance's), Remastered under Enhanced alone.
 */
describe('the PC EGA tiles', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const art = egaTileArt(tiles, null);
  const egaArt = new EgaArt(tiles);
  const drawn = (a: { draw: (page: Uint32Array, t: number, x: number, y: number) => void }, t: number): Uint32Array => {
    const page = new Uint32Array(HI_WIDTH * CELL).fill(0xff000000);
    a.draw(page, t, 0, 0);
    return Uint32Array.from({ length: CELL * CELL }, (_, i) => page[Math.floor(i / CELL) * HI_WIDTH + (i % CELL)]);
  };

  it('draw every tile on the map exactly as the 1988 PC game did', () => {
    const off: number[] = [];
    for (let t = 0; t < 512; t++) {
      const [mine, theirs] = [drawn(art, t), drawn(egaArt, t)];
      if (mine.some((v, k) => v !== theirs[k])) off.push(t);
    }
    expect(off).toEqual([]);
  });

  it('leave a person’s black ground clear, so they can stand in a scene, but keep a tree’s grass', () => {
    const avatar = art.figure(0x14c);
    expect(avatar.some((v) => v >>> 24 === 0)).toBe(true);
    expect(avatar.some((v) => v >>> 24 === 255)).toBe(true);
    expect(art.figure(0x0a).every((v) => v >>> 24 === 255)).toBe(true); // a tree, whole
  });
});

describe('the interface and the tiles', () => {
  const lines = (tileSet: 'standard' | 'original', tiles: (typeof TILES)[number]) => {
    const { g, p } = newGame();
    Object.assign(g.options, { tileSet, tiles });
    return {
      g,
      p,
      iface: () => gameplayLines(g).find((l) => l.label.startsWith('Interface:'))!,
      set: () => appearanceLines(g).find((l) => l.label.startsWith('Look:'))!,
    };
  };

  it('call the interface Enhanced or Retro, in Gameplay, and Appearance no longer; and Outlines no setting', () => {
    expect(lines('standard', 'modern-pc').iface().label).toBe('Interface: Enhanced');
    expect(lines('original', 'pc-ega').iface().label).toBe('Interface: Retro');
    const { g } = lines('standard', 'modern-pc');
    expect(appearanceLines(g).some((l) => /^(UX|Interface|Tiles|Outlines):/.test(l.label))).toBe(false);
    expect('outlines' in g.options).toBe(false);
    expect(wrap(lines('standard', 'modern-pc').iface().note!).length).toBeLessThanOrEqual(3);
  });

  it('offer eight sets under Enhanced, in turn and round again, each saying what it is', async () => {
    expect(TILES).toEqual(['modern-pc', 'pc-ega', 'pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64']);
    const { g, set } = lines('standard', 'modern-pc');
    const seen: string[] = [];
    for (let i = 0; i < TILES.length; i++) {
      const line = set();
      seen.push(line.label);
      expect(line.dim).toBeFalsy();
      expect(wrap(line.note!).length, line.note).toBeLessThanOrEqual(3);
      await line.act?.();
    }
    expect(seen).toEqual([
      'Look: Remastered',
      'Look: PC EGA',
      'Look: PC CGA',
      'Look: Apple Color',
      'Look: Apple //e',
      'Look: Apple //c',
      'Look: Sharp X68k',
      'Look: C64',
    ]);
    expect(g.options.tiles).toBe('modern-pc');
  });

  it('offer every set but Remastered under Retro, the one choice of tiles', async () => {
    expect(PC_TILES).toEqual(['pc-ega', 'pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64']);
    const { g, set } = lines('original', 'c64');
    await set().act?.();
    expect(g.options.tiles).toBe('pc-ega'); // round again, past Remastered
    for (let i = 1; i < PC_TILES.length; i++) await set().act?.();
    expect(g.options.tiles).toBe('c64');
  });

  it('ask before Retro takes Remastered away, and change both only on yes', async () => {
    for (const yes of [true, false]) {
      const { g, p, iface } = lines('standard', 'modern-pc');
      const asked: string[] = [];
      p.next = () => {
        const m = g.menuShown;
        if (m?.title === 'Are you sure?') {
          asked.push(m.labels.join(' '));
          return m.labels[m.at] === (yes ? 'Yes' : 'No') ? Pad.A : K.Down;
        }
        return Pad.A;
      };
      await iface().act?.();
      expect(asked.join(' ')).toMatch(/PC EGA/);
      expect([g.options.tileSet, g.options.tiles]).toEqual(yes ? ['original', 'pc-ega'] : ['standard', 'modern-pc']);
    }
  });

  it('switch the interface without asking where the tiles stay, and keep them coming back to Enhanced', async () => {
    const { g, p, iface } = lines('standard', 'c64');
    p.next = () => {
      throw new Error('asked');
    };
    await iface().act?.();
    expect([g.options.tileSet, g.options.tiles]).toEqual(['original', 'c64']);
    await iface().act?.();
    expect([g.options.tileSet, g.options.tiles]).toEqual(['standard', 'c64']);
  });

  it("take a saved Retro player's PC set as their one choice, and never Remastered under Retro", () => {
    const store = new Map<string, string>();
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null }, configurable: true });
    const load = (saved: object) => {
      store.set(SETTINGS_KEY, JSON.stringify(saved));
      const o = loadOptions();
      return [o.tileSet, o.tiles, 'pcTiles' in o];
    };
    try {
      expect(load({ tiles: 'pc-ega' })).toEqual(['standard', 'pc-ega', false]);
      expect(load({ tileSet: 'original', tiles: 'modern-pc', pcTiles: 'apple2' })).toEqual(['original', 'apple2', false]);
      expect(load({ tileSet: 'original' })).toEqual(['original', 'pc-ega', false]);
      expect(load({ tileSet: 'original', tiles: 'modern-pc' })).toEqual(['original', 'pc-ega', false]);
      expect(load({ tileSet: 'original', tiles: 'c64' })).toEqual(['original', 'c64', false]);
      expect(load({ tileSet: 'standard', tiles: 'c64', pcTiles: 'apple2' })).toEqual(['standard', 'c64', false]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: was, configurable: true });
    }
  });
});
