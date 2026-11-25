import { afterEach, describe, expect, it } from 'vitest';
import type { Font } from '../src/data/font.ts';
import { WORLD_SIZE } from '../src/data/maps.ts';
import { K, Pad } from '../src/game/io.ts';
import { named, spread, type Mark } from '../src/ui/mapMarks.ts';
import { mapKey, showWorldMap, tileQuads, type WorldMapSource } from '../src/ui/mapView.ts';
import { drawParchment } from '../src/ui/parchment.ts';
import { fakePage, type FakePage } from './fakeMapDom.ts';

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

/**
 * The neutral map fed by another game (mapView.ts showWorldMap): one world, no Underworld, no cloth map, no page of
 * the place the party is in, a font of its own, its own record of sight and of names learnt.
 */
describe("a world map from another game's source", () => {
  let page: FakePage | null = null;
  afterEach(() => {
    page?.restore();
    page = null;
  });

  /** A font whose every glyph differs from every other, so the legend reads back. */
  const font: Font = { rows: Uint8Array.from({ length: 1024 }, (_, i) => ((i >> 3) * 37 + (i & 7) * 11) & 0xff) };
  const land = (x: number, y: number): boolean => x >= 40 && x < 220 && y >= 40 && y < 220;

  const source = (learnt: Set<string>, closed: { n: number }): WorldMapSource => {
    const tiles = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    for (let y = 0; y < WORLD_SIZE; y++) for (let x = 0; x < WORLD_SIZE; x++) tiles[y * WORLD_SIZE + x] = land(x, y) ? 4 : 0;
    const seen = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    for (let y = 100; y < 140; y++) for (let x = 100; x < 140; x++) seen[y * WORLD_SIZE + x] = 1;
    const marks: Mark[] = [
      { x: 120, y: 120, kind: 'castle', name: 'Castle One', key: 'place:1', hint: 'Castle?', onPaper: true },
      { x: 60, y: 60, kind: 'towne', name: 'Towne Two', key: 'place:2', hint: 'Towne?', onPaper: true },
      { x: 200, y: 200, kind: 'dungeon', name: 'Deep Three', key: 'place:3', hint: 'Dungeon?', onPaper: false },
      { x: 130, y: 125, kind: 'moongate', name: 'Moongate', onPaper: true },
    ];
    return {
      worlds: [{ tiles, paper: drawParchment(tiles, (t) => t <= 2), seen, marks: spread(marks), party: { x: 118, y: 118 }, offered: true }],
      opensOn: 0,
      from: { x: 118, y: 118 },
      partyName: 'Kestrel',
      knows: (key) => learnt.has(key),
      font,
      tiles: new Uint8Array(256 * 128).fill(0x24),
      tileCount: 256,
      art: null,
      onClose: () => closed.n++,
    };
  };

  /** The map shown and driven by `keys`, the legend after each. */
  const drive = (learnt: Set<string>, keys: number[]) => {
    page = fakePage();
    const p = page;
    const closed = { n: 0 };
    const done = showWorldMap(source(learnt, closed));
    const shots = [p.shot(font)];
    for (const k of keys) {
      mapKey(k);
      p.flush();
      shots.push(p.shot(font));
    }
    return { p, done, closed, shots, legends: shots.map((s) => (s.legend as { text: string } | null)?.text ?? null) };
  };

  it("opens on the party, named by the game's own font, and asks for no cloth map", () => {
    const { p, legends } = drive(new Set(), []);
    expect(legends).toEqual(['Kestrel']);
    expect(p.shot(font).shows).toBe('canvas');
    expect(p.made.filter((e) => e.tag === 'img').every((e) => e.src === '')).toBe(true);
  });

  it('turns to no other page with X: the one world is the only map', () => {
    const { p, shots } = drive(new Set(), []);
    mapKey(Pad.X);
    p.flush();
    expect(p.shot(font)).toEqual(shots[0]);
  });

  it('calls an unlearnt place what it looks like, and by its name once learnt', () => {
    const learnt = new Set<string>();
    const { p, legends } = drive(learnt, [K.Right]);
    expect(legends).toEqual(['Kestrel', 'Castle?']);
    learnt.add('place:1');
    mapKey(Pad.X);
    expect((p.shot(font).legend as { text: string }).text).toBe('Castle One');
  });

  it('steps only between the marks it shows: no dungeon unseen and off the paper', () => {
    const { legends } = drive(new Set(), [K.Right, K.Right, K.Down, K.Down, K.Left, K.Left, K.Left, K.Up, K.Up, K.Up]);
    expect(legends).toContain('Moongate');
    expect(legends).toContain('Towne?');
    expect(legends).not.toContain('Dungeon?');
  });

  it('closes on B, the page put back and the source told', async () => {
    const { p, done, closed } = drive(new Set(), [Pad.B]);
    await done;
    expect(closed.n).toBe(1);
    expect(p.body.children).toEqual([]);
    expect(mapKey(K.Right)).toBe(false);
  });
});
