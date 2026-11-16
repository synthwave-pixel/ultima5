import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { readLocations } from '../src/data/maps.ts';
import { journeyOnward } from '../src/game/run.ts';
import { dungeonPicture, INTERIOR_PIXELS, townPicture } from '../src/ui/interiorMap.ts';
import { kindOf, levelCells } from '../src/game/dungeonMap.ts';
import { T } from '../src/game/tiles.ts';
import type { StandardArt } from '../src/ui/standardArt.ts';
import { newGame } from './helpers.ts';

/** Where the party stands on the map of the place it is in (interiorMap.ts): blinking on a town's, steady on a dungeon's. */
describe("the party's mark on a town's map and a dungeon's", () => {
  const differs = (a: Uint32Array, b: Uint32Array): number => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

  it("comes and goes on the town's map, and nothing else does", () => {
    const { g } = newGame();
    journeyOnward(g);
    const britain = readLocations(g.data.ovl).find((l) => l.name === 'BRITAIN')!;
    Object.assign(g.s, { mapId: britain.id, level: 0, x: 15, y: 20 });
    for (let y = 15; y < 25; y++) for (let x = 10; x < 20; x++) g.fog.markPlace(britain.id, 0, x, y);
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    const lit = townPicture(g, britain, 0, tiles, null, true);
    const dark = townPicture(g, britain, 0, tiles, null, false);
    expect(differs(lit, dark)).toBeGreaterThan(0);
    expect(differs(lit, dark)).toBeLessThan(100); // the mark alone
    expect(lit.length).toBe(INTERIOR_PIXELS * INTERIOR_PIXELS);
  });

  it("stays on the dungeon's map, steady", () => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray(0, 0x200));
    Object.assign(g.s, { mapId: 0x21, level: 0, x: 1, y: 1 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fog.markPlace(0x21, 0, x, y);
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    const here = dungeonPicture(g, 0x21, 0, tiles, null);
    g.s.level = 1; // the party elsewhere: the same level's map without it
    expect(differs(here, dungeonPicture(g, 0x21, 0, tiles, null))).toBeGreaterThan(0);
  });
});

/**
 * A dungeon's level on the maps' page (interiorMap.ts dungeonPicture): as the Enhanced map draws it (dungeonMap.ts) -
 * in the look's own tiles, the passages unrolled from the party, a looping level going on round it.
 */
describe("a dungeon's level on the maps' page", () => {
  /** Dungeon `d` (1-8), level `level`, its every cell seen, the party on its first passage. */
  const inLevel = (d: number, level: number) => {
    const { g } = newGame();
    journeyOnward(g);
    g.s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray((d - 1) * 0x200, d * 0x200));
    const at = Array.from({ length: 64 }, (_, k) => k).find((k) => (g.s.dungeon[level * 0x40 + k] & 0xf0) === 0)!;
    Object.assign(g.s, { mapId: 0x20 + d, level, x: at & 7, y: at >> 3 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fog.markPlace(0x20 + d, level, x, y);
    return g;
  };
  const cells = (g: ReturnType<typeof inLevel>) => levelCells(g, g.fog.placeSeen(g.s.mapId, g.s.level)!, 7);

  it('lays a level out from the party, each cell once where it lies; a level that loops, round and round', () => {
    // A passage once, where it lies from the party (the rock beside one, beside each it lies beside).
    const g = inLevel(1, 0); // Deceit's first
    const plain = cells(g).filter((c) => kindOf(g.s.dungeon[c.x + c.y * 8]) !== 'rock');
    const once = new Map<string, number>();
    for (const c of plain) once.set(`${c.x},${c.y}`, (once.get(`${c.x},${c.y}`) ?? 0) + 1);
    expect(plain.length).toBeGreaterThan(4);
    expect(Math.max(...once.values())).toBe(1);
    expect(plain).toContainEqual(expect.objectContaining({ i: 0, j: 0 }));
    const looping = cells(inLevel(8, 4)); // Doom's fifth, which loops
    const round = new Map<string, number>();
    for (const c of looping) round.set(`${c.x},${c.y}`, (round.get(`${c.x},${c.y}`) ?? 0) + 1);
    expect(Math.max(...round.values())).toBeGreaterThan(1);
  });

  it("draws the level in the look's own tiles, the rock lit in the dungeon's colour for Remastered alone", () => {
    const g = inLevel(1, 0);
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    // Each tile a colour of its own, whole.
    const colour = (t: number): number => (0xff000000 | ((t * 2654435761) & 0xffffff)) >>> 0;
    const art = { figure: (t: number) => new Uint32Array(32 * 32).fill(colour(t)) } as unknown as StandardArt;
    const has = (px: Uint32Array, v: number): boolean => px.includes(v);
    g.options.tiles = 'c64';
    const own = dungeonPicture(g, g.s.mapId, 0, tiles, art);
    expect(has(own, colour(T.Wall))).toBe(true);
    expect(has(own, colour(T.T44))).toBe(true); // the passage's cobbles
    g.options.tiles = 'modern-pc';
    const lit = dungeonPicture(g, g.s.mapId, 0, tiles, art);
    expect(has(lit, colour(T.Wall))).toBe(false); // in Deceit's light
    expect(has(lit, colour(T.T44))).toBe(true);
  });
});
