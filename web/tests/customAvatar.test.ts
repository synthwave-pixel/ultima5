import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import type { Place } from '../src/game/io.ts';
import { CELL, type Manifest, StandardArt } from '../src/ui/standardArt.ts';
import { decodePng } from '../tools/png.ts';
import { gameFiles } from './helpers.ts';

describe('the custom Avatar in the Modern PC tiles', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = decodePng(readFileSync(new URL('../public/graphics/standard-tiles.png', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../public/graphics/standard-tiles.json', import.meta.url), 'utf8')) as Manifest;
  const art = (): StandardArt => {
    const a = new StandardArt(new Uint32Array(png.data.buffer.slice(0)), png.width, manifest);
    a.useOriginals(tiles);
    return a;
  };
  const drawn = (a: StandardArt, t: number, place?: Place): number[] => {
    const page = new Uint32Array(HI_WIDTH * CELL);
    a.draw(page, t, 0, 0, 0x05, place);
    return Array.from({ length: CELL * CELL }, (_, i) => page[Math.floor(i / CELL) * HI_WIDTH + (i % CELL)]);
  };

  /** A square of a towne's level (the map's floor all round it). */
  const square = (x: number, y: number): Place => ({ map: 0x110, x, y, around: new Uint8Array(25).fill(0x44) });

  it('draws the walking and standing Avatar, and the reflecting mirror before him, as the appearance chosen', () => {
    const a = art();
    a.leader = { map: 0x110, x: 10, y: 10 };
    const mirror = square(10, 9);
    const before = [0x14c, 0x14d, 0x11c, 0x9e].map((t) => drawn(a, t, t === 0x9e ? mirror : undefined));
    a.setAppearance({ figure: 1, skin: 7, hair: 6, main: 7, trim: 3 });
    const after = [0x14c, 0x14d, 0x11c, 0x9e].map((t) => drawn(a, t, t === 0x9e ? mirror : undefined));
    after.forEach((px, k) => expect(px, `tile ${k}`).not.toEqual(before[k]));
    // The mage: the standing Avatar is the mage's first frame, dressed.
    expect(drawn(a, 0x11c)).toEqual(drawn(a, 0x14c));
  });

  it('gives the Avatar as made back only to the party’s leader: anyone else before a mirror sees the original’s', () => {
    const a = art();
    const plain = drawn(a, 0x9e, square(12, 9));
    a.setAppearance({ figure: 2, skin: 3, hair: 4, main: 5, trim: 6 });
    a.leader = { map: 0x110, x: 10, y: 10 };
    // Someone else, two squares east of the leader, below a mirror; and the leader below his.
    expect(drawn(a, 0x9e, square(12, 9))).toEqual(plain);
    expect(drawn(a, 0x9e, square(10, 9))).not.toEqual(plain);
    // The same square on another level, or with no leader (a dungeon, the title), is not his.
    expect(drawn(a, 0x9e, { ...square(10, 9), map: 0x111 })).toEqual(plain);
    a.leader = null;
    expect(drawn(a, 0x9e, square(10, 9))).toEqual(plain);
  });

  it('leaves the companions’ figures and the plain mirror alone, and draws the Avatar as the tiles have it again with none', () => {
    const a = art();
    const others = [0x140, 0x144, 0x148, 0x9d].map((t) => drawn(a, t));
    const plain = drawn(a, 0x14c);
    a.setAppearance({ figure: 2, skin: 0, hair: 0, main: 1, trim: 1 });
    expect([0x140, 0x144, 0x148, 0x9d].map((t) => drawn(a, t))).toEqual(others);
    a.setAppearance(null);
    expect(drawn(a, 0x14c)).toEqual(plain);
  });
});
