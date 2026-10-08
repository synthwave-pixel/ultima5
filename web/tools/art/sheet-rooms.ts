/**
 * sheet-rooms.ts
 *
 * Inside: floors and walls, windows, rubble, the trapdoor, stairs in
 * their four directions, and the marks on a floor (blood, bones, eyes in
 * the dark). The furniture of Britannia's houses, shops and castles -
 * chairs and tables, doors, signs, torches, ladders and the rest - is
 * drawn in fittings.ts.
 */

import { rng, SIZE, speckle, Sprite } from './draw.ts';
import type { Group } from './build.ts';
import { P } from './palette.ts';
import { masonry } from './sheet-places.ts';
import { type Canvas, rgb, type RGB } from './paint.ts';
import { flagsCanvas, gridCobbles, hexFlags, planksCanvas, stoneCanvas } from './surfaces.ts';
import { worn } from './terrain.ts';
import { drystone } from './stones.ts';

// --- Floors and walls --------------------------------------------------------------------------------

/**
 * The floor of towns and castles: the ultima3 port's blue-grey town floor (the art direction's rule 3, quiet so
 * what stands on it is seen), which the trapdoor and the stove's top are set in too.
 */
/** The floor's stones and joint: the ultima3 port's blue-grey town floor, darker, so the walls and what stands on it read. */
const FLOOR_STONE = [0x24283a, 0x323852, 0x444c6a, 0x5a6484];
const FLOOR_JOINT = 0x181a26;
/** Modern PC's cobbles: the same stones, their two lighter tones a fifth darker, so they sit with the original tiles. */
const FLOOR_STONE_PC = FLOOR_STONE.map((c, i) =>
  i < 2 ? c : (Math.round((c >> 16) * 0.8) << 16) | (Math.round(((c >> 8) & 0xff) * 0.8) << 8) | Math.round((c & 0xff) * 0.8),
);

/** The interior stone floor: cobbles on the grid. */
function brickFloor(): Sprite {
  return gridCobbles(0x44, FLOOR_STONE, FLOOR_JOINT).sprite();
}

/**
 * The loose brick on Modern PC's cobbles: the cobbles on the originals' grid, one pixel inside a stone near the
 * middle of the tile the joint's dark - a chip out of it, to be seen only by looking.
 */
function looseBrick(): Canvas {
  const c = gridCobbles(0x44, FLOOR_STONE_PC, FLOOR_JOINT, true);
  const joint = rgb(FLOOR_JOINT);
  const at = (gx: number, gy: number): RGB => c.get(gx * 4, gy * 4);
  const isJoint = (v: RGB): boolean => v[0] === joint[0] && v[1] === joint[1] && v[2] === joint[2];
  // The stone pixel nearest the middle with stone all round it.
  let best: [number, number] = [8, 8];
  let near = Infinity;
  for (let gy = 1; gy < 15; gy++)
    for (let gx = 1; gx < 15; gx++) {
      if ([at(gx, gy), at(gx - 1, gy), at(gx + 1, gy), at(gx, gy - 1), at(gx, gy + 1)].some(isJoint)) continue;
      const d = Math.hypot(gx - 7.5, gy - 7.5);
      if (d < near) [best, near] = [[gx, gy], d];
    }
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) c.set(best[0] * 4 + x, best[1] * 4 + y, joint);
  return c;
}

/** The hex floor: the same stones and joint, laid as hexagons. */
function hexFloor(): Sprite {
  return hexFlags(0x45, FLOOR_STONE, FLOOR_JOINT).sprite();
}

/** A background tile's drawing doubled as it is - no rounding, no lit edge - as the land and its surfaces are. */
const plain = (s: Sprite): Sprite => {
  s.blocky = true;
  return s;
};

function planks(seed: number, down: boolean): Sprite {
  return planksCanvas(seed, down).sprite();
}

/** Stone flags. */
function flags(seed: number): Sprite {
  return flagsCanvas(seed).sprite();
}

/** White stone: the white walls of Britain's plaza and the like (0xfe, and the corners of 0xe4-0xe7). */
export function whiteStone(): Sprite {
  return stoneCanvas(0.45).sprite();
}

