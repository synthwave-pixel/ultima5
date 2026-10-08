import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { u32 } from '../src/data/files.ts';
import { gameFiles } from './helpers.ts';

describe('lzwDecompress', () => {
  it('expands TILES.16 to 512 tiles of 128 bytes', () => {
    expect(lzwDecompress(gameFiles().get('TILES.16')).length).toBe(512 * 128);
  });

  it('expands every compressed picture to its stated length', () => {
    const files = gameFiles();
    for (const name of files.names().filter((n) => /\.(16|4)$/.test(n) || n.endsWith('.BIT'))) {
      if (name === 'WD.BIT') continue; // not compressed
      const data = files.get(name);
      expect(lzwDecompress(data).length, name).toBe(u32(data, 0));
    }
  });
});
