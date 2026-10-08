import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../tools/png';
import { lzwDecompress } from '../src/data/lzw.ts';
import { DEFAULTS, loadOptions, SETTINGS_KEY } from '../src/game/settings.ts';
import { apple, appleArt, fromSheet } from '../src/ui/appleArt.ts';
import { HI_WIDTH, type TileArt, TilesAlone } from '../src/ui/framebuffer.ts';
import { CELL, type Manifest, OUTLINE_COLOUR, OUTLINE_WIDTH, StandardArt } from '../src/ui/standardArt.ts';
import { gameFiles } from './helpers.ts';

/** The Standard look's tile sets (settings.ts Tiles): Modern PC, Apple ][, PC EGA. */
describe('the tile sets', () => {
  it('start on Modern PC, and a set this build has not (Modern U3, gone) is Modern PC again', () => {
    expect(DEFAULTS.tiles).toBe('modern-pc');
    const store = new Map<string, string>([[SETTINGS_KEY, JSON.stringify({ tiles: 'nintendo' })]]);
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null }, configurable: true });
    try {
      expect(loadOptions().tiles).toBe('modern-pc');
      store.set(SETTINGS_KEY, JSON.stringify({ tiles: 'modern-u3' }));
      expect(loadOptions().tiles).toBe('modern-pc');
      store.set(SETTINGS_KEY, JSON.stringify({ tiles: 'apple2' }));
      expect(loadOptions().tiles).toBe('apple2');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { value: was, configurable: true });
    }
  });
});

describe('the Apple ][ tiles', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = decodePng(readFileSync(new URL('../public/graphics/apple2-u5-tiles.png', import.meta.url)));
  const sheet = new Uint32Array(png.data.buffer.slice(0));
  // The Apple II's six colours (RGBA in memory order: 0xAABBGGRR).
  const SIX = new Set([0xff000000, 0xffffffff, 0xfffdcf15, 0xff3c6aff, 0xff3cf514, 0xfffd44ff]);

  it('are Ultima V’s own Apple II tiles, not the player’s EGA ones in the Apple’s colours', () => {
    const art = appleArt(tiles, sheet, png.width, null);
    for (const t of [0x05, 0x150, 0x170]) expect(art.figure(t), t.toString(16)).toEqual(fromSheet(sheet, png.width, t));
    expect(art.figure(0x150)).not.toEqual(apple(tiles, 0x150));
  });

  it('are the player’s own tiles in the Apple’s colours, every one, without the sheet', () => {
    const art = appleArt(tiles, null, 0, null);
    const page = new Uint32Array(HI_WIDTH * CELL);
    const off: number[] = [];
    for (let t = 0; t < 512; t++) {
      art.draw(page, t, 0, 0);
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (!SIX.has(page[y * HI_WIDTH + x])) off.push(t);
    }
    expect([...new Set(off)]).toEqual([]);
    expect(art.figure(0x150)).toEqual(apple(tiles, 0x150));
  });

  it('draw in the PC (1988) look as their own tiles, the lettering the game’s', () => {
    const lettered = appleArt(tiles, sheet, png.width, new StandardArt(new Uint32Array(CELL * CELL), CELL, {}));
    const alone: TileArt = new TilesAlone(lettered);
    const [a, b] = [new Uint32Array(HI_WIDTH * CELL), new Uint32Array(HI_WIDTH * CELL)];
    for (const t of [0x02, 0x05, 0x0c, 0x150]) {
      lettered.draw(a, t, 0, 0);
      alone.draw(b, t, 0, 0);
      expect(b, t.toString(16)).toEqual(a);
    }
    expect('glyph' in alone || 'reading' in alone || 'fineRunes' in alone || 'capPiece' in alone).toBe(false);
  });
});

describe('the outlines round Modern PC’s people and creatures', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
  art.useOriginals(tiles);

  it('draw Modern PC’s roads and ground edges tile by tile, not painted from the map', () => {
    expect(art.paintedEarth).toBe(false);
  });

  it('go round a figure where the ground shows, and never over the figure', () => {
    art.outlined = false;
    const plain = art.figure(0x144);
    art.outlined = true;
    const lined = art.figure(0x144);
    let added = 0;
    for (let i = 0; i < plain.length; i++) {
      if (plain[i] >>> 24 !== 0) expect(lined[i]).toBe(plain[i]);
      else if (lined[i] === OUTLINE_COLOUR) {
        added++;
        // Within OUTLINE_WIDTH of the figure, the diagonals too.
        const [x, y] = [i % CELL, Math.floor(i / CELL)];
        let near = false;
        for (let dy = -OUTLINE_WIDTH; dy <= OUTLINE_WIDTH; dy++)
          for (let dx = -OUTLINE_WIDTH; dx <= OUTLINE_WIDTH; dx++) {
            const [nx, ny] = [x + dx, y + dy];
            if (nx >= 0 && ny >= 0 && nx < CELL && ny < CELL && plain[ny * CELL + nx] >>> 24 !== 0) near = true;
          }
        expect(near).toBe(true);
      }
    }
    expect(added).toBeGreaterThan(50);
  });

  it('are the actors’ alone, and off when turned off', () => {
    art.outlined = true;
    const page = new Uint32Array(HI_WIDTH * CELL);
    const black = (t: number, ground?: number): number => {
      art.draw(page, t, 0, 0, ground);
      let n = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (page[y * HI_WIDTH + x] === OUTLINE_COLOUR) n++;
      return n;
    };
    const chair = black(0x90, 0x44); // a chair on the floor: no outline
    art.outlined = false;
    expect(black(0x90, 0x44)).toBe(chair);
    const plain = black(0x144, 0x05);
    art.outlined = true;
    expect(black(0x144, 0x05)).toBeGreaterThan(plain + 50);
  });
});

