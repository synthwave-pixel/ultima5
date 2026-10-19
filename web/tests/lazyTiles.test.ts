import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import type { Place } from '../src/game/io.ts';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import { CELL, type Manifest, StandardArt } from '../src/ui/standardArt.ts';
import { decodePng } from '../tools/png.ts';
import { gameFiles } from './helpers.ts';

/**
 * The tiles the animator turns are drawn again when next drawn, not at every tick (standardArt.ts tick, fresh): what
 * is drawn is what drawing every one of them again at once would draw - the water, its shores (drawn from the three
 * waters whatever the square), a river, a fire, a figure's frames.
 */
describe('the animated tiles, drawn when wanted', () => {
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const live = lzwDecompress(gameFiles().get('TILES.16')).slice();
  const make = (): StandardArt => {
    const a = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
    a.useOriginals(live);
    return a;
  };
  const lazy = make();
  const eager = make();
  const place = (around: number[]): Place => ({ map: 0, x: 40, y: 40, around: Uint8Array.from(around) });
  const coast = place([5, 5, 5, 0x36, 2, 5, 5, 0x36, 2, 2, 5, 0x36, 2, 2, 1, 0x36, 2, 2, 1, 1, 2, 2, 1, 3, 3]);
  // Water whose shore takes from the shallows, none of them round it (found walking the coast south of Britain).
  const sea = place([0x36, 3, 0x37, 0x14, 0x21, 3, 2, 3, 3, 0x37, 0x47, 0x47, 2, 2, 3, 3, 2, 2, 2, 2, 0x35, 3, 2, 2, 2]);
  const river = place([5, 5, 0x60, 5, 5, 5, 5, 0x60, 5, 5, 5, 5, 0x60, 5, 5, 5, 5, 0x60, 5, 5, 5, 5, 0x60, 5, 5]);
  const floor = place(Array<number>(25).fill(0x44));
  const square = (a: StandardArt, tile: number, ground: number | undefined, p: Place): Uint32Array => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    a.draw(page, tile, 0, 0, ground, p);
    return page;
  };
  /** The animator's turn: each tile's rows rolled one down (the water's way), and a fire's flicker. */
  const animate = (): void => {
    for (const t of [1, 2, 3, 0x60, 0x61, 0xb0, 0xb1, 0x1e8, 0x1e9]) {
      const b = live.subarray(t * 128, t * 128 + 128);
      const last = b.slice(120, 128);
      b.copyWithin(8, 0, 120);
      b.set(last, 0);
    }
  };

  it('draws as all drawn again at once would, tick after tick', () => {
    const before = square(lazy, 2, 5, coast).slice();
    for (let n = 0; n < 6; n++) {
      animate();
      lazy.tick();
      eager.tick();
      eager.redraw(); // every tile drawn from the animator's again, now
      for (const [tile, ground, p] of [
        [2, 5, sea], // first: nothing drawn yet this tick has freshened the shallows
        [2, 5, coast],
        [0x36, 5, coast],
        [5, 5, coast],
        [0x60, 5, river],
        [0xb0, 0x44, floor],
      ] as const)
        expect(square(lazy, tile, ground, p), `tile ${tile.toString(16)} after ${n + 1}`).toEqual(square(eager, tile, ground, p));
      for (const t of [0x1e8, 0x1e9, 0xb1]) expect(lazy.figure(t)).toEqual(eager.figure(t));
    }
    // And the water drawn is the turned water, not what it was before the ticks.
    expect(square(lazy, 2, 5, coast)).not.toEqual(before);
  });
});
