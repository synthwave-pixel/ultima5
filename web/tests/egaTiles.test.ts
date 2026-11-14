import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { appearanceLines, wrap } from '../src/game/menu.ts';
import { loadOptions, PC_TILES, SETTINGS_KEY, TILES } from '../src/game/settings.ts';
import { egaTileArt } from '../src/ui/egaTiles.ts';
import { EgaArt, HI_WIDTH } from '../src/ui/framebuffer.ts';
import { CELL } from '../src/ui/standardArt.ts';
import { gameFiles, newGame } from './helpers.ts';

/**
 * The PC EGA tiles (egaTiles.ts): the 1988 PC game's tiles in the Modern look's screen, and the looks' names in
 * Appearance - UX Modern or PC (1988), Tiles three sets under Modern and PC EGA or Apple ][ under PC (1988).
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

describe('the looks in Appearance', () => {
  const lines = (tileSet: 'standard' | 'original', tiles: (typeof TILES)[number]) => {
    const { g } = newGame();
    Object.assign(g.options, { tileSet, tiles });
    const all = appearanceLines(g);
    return { g, ux: all.find((l) => l.label.startsWith('UX:'))!, set: all.find((l) => l.label.startsWith('Tiles:'))! };
  };

  it('are Modern and PC (1988)', () => {
    expect(lines('standard', 'modern-pc').ux.label).toBe('UX: Modern');
    expect(lines('original', 'modern-pc').ux.label).toBe('UX: PC (1988)');
  });

  it('offer eight sets under Modern, in turn and round again, each saying what it is', async () => {
    expect(TILES).toEqual(['modern-pc', 'pc-ega', 'pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64']);
    const { g, set } = lines('standard', 'modern-pc');
    const seen: string[] = [];
    let line = set;
    for (let i = 0; i < TILES.length; i++) {
      seen.push(line.label);
      expect(line.dim).toBeFalsy();
      expect(wrap(line.note!).length, line.note).toBeLessThanOrEqual(3);
      await line.act?.();
      line = appearanceLines(g).find((l) => l.label.startsWith('Tiles:'))!;
    }
    expect(seen).toEqual([
      'Tiles: Modern PC',
      'Tiles: PC EGA',
      'Tiles: PC CGA',
      'Tiles: Apple Color',
      'Tiles: Apple //e',
      'Tiles: Apple //c',
      'Tiles: Sharp X68k',
      'Tiles: C64',
    ]);
    expect(g.options.tiles).toBe('modern-pc');
  });

  it('offer every set but Modern PC under PC (1988), a choice of its own, the Modern choice kept', async () => {
    expect(PC_TILES).toEqual(['pc-ega', 'pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64']);
    const { g, set } = lines('original', 'modern-pc');
    expect(g.options.pcTiles).toBe('pc-ega');
    expect(set.label).toBe('Tiles: PC EGA');
    expect(set.dim).toBeFalsy();
    await set.act?.();
    expect([g.options.pcTiles, g.options.tiles]).toEqual(['pc-cga', 'modern-pc']);
    expect(appearanceLines(g).find((l) => l.label.startsWith('Tiles:'))!.label).toBe('Tiles: PC CGA');
    for (let i = 1; i < PC_TILES.length; i++)
      await appearanceLines(g)
        .find((l) => l.label.startsWith('Tiles:'))!
        .act?.();
    expect(g.options.pcTiles).toBe('pc-ega');
  });

  it('keep a saved PC EGA choice, and a saved PC (1988) choice it has', () => {
    const store = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ tiles: 'pc-ega' })]]);
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null }, configurable: true });
    try {
      expect(loadOptions().tiles).toBe('pc-ega');
      store.set(SETTINGS_KEY, JSON.stringify({ pcTiles: 'apple2' }));
      expect(loadOptions().pcTiles).toBe('apple2');
      store.set(SETTINGS_KEY, JSON.stringify({ pcTiles: 'modern-pc' }));
      expect(loadOptions().pcTiles).toBe('pc-ega');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: was, configurable: true });
    }
  });
});
