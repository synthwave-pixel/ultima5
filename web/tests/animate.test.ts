import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { TileAnimator } from '../src/ui/animate.ts';
import { gameFiles } from './helpers.ts';

describe('TileAnimator', () => {
  it('scrolls the water tiles down a row a tick', () => {
    const tiles = lzwDecompress(gameFiles().get('TILES.16'));
    const before = tiles.slice(0x80, 0x100);
    new TileAnimator(tiles).tick();
    expect([...tiles.slice(0x88, 0x100)]).toEqual([...before.slice(0, 0x78)]);
    expect([...tiles.slice(0x80, 0x88)]).toEqual([...before.slice(0x78, 0x80)]);
  });
});
