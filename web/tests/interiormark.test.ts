import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { readLocations } from '../src/data/maps.ts';
import { journeyOnward } from '../src/game/run.ts';
import { dungeonPicture, INTERIOR_PIXELS, townPicture } from '../src/ui/interiorMap.ts';
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
    const here = dungeonPicture(g, 0x21, 0);
    g.s.level = 1; // the party elsewhere: the same level's map without it
    expect(differs(here, dungeonPicture(g, 0x21, 0))).toBeGreaterThan(0);
  });
});
