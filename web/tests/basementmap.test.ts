import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { readLocations, readTownLevel } from '../src/data/maps.ts';
import { townPicture } from '../src/ui/interiorMap.ts';
import { newGame } from './helpers.ts';

/** A basement on the map (interiorMap.ts): level -1, kept in the save as 0xff, read as the town reads it. */
describe('the map of a basement', () => {
  it("reads Yew's basement, under its fireplace, as the level below the ground", () => {
    const { g } = newGame();
    const yew = readLocations(g.data.ovl).find((l) => l.name === 'YEW')!;
    expect(yew.levels).toContain(-1);
    const below = readTownLevel(g.data.files, yew, 0xff);
    expect(below.tiles).toHaveLength(1024);
    expect([...below.tiles]).toEqual([...readTownLevel(g.data.files, yew, -1).tiles]);
    expect([...below.tiles]).not.toEqual([...readTownLevel(g.data.files, yew, 0).tiles]);
  });

  it('draws what the party has seen of it, not the dark', () => {
    const { g } = newGame();
    const yew = readLocations(g.data.ovl).find((l) => l.name === 'YEW')!;
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) g.fog.markPlace(yew.id, 0xff, x, y);
    const tiles = lzwDecompress(g.data.files.get('TILES.16'));
    const px = townPicture(g, yew, 0xff, tiles, null);
    const dark = px[0];
    expect(px.filter((v) => v !== dark).length).toBeGreaterThan(1000);
  });
});
