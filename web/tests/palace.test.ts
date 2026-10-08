import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inPalace } from '../src/ui/standardArt.ts';
import { readBritannia } from '../src/data/maps.ts';
import { GameData } from '../src/game/data.ts';
import { gameFiles } from './helpers.ts';

/** The five by five squares round (x, y) on Britannia, as the renderer's Place holds them. */
function placeAt(tiles: Uint8Array, x: number, y: number): { map: number; x: number; y: number; around: Uint8Array } {
  const around = new Uint8Array(25);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) around[(dy + 2) * 5 + dx + 2] = tiles[((y + dy) & 255) * 256 + ((x + dx) & 255)];
  return { map: 0, x, y, around };
}

/** Lord British's castle and Blackthorn's palace share five squares; the palace is drawn from its own. */
describe("Blackthorn's palace", () => {
  const files = gameFiles();
  const data = new GameData(files) as unknown as { ovl: never };
  const brit = readBritannia(files, data.ovl).tiles;

  it('knows each of its squares by its gate, and none of the castle', () => {
    for (let k = 0; k < 6; k++) {
      const [dx, dy] = [k % 3, Math.floor(k / 3)];
      const tile = 0x3a + k;
      if (tile === 0x3e) continue; // the palace's gate square is its own tile (0x39)
      expect(brit[(244 + dy) * 256 + 195 + dx]).toBe(tile);
      expect(inPalace(tile, placeAt(brit, 195 + dx, 244 + dy))).toBe(true);
      expect(inPalace(tile, placeAt(brit, 85 + dx, 106 + dy))).toBe(false);
    }
  });

  it('has its own cells in the sheet, the top row with its flags flying', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as {
      palace: Record<string, number[]>;
    };
    expect(Object.keys(manifest.palace).map(Number).sort()).toEqual([0x3a, 0x3b, 0x3c, 0x3d, 0x3f]);
    for (const t of [0x3a, 0x3b, 0x3c]) expect(manifest.palace[t]).toHaveLength(2);
  });
});
