import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../src/data/maps.ts';
import { named, spread, type Mark } from '../src/ui/mapMarks.ts';
import { tileQuads } from '../src/ui/mapView.ts';
import { drawParchment } from '../src/ui/parchment.ts';

/**
 * The world map's seam, for a game other than Ultima V (mapView.ts showWorldMap): its own sea on the paper, as many
 * tiles as its sheet has, and the marks eased apart and gates named as Ultima V's are.
 */
describe("the drawn map's sea", () => {
  /** A world of `tile`, with a block of `other` in its middle. */
  const world = (tile: number, other: number): Uint8Array => {
    const map = new Uint8Array(WORLD_SIZE * WORLD_SIZE).fill(tile);
    for (let y = 100; y < 140; y++) for (let x = 100; x < 140; x++) map[y * WORLD_SIZE + x] = other;
    return map;
  };

  it("is Ultima V's deep water and shallows when none is given", () => {
    const map = world(1, 5);
    expect(drawParchment(map)).toEqual(drawParchment(map, (t) => t >= 1 && t <= 3));
  });

  it("is the game's own where one is given: tile 0 the sea", () => {
    // Ultima IV's deep water is tile 0, which Ultima V's test calls land.
    const map = world(0, 4);
    const own = drawParchment(map, (t) => t <= 2);
    expect(own).not.toEqual(drawParchment(map));
    // The same sea with land in the middle, whichever tile numbers say so.
    expect(own).toEqual(drawParchment(world(1, 5)));
  });
});

describe("the tiles' colours on the map", () => {
  /** A sheet of `count` tiles, 128 bytes each (16 by 16, four bits a pixel), each tile one colour. */
  const sheet = (count: number): Uint8Array => {
    const tiles = new Uint8Array(count * 128);
    for (let t = 0; t < count; t++) tiles.fill((t & 15) * 0x11, t * 128, t * 128 + 128);
    return tiles;
  };

  it('stops at the tile count given: a sheet of 256 is read to its end and no further', () => {
    const quads = tileQuads(sheet(256), 256, null);
    expect(quads.length).toBe(256);
    expect(quads.every((q) => q.every((c) => c.every((v) => Number.isFinite(v))))).toBe(true);
  });

  it("gives Ultima V's 512 the colours it gave them", () => {
    const tiles = sheet(0x200);
    expect(tileQuads(tiles, 0x200, null).slice(0, 256)).toEqual(tileQuads(tiles.subarray(0, 256 * 128), 256, null));
  });
});

describe("the marks, eased apart and named, for another game's map", () => {
  it('moves the second of two marks on one square off it', () => {
    const marks: Mark[] = [
      { x: 10, y: 10, kind: 'towne', onPaper: true },
      { x: 10, y: 10, kind: 'castle', onPaper: true },
    ];
    spread(marks);
    expect([marks[0].x, marks[0].y]).toEqual([10, 10]);
    expect(Math.max(Math.abs(marks[1].x - 10), Math.abs(marks[1].y - 10))).toBeGreaterThanOrEqual(3);
  });

  it('names a gate the party has ridden by the place nearest where it led', () => {
    const marks: Mark[] = [
      { x: 50, y: 50, kind: 'moongate', name: 'Moongate', onPaper: true, leadsTo: [80, 81] },
      { x: 80, y: 80, kind: 'towne', name: 'Britain', key: 'place:1', hint: 'Towne?', onPaper: true },
    ];
    named(marks);
    expect(marks[0].name).toBe('Moongate to Britain');
    expect(marks[0].hint).toBe('Moongate to a towne');
    expect(marks[0].key).toBe('place:1');
  });
});
