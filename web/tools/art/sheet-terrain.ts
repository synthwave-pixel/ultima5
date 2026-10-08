/**
 * sheet-terrain.ts
 *
 * Which terrain tile is which: water and its rivers and shores (over
 * rolling water, the ground round them laid through their land), the grounds, plants and rock, lava, the masks the game
 * keeps among its tiles.
 */

import { CLEAR, SIZE, Sprite } from './draw.ts';
import type { Group } from './build.ts';
import { P } from './palette.ts';
import { whiteStone } from './sheet-rooms.ts';
import {
  bank,
  bankLand,
  woodsPieces,
  either,
  flowers,
  grass,
  greyGrass,
  greySquare,
  highCountry,
  HILL_LAYOUTS,
  ROCK_LAYOUTS,
  lava,
  redRock,
  RIVER,
  sand,
  shrub,
  woods,
  swamp,
  water,
  worn,
} from './terrain.ts';
import { lumps } from './paint.ts';

export function tiles(): Group {
  const t = new Map<number, Sprite>();
  const under: Record<number, number> = {};
  // Banks leave their land clear but for the mud: the ground round the square is laid there (the manifest's land).
  const land = new Map<number, Sprite>();
  t.set(0x01, water(0, 1));
  t.set(0x02, water(1, 2));
  t.set(0x03, water(2, 3));
  t.set(0x04, swamp(4));
  t.set(0x05, grass(5));
  // The woods: the ultima3 port's brush and forest themselves, recoloured; scrub and light forest those with
  // trees taken out (a diagonal pair of the brush's four; two of the forest's three).
  t.set(0x06, woods('scrub'));
  t.set(0x07, sand(7));
  t.set(0x08, woods('brush'));
  t.set(0x09, woods('light'));
  t.set(0x0a, woods('forest'));
  // The high country, a shape to a square: hill, mountain, snow-capped peak (highCountry).
  t.set(0x0b, highCountry('hill'));
  t.set(0x0c, highCountry('mountain'));
  t.set(0x0d, highCountry('peak'));
  t.set(0x0e, shrub()); // the fen's sedge, softer, on grass
  t.set(0x0f, highCountry('rocks', false, ROCK_LAYOUTS[0])); // grey stones, the hill's shape
  t.set(0x1e, flowers(0x1e, P.gold, P.orange));
  t.set(0x1f, flowers(0x1f, P.goldLight, P.red));
  [0.12, 0.3, 0.45, 0.55, 0.65, 0.78, 1.01].forEach((w, i) => t.set(0x20 + i, worn(0x20 + i, w)));
  t.set(0x27, redRock(0x27, false));
  t.set(0x28, redRock(0x28, true));
  [0.2, 0.35, 0.5, 0.85].forEach((w, i) => t.set(0x30 + i, worn(0x30 + i, w)));
  // The coast's diagonal corners (0x34 to 0x37): half water, half land, the coast running corner to corner - water
  // to the north-west, north-east, south-east or south-west, as the EGA tiles and the map's own neighbours have it.
  // The land is drawn over the running water with the river banks' muddy lip, its edge wandering a little but
  // meeting the tile's corners exactly, so one corner's coast runs on into the next.
  {
    const wobble = lumps(0x34, 4);
    const waterAt: [number, (x: number, y: number) => number][] = [
      [0x34, (x, y) => SIZE - 1 - (x + y)], // water to the north-west: above the diagonal from top right to bottom left
      [0x35, (x, y) => x - y], // to the north-east
      [0x36, (x, y) => x + y - (SIZE - 1)], // to the south-east
      [0x37, (x, y) => y - x], // to the south-west
    ];
    for (const [tile, side] of waterAt) {
      const wet = (x: number, y: number): boolean => {
        // How far along the coast (0 at one corner, 1 at the other): the wander dies away at the corners.
        const along = tile === 0x34 || tile === 0x36 ? (x - y + SIZE) / (2 * SIZE) : (x + y) / (2 * SIZE);
        const wander = (wobble(x * 2, y * 2) - 0.5) * 6 * Math.sin(Math.PI * along);
        return side(x, y) + wander > 0;
      };
      t.set(tile, bank(wet));
      land.set(tile, bankLand(wet));
      under[tile] = 3;
    }
  }
  // Rivers through the land, the water beneath.
  const rivers: [number, (x: number, y: number) => boolean][] = [
    [0x60, RIVER.ns],
    [0x61, RIVER.ew],
    [0x62, RIVER.bend(32, 0)],
    [0x63, RIVER.bend(32, 32)],
    [0x64, RIVER.bend(0, 32)],
    [0x65, RIVER.bend(0, 0)],
    [0x66, either(RIVER.ns, (x, y) => x > 15 && Math.abs(y - 15.5) < 7)],
    [0x67, either(RIVER.ew, (x, y) => y > 15 && Math.abs(x - 15.5) < 7)],
    [0x68, either(RIVER.ns, (x, y) => x < 16 && Math.abs(y - 15.5) < 7)],
    [0x69, either(RIVER.ew, (x, y) => y < 16 && Math.abs(x - 15.5) < 7)],
    [0x6c, RIVER.end('s')],
    [0x6d, RIVER.end('w')],
    [0x6e, RIVER.end('n')],
    [0x6f, RIVER.end('e')],
  ];
  for (const [tile, wet] of rivers) {
    t.set(tile, bank(wet));
    land.set(tile, bankLand(wet));
    under[tile] = 2;
  }
  // The bridges are pieces (fittings.ts), over the river drawn beneath them.
  under[0x6a] = 2;
  under[0x6b] = 2;
  // The masks the game keeps among its tiles (the river shapes, the water corners): drawn as masks, never on a map.
  rivers.forEach(([tile, wet], i) => {
    const s = new Sprite();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) s.set(x, y, wet(x, y) ? 0xd050d0 : 0x101010);
    t.set(0x70 + (tile - 0x60), s);
    void i;
  });
  for (const tile of [0x7a, 0x7b]) {
    const s = Sprite.filled(0x101010);
    if (tile === 0x7a) s.rect(0, 0, SIZE, 5, 0xd050d0).rect(0, 27, SIZE, 5, 0xd050d0);
    else s.rect(0, 0, 5, SIZE, 0xd050d0).rect(27, 0, 5, SIZE, 0xd050d0);
    t.set(tile, s);
  }
  // Water in a diagonal half (0xe4 lower right, then lower left, upper left, upper right), white stone the other
  // side (the corners of a white wall round water, as Britain's plaza); and their masks (0xd0-0xd3).
  const halves: ((x: number, y: number) => boolean)[] = [(x, y) => x + y > 31, (x, y) => y > x, (x, y) => x + y < 31, (x, y) => x > y];
  halves.forEach((wet, i) => {
    // A wedge of the plaza's white stone (0xfe), cut on the diagonal, over the shallow water the game makes these
    // tiles from (0x03), which rolls beneath as the moat's does.
    const s = whiteStone();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (wet(x, y)) s.set(x, y, CLEAR);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++)
        if (!wet(x, y) && (wet(x + 1, y) || wet(x - 1, y) || wet(x, y + 1) || wet(x, y - 1))) s.set(x, y, P.wallShade);
    }
    t.set(0xe4 + i, s);
    under[0xe4 + i] = 3;
    const m = new Sprite();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) m.set(x, y, wet(x, y) ? 0x101010 : 0xf0f0f0);
    t.set(0xd0 + i, m);
  });
  t.set(0x8f, lava(0x8f));
  t.set(0xe3, grass(0xe3, 90));
  // The dock is a piece (fittings.ts), over the water beneath it.
  under[0x1d] = 2;
  void CLEAR;
  // The land whose greens and bright flecks are quieter (build.ts quieter): the grass and what grows on it, the hills,
  // the swamp, the worn earth. Sand is left as it is: all of it is bright.
  // Below the world the grass is grey, and the high country grey stone (Manifest.below), its peaks capped with darker
  // stone.
  const below = new Map<number, Sprite>([
    [0x05, greyGrass(5)],
    [0x0c, highCountry('mountain', true)],
    [0x0d, highCountry('peak', true)],
    [0x0f, highCountry('rocks', true, ROCK_LAYOUTS[0])],
    // What grows on the grass, grey as it is.
    [0x06, greySquare(woods('scrub'))],
    [0x08, greySquare(woods('brush'))],
    [0x09, greySquare(woods('light'))],
    [0x0a, greySquare(woods('forest'))],
    [0x0e, greySquare(shrub())],
    [0x1e, greySquare(flowers(0x1e, P.gold, P.orange))],
    [0x1f, greySquare(flowers(0x1f, P.goldLight, P.red))],
  ]);
  // The hill's six layouts, one to a square by its place (Manifest.variants), grey below the world.
  const variants = new Map<number, Sprite[]>([
    [0x0b, HILL_LAYOUTS.slice(1).map((l) => highCountry('hill', false, l))],
    [0x0f, ROCK_LAYOUTS.slice(1).map((l) => highCountry('rocks', false, l))],
  ]);
  const variantsBelow = new Map<number, Sprite[]>([
    [0x0b, HILL_LAYOUTS.map((l) => highCountry('hill', true, l))],
    [0x0f, ROCK_LAYOUTS.map((l) => highCountry('rocks', true, l))],
  ]);
  const quiet = [0x04, 0x05, 0x06, 0x08, 0x09, 0x0a, 0x0e, 0x1e, 0x1f, 0xe3, ...range(0x20, 0x26), ...range(0x30, 0x33)];
  return {
    smooth: true,
    tiles: t,
    under,
    land,
    // Modern PC's roofs, on the originals' grid of 16 (surfaces.ts PC_GRID): the same courses, their pixels as large.
    pc: new Map([
      [0x27, redRock(0x27, false, true)],
      [0x28, redRock(0x28, true, true)],
    ]),
    below,
    variants,
    variantsBelow,
    pieces: woodsPieces(),
    quiet,
    scroll: { 1: 2, 2: 2, 3: 2, 0x8f: 2 },
  };
}

/** The numbers from `a` to `b`, both included. */
function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
