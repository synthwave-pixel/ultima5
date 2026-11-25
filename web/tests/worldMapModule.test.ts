import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Font } from '../src/data/font.ts';
import { WORLD_SIZE as BRIT_SIZE } from '../src/data/maps.ts';
import { MAP_PIXELS, MAP_SCALE, WORLD_SIZE } from '../src/ui/parchment.ts';
import { showWorldMap, type WorldMapSource } from '../src/ui/worldMapView.ts';
import { fakePage, type FakePage } from './fakeMapDom.ts';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every module path `file` imports or re-exports (`import ... from '...'`), resolved - with `import type`s or without. */
const importsOf = (file: string, types: boolean): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/^(?:import|export)\s([^;]*?)from\s+'([^']+)'/gms)]
    .filter((m) => types || !/^type\s/.test(m[1]))
    .map((m) => resolve(dirname(file), m[2]));

/** `file` and every module it brings with it when it runs: its imports, theirs in turn (a type import brings none). */
const reach = (file: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const next of importsOf(file, false)) if (existsSync(next)) reach(next, seen);
  return seen;
};

/**
 * The world map any game can show (worldMapView.ts, worldMarks.ts): reached without Ultima V's game, its record of
 * names, its interiors, or its readers of BRIT.DAT and DATA.OVL - so Ultima IV imports it and nothing more comes along.
 */
describe('the world map module', () => {
  const ultimaV = [
    'data/maps.ts',
    'data/dataOvl.ts',
    'data/files.ts',
    'data/tiles.ts',
    'data/lzw.ts',
    'game/game.ts',
    'game/save.ts',
    'game/placeNames.ts',
    'ui/interiorMap.ts',
    'ui/mapMarks.ts',
    'ui/mapView.ts',
    'ui/standardArt.ts',
  ].map((f) => resolve(src, f));

  const short = (files: Iterable<string>): string[] => [...files].map((f) => f.slice(src.length + 1));

  for (const name of ['ui/worldMapView.ts', 'ui/worldMarks.ts', 'ui/parchment.ts']) {
    it(`${name} names nothing of Ultima V's, and brings none of it when it runs`, () => {
      const file = resolve(src, name);
      expect(short(importsOf(file, true).filter((f) => ultimaV.includes(f)))).toEqual([]);
      expect(short([...reach(file)].filter((f) => ultimaV.includes(f)))).toEqual([]);
    });
  }

  it('brings only the font, the EGA colours, the key codes, the paper and the marks', () => {
    expect(short(reach(resolve(src, 'ui/worldMapView.ts'))).sort()).toEqual(
      ['data/ega.ts', 'data/font.ts', 'game/io.ts', 'ui/parchment.ts', 'ui/worldMapView.ts', 'ui/worldMarks.ts'].sort(),
    );
  });

  it("draws a world 256 squares a side, as Ultima V's readers do", () => {
    expect(WORLD_SIZE).toBe(256);
    expect(BRIT_SIZE).toBe(WORLD_SIZE);
  });
});

describe('a square whose byte has no tile', () => {
  let page: FakePage | null = null;
  afterEach(() => {
    page?.restore();
    page = null;
  });

  const font: Font = { rows: new Uint8Array(1024) };

  /** The world's picture when (50, 60), seen or not as `seen` says, holds byte `byte`, of a sheet of 4 tiles. */
  const picture = async (byte: number, seen: boolean): Promise<Uint8ClampedArray> => {
    page = fakePage();
    const tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    tiles[60 * WORLD_SIZE + 50] = byte;
    const sight = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    if (seen) sight[60 * WORLD_SIZE + 50] = 1;
    const source: WorldMapSource = {
      worlds: [{ tiles, paper: null, seen: sight, marks: [], party: null, offered: true }],
      opensOn: 0,
      from: { x: 0, y: 0 },
      partyName: 'Kestrel',
      knows: () => false,
      font,
      tiles: new Uint8Array(4 * 128).fill(0xee),
      tileCount: 4,
      art: null,
      onClose: () => {},
    };
    let failed: unknown = null;
    showWorldMap(source).catch((e: unknown) => (failed = e));
    await Promise.resolve();
    const inner = page.made.find((e) => e.tag === 'canvas' && e.put?.width === MAP_PIXELS);
    page.restore();
    page = null;
    expect(failed).toBeNull();
    expect(inner).toBeDefined();
    return inner!.put!.data;
  };

  /** The four pixels of (50, 60) on the picture, RGBA. */
  const square = (data: Uint8ClampedArray): number[] =>
    [0, 1, MAP_PIXELS, MAP_PIXELS + 1].flatMap((d) => {
      const o = (60 * MAP_SCALE * MAP_PIXELS + 50 * MAP_SCALE + d) * 4;
      return [...data.slice(o, o + 4)];
    });

  it('is drawn as unseen, not thrown on', async () => {
    expect(await picture(200, true)).toEqual(await picture(200, false));
  });

  it('while one with a tile is painted', async () => {
    expect(square(await picture(3, true))).not.toEqual(square(await picture(3, false)));
  });
});
