/**
 * actors.ts
 *
 * The 32 actors (D_5c5a): finding one at a square, taking a free slot for
 * a new one, and whether an actor of a kind can stand on a tile (u5d
 * 3000.c, 2000.c ULTIMA_2c4c_IsWalkableTile).
 */

import { Game } from './game.ts';
import { T } from './tiles.ts';

/** ULTIMA_368e: the first actor from 1 up standing at (x, y, z): its tile, and its index in dx (0 if none). */
export function actorTileAt(g: Game, x: number, y: number, z: number): number {
  const s = g.s;
  for (let i = 1; i < 32; i++) {
    const a = s.actors[i];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z)) {
      s.dx = i;
      return a.tile;
    }
  }
  s.dx = 32;
  return 0;
}

/** ULTIMA_3702: the same, searching from 31 down to 0 (the party included). */
export function actorTileAtRev(g: Game, x: number, y: number, z: number): number {
  const s = g.s;
  for (let i = 31; i >= 0; i--) {
    const a = s.actors[i];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z)) {
      s.dx = i;
      return a.tile;
    }
  }
  s.dx = -1;
  return 0;
}

/** ULTIMA_3868: an actor slot 1-23 whose tile is in [lo, hi] (and out of view, if asked). */
function slotWith(g: Game, lo: number, hi: number, outOfView: boolean): number {
  const s = g.s;
  for (let i = 1; i < 0x18; i++) {
    const t = s.actors[i].tile;
    if (t >= lo && t <= hi && t !== 0xb5) {
      if (!outOfView) return i;
      const vx = (s.actors[i].x - s.x + 5) & 0xff;
      const vy = (s.actors[i].y - s.y + 5) & 0xff;
      if (vx > 10 || vy > 10) return i;
    }
  }
  return 0;
}

/** ULTIMA_38e4: a slot for a new actor: an empty one, else one to reuse, least missed first. */
export function freeActor(g: Game): number {
  const tries: [number, number, boolean][] = [
    [0, 0, false],
    [1, 0xf, true],
    [0x80, 0xff, true],
    [0x10, 0x11, true],
    [0x30, 0x7f, true],
    [1, 0xf, false],
    [0x80, 0xff, false],
    [0x10, 0x11, false],
    [0x30, 0x7f, false],
    [0, 0xff, false],
  ];
  for (const [lo, hi, out] of tries) {
    const i = slotWith(g, lo, hi, out);
    if (i !== 0) return i;
  }
  return 0;
}

/** ULTIMA_3a74. */
export function setActor(g: Game, i: number, tile: number, anim: number, x: number, y: number, z: number, b5: number): void {
  const a = g.s.actors[i];
  a.tile = tile & 0xff;
  a.anim = anim & 0xff;
  a.x = x & 0xff;
  a.y = y & 0xff;
  a.z = z & 0xff;
  a.b5 = b5 & 0xff;
}

// --- Where actors can go --------------------------------------------------------

/** ULTIMA_2bd4: ordinary ground (D_54d4); only people sit in chairs. */
function walkable(g: Game, actor: number, tile: number): boolean {
  let ok = (g.data.blocked()[tile >> 3] & (0x80 >> (tile & 7))) === 0;
  if ((actor & 0xfe) !== 0x1c && (actor & 0xf0) !== 0x40 && (tile & 0xfc) === T.Chair90) ok = false;
  return ok;
}

/** ULTIMA_2c2e: water, for what swims or flies. */
const water = (tile: number): boolean => tile < 4 || (tile & 0xf0) === T.T60;

/** ULTIMA_2c4c_IsWalkableTile: can an actor of this tile enter this map tile. */
export function canEnter(g: Game, actor: number, tile: number): boolean {
  switch (g.data.moveKind()[actor >> 2]) {
    case 0:
      return walkable(g, actor, tile);
    case 1: // sea creatures
      return water(tile);
    case 2: // fliers
      return (tile & 0xf0) === T.T60 || water(tile) || walkable(g, actor, tile);
    case 3: // horses: not through lava or poison
      return walkable(g, actor, tile) && tile !== T.Lava && tile !== 4;
    case 4: // ghosts and Shadowlords: anything but water
      return !water(tile);
    case 5: // skiffs
      if ((tile & 0xfc) === T.T34) return ((8 >> (actor & 3)) & g.data.skiffBridge()[tile - T.T34]) !== 0;
      if (!water(tile)) return false;
      if (tile < T.T60) return true;
      return (g.data.skiffShore()[tile - T.T60] & (8 >> (actor & 3))) !== 0;
    case 6: // frigates: deep water only
      return tile <= 2;
    case 7: // rot worms
      return tile === T.Poison;
    case 8: // corpsers
      return tile === T.Grass;
    case 9: // whirlpools
      return tile === T.Water1;
    case 10: // sand traps
      return tile === T.T7;
    default:
      return false;
  }
}

/**
 * Whether anything worth taking lies on the field: a chest, or what came out of one (the things that lie about to
 * be picked up are tiles 1 to 15 - gold, a potion, a scroll, arms, a key, a gem, a torch, food).
 */
export function treasureLies(g: Game): boolean {
  return g.s.actors.some((a, i) => i > 0 && a.tile >= 1 && a.tile <= 0xf);
}
