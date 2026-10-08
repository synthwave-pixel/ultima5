import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { PEOPLE_SKIN, SKIN } from '../src/game/appearance.ts';
import { labels } from '../src/ui/avatarRegions.ts';
import { PEOPLE_RULES, original } from '../src/ui/originals.ts';
import { gameFiles } from './helpers.ts';

describe('the people of Sosaria’s skin', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const mem = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
  const ramp = SKIN[PEOPLE_SKIN].map(mem);

  /** How many tiles a figure's rules cover: the Avatar standing is one tile (the three after it are not people). */
  const frames = (base: number): number => (base === 0x11c ? 1 : 4);
  /**
   * The frames that legitimately show no face: the chair seen from the north has the back of the head to us, and
   * nothing in the box to paint.
   */
  const FACELESS = new Set([0x130]);

  it('draws every person’s face in the neutral ramp in the Modern PC tiles', () => {
    for (const base of PEOPLE_RULES.keys())
      for (let f = 0; f < frames(base); f++) {
        if (FACELESS.has(base + f)) continue;
        const px = [...original(tiles, base + f)];
        expect(
          px.some((v) => ramp.includes(v)),
          `${(base + f).toString(16)}`,
        ).toBe(true);
      }
  });

  it('paints nothing of a frame with no face', () => {
    for (const t of FACELESS)
      expect(
        [...original(tiles, t)].some((v) => ramp.includes(v)),
        t.toString(16),
      ).toBe(false);
  });

  it('keeps to the tiles that are people: the invisible, the falling and the corpse beside the Avatar have no skin', () => {
    for (const t of [0x11d, 0x11e, 0x11f])
      expect(
        [...original(tiles, t)].some((v) => ramp.includes(v)),
        t.toString(16),
      ).toBe(false);
  });

  it('leaves the rest of their brown alone: the townsman’s shoes stay the toned brown', () => {
    const shoes = original(tiles, 0x150)[15 * 4 * 64 + 6 * 4]; // (6, 15): a shoe
    expect(ramp).not.toContain(shoes);
  });

  /** The EGA pixels of tile `t` that original() paints in the people's ramp. */
  const skin = (t: number): number[] => {
    const px = original(tiles, t);
    return Array.from({ length: 256 }, (_, i) => i).filter((i) => ramp.includes(px[Math.floor(i / 16) * 4 * 64 + (i % 16) * 4]));
  };

  it('agrees with the Avatar’s figures on what is skin: a companion’s figure is the Avatar’s, pixel for pixel', () => {
    // The mage, the bard, the jester and the townsman, each frame: what the people's skin paints is what the Avatar's
    // skin will (a custom skin leaves none of the neutral tone), and nothing else.
    for (const base of [0x140, 0x144, 0x158, 0x150])
      for (let f = 0; f < 4; f++) {
        const s = labels(tiles, base, f).flatMap((r, i) => (r === 's' ? [i] : []));
        expect(skin(base + f), `${(base + f).toString(16)}`).toEqual(s);
      }
  });

  it('leaves the bard’s lute and the swords’ grips as drawn: his right hand is skin, their brown is not', () => {
    const at = (x: number, y: number): number => y * 16 + x;
    // The lute's body at his left (frame 0), at his chest (frame 1); the hand at his right.
    expect(skin(0x144)).not.toContain(at(3, 8));
    expect(skin(0x145)).not.toContain(at(9, 7));
    expect(skin(0x144)).toContain(at(14, 7));
    // The grip between the hilt's yellow: the fighter's, and the Avatar standing's.
    expect(skin(0x148)).not.toContain(at(13, 6));
    expect(skin(0x11c)).not.toContain(at(13, 6));
    expect(skin(0x11c)).not.toContain(at(13, 7));
    expect(skin(0x11c)).toContain(at(8, 8)); // his hand
  });

  it('paints the townsman’s face in the mid step of the ramp', () => {
    const face = original(tiles, 0x150)[3 * 4 * 64 + 8 * 4]; // (8, 3): the brown of his face
    expect(face).toBe(ramp[1]);
  });
});
