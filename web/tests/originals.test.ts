import { describe, expect, it } from 'vitest';
import { lzwDecompress } from '../src/data/lzw.ts';
import { HI } from '../src/ui/framebuffer.ts';
import { ARCHWAY, byWater, CORNERS, GRASS, MOONGATE, ORIGINALS, OUTDOORS, RIVER_BLUES, STRUCTURE, original } from '../src/ui/originals.ts';
import { gameFiles } from './helpers.ts';

/**
 * The Standard look's actors and furniture are the original tiles (web/src/ui/originals.ts): lifted off the ground
 * they were drawn on, toned, a few recoloured.
 */
describe('the originals in the Standard look', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const CELL = 16 * HI;
  const clear = (px: Uint32Array, x: number, y: number): boolean => px[y * HI * CELL + x * HI] >>> 24 === 0;
  const colour = (px: Uint32Array, x: number, y: number): number => px[y * HI * CELL + x * HI] & 0xffffff;

  it('keeps the Standard key, and draws the gem, helm, ring, armour and torch from the originals', () => {
    expect(ORIGINALS.has(0x107)).toBe(false);
    for (const t of [0x102, 0x108, 0x109, 0x10a, 0x10b, 0x10d]) expect(ORIGINALS.has(t)).toBe(true);
    expect(ORIGINALS.has(0x05)).toBe(false); // grass is the ground, drawn whole (OUTDOORS), not lifted
  });

  it('gives the desert, the mountains and the roads grounds of their own, not black', () => {
    const black = (t: number): boolean => [...original(tiles, t)].some((v) => (v & 0xffffff) === 0x1a1416);
    for (const t of [0x07, 0x0c, 0x0d, 0x20, 0x2c]) expect(black(t)).toBe(false);
  });

  it('draws the lava, the fields and the Shadowlords in the EGA’s own colours, the Shadowlords’ bodies black', () => {
    const colours = (t: number): Set<number> => new Set([...original(tiles, t)].filter((v) => v >>> 24).map((v) => v & 0xffffff));
    expect(colours(0x8f).has(0x5555ff)).toBe(true); // the EGA's light red, 0xff5555, in memory order
    expect(colours(0x1fc).has(0x000000)).toBe(true); // a body, black
  });

  it('builds the corner pieces and the archway from the wall', () => {
    const wall = new Set([...original(tiles, 0x4f)].map((v) => v & 0xffffff));
    for (const t of [...CORNERS, ARCHWAY]) expect([...original(tiles, t)].some((v) => wall.has(v & 0xffffff))).toBe(true);
  });

  it('draws the towns chosen whole, the cobbles and roofs left the Standard look’s', () => {
    for (const t of [0x40, 0x48, 0x4f, 0x50, 0xbc]) {
      expect(STRUCTURE.has(t)).toBe(true);
      expect(original(tiles, t).every((v) => v >>> 24 === 255)).toBe(true);
    }
    for (const t of [0x44, 0x45, 0x27, 0xfe]) expect(STRUCTURE.has(t) || ORIGINALS.has(t)).toBe(false);
  });

  it('darkens the floor’s nails to the wood’s brightness, and the battlements’ white', () => {
    const colours = (t: number): Set<number> => new Set([...original(tiles, t)].map((v) => v & 0xffffff));
    for (const t of [0x40, 0x48, 0x49]) {
      expect(colours(t).has(0x606060)).toBe(true); // a nail (RGBA in memory order: grey is the same either way)
      expect(colours(t).has(0x9ea6a8)).toBe(false); // the toned light grey (0xa8a69e), in memory order
    }
    // The toned white (0xf0ece0, 0xe0ecf0 in memory order) is gone from the tops.
    expect(colours(0x57).has(0xe0ecf0)).toBe(false);
  });

  it('takes a figure off its black ground, and keeps the black inside it', () => {
    const px = original(tiles, 0x102); // the gold: a bag on black
    expect(clear(px, 0, 0)).toBe(true);
    expect(clear(px, 8, 11)).toBe(false);
  });

  it('takes a chair off the brick floor it was drawn on', () => {
    const px = original(tiles, 0x90);
    let red = 0;
    // Where the EGA drew the floor's red bricks round the chair, nothing is left.
    for (let x = 0; x < 16; x++) if (!clear(px, x, 0) && (colour(px, x, 0) & 0xff) > 0x80) red++;
    expect(red).toBe(0);
  });

  it('leaves the gold a bag, its $ gone', () => {
    const px = original(tiles, 0x102);
    // The $'s stem and bars were the EGA's brown down the bag's middle: all gold now.
    for (const [x, y] of [
      [7, 8],
      [6, 10],
      [7, 12],
    ])
      expect(colour(px, x, y)).toBe(colour(px, 5, 11));
  });

  it('draws the land out in the world whole, the ground it is', () => {
    for (const t of [0x02, 0x05, 0x0a, 0x0c, 0x20]) {
      expect(OUTDOORS.has(t)).toBe(true);
      expect(original(tiles, t).every((v) => v >>> 24 === 255)).toBe(true);
    }
    expect(OUTDOORS.has(0x44)).toBe(false); // a town's floor stays the Standard look's
  });

  it('lays the grass darker and greyer, and leaves the leaves on it as they were', () => {
    const greens = (t: number): Set<number> =>
      new Set([...original(tiles, t)].map((v) => v & 0xffffff).filter((v) => ((v >> 8) & 0xff) > (v & 0xff) + 20));
    const lum = (v: number): number => (v & 0xff) * 0.3 + ((v >> 8) & 0xff) * 0.59 + ((v >> 16) & 0xff) * 0.11;
    const blade = Math.max(...[...greens(0x05)].map(lum));
    // The forest's own greens: its leaves keep their light, brighter than any blade of grass.
    expect(Math.max(...[...greens(0x0a)].map(lum))).toBeGreaterThan(blade * 1.15);
    // A road's grass is the grass's.
    expect([...greens(0x20)].every((v) => greens(0x05).has(v))).toBe(true);
  });

  it('lets the grass page colour the grass, and only the grass', () => {
    const was = GRASS.ground;
    const colours = (t: number): Set<number> => new Set([...original(tiles, t)].map((v) => v & 0xffffff));
    try {
      GRASS.ground = 0x123456; // 0x563412 in memory order
      expect(colours(0x05).has(0x563412)).toBe(true);
      expect(colours(0x0a).has(0x563412)).toBe(true); // between the trees
      for (const t of [0x02, 0x0c, 0x07]) expect(colours(t).has(0x563412)).toBe(false); // water, mountains, desert
    } finally {
      GRASS.ground = was;
    }
  });

  it('draws a river’s channel in blues behind its light blue lines, its banks the grass, never black', () => {
    const mem = (c: number): number => ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    for (const t of [...Array(16).keys()].map((k) => 0x60 + k).filter((t) => t !== 0x6a && t !== 0x6b)) {
      const colours = new Set([...original(tiles, t)].filter((v) => v >>> 24).map((v) => v & 0xffffff));
      expect(colours.has(mem(0x16141a))).toBe(false);
      for (const c of [RIVER_BLUES.deep, GRASS.ground, GRASS.blade]) expect(colours.has(mem(c))).toBe(true);
    }
    // Its middle river, its edge (the east-west river's top row) bank.
    const ew = original(tiles, 0x61);
    const water = [RIVER_BLUES.deep, RIVER_BLUES.shallow].map(mem).concat(0xd0745e);
    expect(water.includes(colour(ew, 3, 8))).toBe(true);
    expect([mem(GRASS.ground), mem(GRASS.blade)].includes(colour(ew, 1, 0))).toBe(true);
  });

  it('draws the waters on blues, darker the deeper, and lifts a bridge’s own water', () => {
    const lum = (t: number): number => {
      const px = [...original(tiles, t)];
      return px.reduce((a, v) => a + (v & 0xff) + ((v >> 8) & 0xff) + ((v >> 16) & 0xff), 0) / px.length;
    };
    for (const t of [1, 2, 3]) expect([...original(tiles, t)].some((v) => (v & 0xffffff) === 0x1a1416)).toBe(false);
    expect(lum(1)).toBeLessThan(lum(2));
    expect(lum(2)).toBeLessThan(lum(3));
    // The bridge's light blue water bits (the EGA's 9, 0x5e74d0 toned: 0xd0745e in memory order) are gone.
    expect([...original(tiles, 0x6a)].some((v) => v >>> 24 && (v & 0xffffff) === 0xd0745e)).toBe(false);
  });

  it('draws the chest in wood and the gold’s bag in leather, not gold', () => {
    const gold = 0x64cce0; // the toned yellow, 0xe0cc64, in memory order
    for (const t of [0x101, 0x102]) expect([...original(tiles, t)].some((v) => (v & 0xffffff) === gold)).toBe(false);
  });

  it('shows the trapped souls as the ghost in a silver mirror, its frames the ghost’s', () => {
    const colours = (t: number): Set<number> => new Set([...original(tiles, t)].filter((v) => v >>> 24).map((v) => v & 0xffffff));
    // The ghost's cyan (the EGA's 0x00aaaa, 0xaaaa00 in memory order) and the frame's silver (0xc4c8d0: 0xd0c8c4).
    for (const t of [0x13c, 0x13d, 0x13e, 0x13f]) {
      expect(colours(t).has(0xaaaa00)).toBe(true);
      expect(colours(t).has(0xd0c8c4)).toBe(true);
    }
    const frame = (t: number): string => [...original(tiles, t)].join(',');
    expect(frame(0x13c)).not.toBe(frame(0x13d));
  });

  it('keeps the paths’ and the edges’ specks where the original has them, bare earth only in a path’s band', () => {
    const mem = (c: number): number => ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    const specks = [0x5e3e1f, 0x644324, 0x6a4727, 0x4a4a50, 0x5c5c62].map(mem);
    const brown = (t: number, x: number, y: number): boolean => {
      const v = tiles[t * 128 + ((y * 16 + x) >> 1)];
      return (x & 1 ? v & 15 : v >> 4) === 6;
    };
    for (const t of [0x20, 0x23, 0x26, 0x30, 0x33]) {
      const px = original(tiles, t);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(specks.includes(colour(px, x, y))).toBe(brown(t, x, y));
    }
    const has = (t: number, c: number): boolean => [...original(tiles, t)].some((v) => (v & 0xffffff) === mem(c));
    expect(has(0x20, 0x241b10)).toBe(true); // a path's track
    expect(has(0x30, 0x241b10)).toBe(false); // an edge is specks on the grass
    expect(has(0x30, GRASS.ground)).toBe(true);
  });

  it('draws a dirt edge beside the water as plain grass, the shore’s sand fringe in its place', () => {
    const specks = [0x5e3e1f, 0x644324, 0x6a4727, 0x4a4a50, 0x5c5c62].map((c) => ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff));
    expect([...original(tiles, 0x32)].some((v) => specks.includes(v & 0xffffff))).toBe(true);
    expect([...original(tiles, 0x32, 0, undefined, true)].some((v) => specks.includes(v & 0xffffff))).toBe(false);
    const around = new Uint8Array(25).fill(0x05);
    expect(byWater(0x32, around)).toBe(false);
    around[17] = 0x02; // the water below, on the side the edge's specks lie
    expect(byWater(0x32, around)).toBe(true);
    expect(byWater(0x30, around)).toBe(false);
  });

  it('keeps a door whole', () => {
    const px = original(tiles, 0xb8);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(clear(px, x, y)).toBe(false);
  });

  it('glows inside the moongate, and the glow breathes', () => {
    const a = original(tiles, MOONGATE, 0);
    const b = original(tiles, MOONGATE, 12);
    expect(colour(a, 7, 8)).not.toBe(colour(b, 7, 8));
    expect(clear(a, 0, 0)).toBe(false); // the square, whole
  });
});