describe('the grass below the world', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
  art.useOriginals(tiles);

  it('is Modern PC’s grass with its colour taken away, and above the world its own green', () => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    const colours = (map: number): Set<number> => {
      art.draw(page, 0x05, 0, 0, undefined, { map, x: 40, y: 40, around: new Uint8Array(25).fill(0x05) });
      const out = new Set<number>();
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out.add(page[y * HI_WIDTH + x] & 0xffffff);
      return out;
    };
    const grey = (v: number): boolean => (v & 0xff) === ((v >> 8) & 0xff) && (v & 0xff) === ((v >> 16) & 0xff);
    expect([...colours(1)].every(grey)).toBe(true);
    expect([...colours(0)].some((v) => !grey(v))).toBe(true);
  });
});

describe('the pier', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
  art.useOriginals(tiles);
  const PIER = 0x47;

  /** The pier drawn at (78, 108) - Lord British's, its landward end - with these neighbours north, east, south, west. */
  const pier = (n: number, e: number, s: number, w: number): Uint32Array => {
    const around = new Uint8Array(25).fill(0x05);
    [around[7], around[13], around[17], around[11]] = [n, e, s, w];
    around[12] = PIER;
    const page = new Uint32Array(HI_WIDTH * CELL);
    art.draw(page, PIER, 0, 0, undefined, { map: 0, x: 78, y: 108, around });
    return Uint32Array.from({ length: CELL * CELL }, (_, i) => page[Math.floor(i / CELL) * HI_WIDTH + (i % CELL)]);
  };
  /** A water tile's own colours, drawn alone. */
  const colours = (t: number): Set<number> => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    art.draw(page, t, 0, 0);
    const out = new Set<number>();
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out.add(page[y * HI_WIDTH + x]);
    return out;
  };

  /** Water `t` drawn as the map draws it at the pier's square, the piers round it water too (shore.ts). */
  const waterThere = (t: number, n: number, e: number, s: number, w: number): Set<number> => {
    const around = new Uint8Array(25).fill(0x05);
    [around[7], around[13], around[17], around[11]] = [n, e, s, w].map((v) => (v === PIER ? t : v));
    around[12] = t;
    const page = new Uint32Array(HI_WIDTH * CELL);
    art.draw(page, t, 0, 0, undefined, { map: 0, x: 78, y: 108, around });
    const out = new Set<number>();
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out.add(page[y * HI_WIDTH + x]);
    return out;
  };

  it('stands in the water round it as the map draws that water: the shallows by the shore, the open water further out', () => {
    const inShallows = new Set(pier(0x03, PIER, 0x03, 0x05));
    const inWater = new Set(pier(0x02, 0x02, 0x02, PIER));
    const shallows = waterThere(0x03, 0x03, PIER, 0x03, 0x05);
    const water = waterThere(0x02, 0x02, 0x02, 0x02, PIER);
    // Every colour of the map's water there shows under the pier somewhere, and none of the other water's.
    const share = (a: Set<number>, b: Set<number>): number => [...a].filter((v) => b.has(v)).length;
    expect(share(inShallows, shallows)).toBeGreaterThan(share(inShallows, water));
    expect(share(inWater, water)).toBeGreaterThan(share(inWater, shallows));
    // Not the water tile's own bright lines, which the map never shows: only its colours drawn alone and nowhere placed.
    const alone = colours(0x02);
    const bright = [...alone].filter((v) => !water.has(v) && !shallows.has(v));
    expect(bright.length).toBeGreaterThan(0);
    expect(bright.some((v) => inWater.has(v) || inShallows.has(v))).toBe(false);
  });

  it('takes the shallower water on a tie', () => {
    const tie = new Set(pier(0x03, PIER, 0x02, 0x05));
    const share = (b: Set<number>): number => [...tie].filter((v) => b.has(v)).length;
    expect(share(waterThere(0x03, 0x03, PIER, 0x02, 0x05))).toBeGreaterThan(share(waterThere(0x02, 0x03, PIER, 0x02, 0x05)));
  });
});