/** Light stone bricks (the white walls of castles and keeps). */
function stoneWall(): Sprite {
  return stoneCanvas().sprite();
}

/** A raised block of the great walls: dressed stone, its lit and shaded sides where `sides` say. */
function block(sides: { top?: boolean; left?: boolean; right?: boolean; bottom?: boolean }): Sprite {
  const s = new Sprite();
  masonry(s, 0, 0, SIZE, SIZE);
  if (sides.top) s.rect(0, 0, SIZE, 4, P.wallLight).hline(0, SIZE - 1, 4, P.wallShade);
  if (sides.left) s.rect(0, 0, 4, SIZE, P.wallLight).vline(4, 0, SIZE - 1, P.wallShade);
  if (sides.right) s.rect(28, 0, 4, SIZE, P.wallShade).vline(27, 0, SIZE - 1, P.wallLight);
  if (sides.bottom) s.rect(0, 28, SIZE, 4, P.wallShade);
  return s;
}

/** Stairs going up to the north; the others turn them. */
function stairs(): Sprite {
  const s = Sprite.filled(P.flagShade);
  for (let i = 0; i < 6; i++) {
    const y = 2 + i * 5;
    const tone = [P.flagShade, P.flag, P.flag, P.flagLight, P.wall, P.wallLight][5 - i];
    s.rect(2, y, 28, 4, tone).hline(2, 29, y, P.wallLight);
  }
  s.vline(1, 0, 31, P.charcoal).vline(30, 0, 31, P.charcoal);
  return s;
}

