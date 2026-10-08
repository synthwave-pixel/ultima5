import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../tools/png';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import { CELL, type Manifest, StandardArt } from '../src/ui/standardArt.ts';

/**
 * A river or a coast's corner is drawn over its running water with the bank's mud, and its land left clear: the
 * Standard look lays the ground round the square there, so a river through a swamp runs between banks of swamp.
 */
describe('the land of a bank', () => {
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
  const at = (tile: number, x: number, y: number, ground?: number): number => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    art.draw(page, tile, 0, 0, ground);
    return page[y * HI_WIDTH + x];
  };
  const RIVER_NS = 0x60;

  it('is the ground it is given, away from the mud', () => {
    // The river runs down the middle; at the tile's left edge, halfway down, is land well clear of the bank.
    expect(at(RIVER_NS, 2, 32, 0x04)).toBe(at(0x04, 2, 32));
    expect(at(RIVER_NS, 2, 32, 0x05)).toBe(at(0x05, 2, 32));
    expect(at(RIVER_NS, 2, 32, 0x04)).not.toBe(at(RIVER_NS, 2, 32, 0x05));
  });

  it('is the grass when the drawing names no ground', () => {
    expect(at(RIVER_NS, 2, 32)).toBe(at(0x05, 2, 32));
  });

  it('leaves the water the water, whatever the ground', () => {
    expect(at(RIVER_NS, 32, 32, 0x04)).toBe(at(RIVER_NS, 32, 32, 0x05));
  });

  it('is kept for every river and coast corner', () => {
    for (const t of [0x34, 0x35, 0x36, 0x37, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6c, 0x6d, 0x6e, 0x6f])
      expect(manifest.land?.[t], `tile ${t.toString(16)}`).toBeDefined();
  });
});