export function tiles(): Group {
  const t = new Map<number, Sprite>();
  const floor = brickFloor();

  // Floors and walls.
  t.set(0x40, planks(0x40, false));
  t.set(0x48, planks(0x48, true));
  t.set(0x49, planks(0x49, true).flipX());
  {
    const s = planks(0x43, false);
    s.rect(13, 0, 6, SIZE, P.redShade).rect(14, 0, 3, SIZE, P.red).vline(14, 0, 31, P.redLight);
    t.set(0x43, s);
  }
  t.set(0x44, floor);
  t.set(0x45, hexFloor());
  {
    const s = flags(0x4a);
    s.rect(13, 3, 6, 26, P.charcoal).rect(3, 13, 26, 6, P.charcoal).rect(14, 4, 4, 24, P.slate).rect(4, 14, 24, 4, P.slate);
    t.set(0x4a, plain(s));
  }
  t.set(0x4f, stoneWall());
  t.set(0x4e, stoneWall());
  t.set(
    0x87,
    (() => {
      const s = new Sprite();
      masonry(s, 0, 0, SIZE, SIZE, 'dark');
      return s;
    })(),
  );
  {
    const s = stoneWall();
    s.rect(9, 6, 14, 20, P.charcoalShade).rect(10, 7, 12, 18, P.moon);
    s.rect(15, 7, 2, 18, P.wood).rect(10, 14, 12, 2, P.wood);
    t.set(0x4b, plain(s));
  }
  // A window in a timbered wall, the sky beyond.
  {
    const s = planks(0x47, false);
    s.rect(0, 0, SIZE, 10, P.sky).rect(0, 0, SIZE, 3, P.waterShade);
    for (const x of [3, 14, 25]) s.rect(x, 0, 4, 12, P.bone).vline(x, 0, 11, P.boneLight);
    s.rect(0, 10, SIZE, 2, P.woodShade);
    t.set(0x47, plain(s));
  }
  // A fieldstone wall (0x4d): the huts' and towns' rough walls, and the dungeon rooms' rock - land (stones.ts), in six
  // versions by the square's place, grey below the world. Rubble on the ground (0x4c) and the stones lying about
  // (0xc0-0xc2) are pieces (fittings.ts).
  t.set(0x4d, drystone(0));
  // The great walls' blocks and pillars.
  const walls: [number, Parameters<typeof block>[0]][] = [
    [0x50, { top: true, right: true }],
    [0x51, { top: true, left: true }],
    [0x52, { bottom: true, right: true }],
    [0x53, { bottom: true, left: true }],
    [0x54, { right: true }],
    [0x55, { left: true }],
  ];
  for (const [tile, sides] of walls) t.set(tile, plain(block(sides)));
  {
    const s = Sprite.filled(P.charcoalShade);
    s.rect(9, 0, 14, SIZE, P.wall).rect(9, 0, 3, SIZE, P.wallLight).rect(20, 0, 3, SIZE, P.wallShade);
    t.set(0x56, plain(s));
    t.set(0x57, plain(s.rotate()));
  }
  {
    // A trapdoor in the floor.
    const s = floor.clone();
    s.rect(6, 6, 20, 20, P.woodShade).rect(7, 7, 18, 18, P.wood);
    for (let y = 9; y < 24; y += 5) s.hline(7, 24, y, P.woodShade);
    s.rect(20, 14, 3, 4, P.iron);
    t.set(0x8c, s);
  }
  // The stove's top, bones, blood, eyes in the dark.
  {
    const s = floor.clone();
    s.rect(6, 6, 20, 20, P.charcoal).ellipse(12, 12, 4, 4, P.charcoalShade).ellipse(21, 21, 4, 4, P.charcoalShade);
    s.ellipse(12, 12, 2, 2, P.red).ellipse(21, 21, 2, 2, P.orange);
    t.set(0xc3, s);
  }
  // Stairs in four directions.
  {
    const n = stairs();
    t.set(0xc4, n);
    t.set(0xc5, n.rotate());
    t.set(0xc6, n.rotate().rotate());
    t.set(0xc7, n.rotate().rotate().rotate());
  }
  {
    const s = worn(0xcc, 0.3);
    const r = rng(0xcc);
    s.ellipse(16, 17, 8, 5, P.redShade).ellipse(15, 16, 6, 3.5, P.red);
    speckle(s, 8, P.red, r, (x, y) => Math.hypot(x - 16, y - 17) < 12);
    t.set(0xcc, s);
  }
  {
    const s = Sprite.filled(P.charcoalShade);
    s.rect(15, 15, 2, 2, P.red).set(15, 15, P.redLight);
    t.set(0xcd, s);
    const e = Sprite.filled(P.charcoalShade);
    e.rect(10, 14, 3, 2, P.leafTip).rect(19, 14, 3, 2, P.leafTip).set(11, 14, P.white).set(20, 14, P.white);
    t.set(0xce, e);
    const b = Sprite.filled(P.charcoalShade);
    b.ellipse(12, 18, 4, 3.5, P.bone).rect(10, 17, 2, 2, P.charcoalShade).rect(13, 17, 2, 2, P.charcoalShade);
    b.line(17, 22, 27, 18, P.boneShade).line(17, 21, 27, 17, P.bone).ellipse(17, 21, 1.5, 1.5, P.bone).ellipse(27, 17, 1.5, 1.5, P.bone);
    t.set(0xcf, b);
  }
  t.set(0xfe, whiteStone());
  t.set(0xff, Sprite.filled(0x000000));
  // Modern PC's own versions of the surfaces it keeps from this set, on the originals' grid of 16 so they sit with the
  // original tiles round them, in the same colours: the cobbles, the hexagonal floor, the white stone; and the loose
  // brick, the cobbles with a single pixel out of place, as the hidden door is the wall with its nick.
  const pc = new Map<number, Sprite>([
    [0x44, plain(gridCobbles(0x44, FLOOR_STONE_PC, FLOOR_JOINT, true).sprite())],
    [0x45, plain(hexFlags(0x45, FLOOR_STONE, FLOOR_JOINT, true).sprite())],
    [0x8c, plain(looseBrick().sprite())],
    // The white stone (a wall, the game's Look says; common in towns): the walls' own dressed stone, not whitened.
    [0xfe, plain(stoneCanvas(0, true, 0.78).sprite())],
  ]);
  return {
    smooth: true,
    tiles: t,
    pc,
    variants: new Map([[0x4d, [1, 2, 3, 4, 5].map((v) => drystone(v))]]),
    variantsBelow: new Map([[0x4d, [0, 1, 2, 3, 4, 5].map((v) => drystone(v, true))]]),
  };
}
