/**
 * world.ts
 *
 * The map in memory and what the party sees of it, after u5d:
 *
 * - The map (D_6608) holds four 16x16 chunks of Britannia or the
 *   Underworld around the party, or one settlement level; tiles are
 *   addressed as ULTIMA_4402_GetTileAddr does, wrapping within the 32x32
 *   window. Changes to the world map last until its chunk is reloaded,
 *   as in the original.
 * - Line of sight (ULTIMA_5a28) is a breadth-first walk from the party
 *   through see-through tiles, limited by the light; beyond the light,
 *   only squares lit by torches, braziers and the like (the light map,
 *   ULTIMA_5e4a) show.
 * - The viewport (D_ab02) is then drawn with the actors over it
 *   (ULTIMA_5394, ULTIMA_56ac), once per frame (ULTIMA_5910_UpdateFrame).
 */

import { type Bumped, Game, thingKey } from './game.ts';
import { Colour } from '../ui/colours.ts';
import type { Dressing, Figure, Place } from './io.ts';
import { Status } from './save.ts';
import { A, T } from './tiles.ts';
import { CLASSES } from './zstats.ts';
import { dressingOf, dressingOfActor } from './companions.ts';

/** A byte of memory: a buffer and an index. */
export type Cell = [Uint8Array, number];

/** Where tile (x, y) of the current map is kept (ULTIMA_4402_GetTileAddr). */
export function tileCell(g: Game, x: number, y: number): Cell {
  const s = g.s;
  if (s.mapId > 0x7f) {
    // Combat: an 11x11 arena. The original could read above it (y < 0); that reads a spare byte.
    if (y < 0) return [g.map, 1023];
    return [g.combatMap, y * 32 + x];
  }
  if (s.mapId === 0) {
    x = (x - s.chunkX) & 0x1f;
    y = (y - s.chunkY) & 0x1f;
    let quad = 0;
    if (y > 15) {
      quad = 2;
      y -= 16;
    }
    if (x > 15) {
      quad++;
      x -= 16;
    }
    return [g.map, quad * 256 + y * 16 + x];
  }
  if (x < 0 || y < 0 || x > 31 || y > 31) return [g.map, 1023];
  return [g.map, y * 32 + x];
}

export function tileAt(g: Game, x: number, y: number): number {
  const [b, i] = tileCell(g, x, y);
  return b[i];
}

export function setTileAt(g: Game, x: number, y: number, tile: number): void {
  const [b, i] = tileCell(g, x, y);
  b[i] = tile;
}

/** ULTIMA_39cc_SetTile: only in settlements, and never to tile 0. */
export function setTownTile(g: Game, tile: number, x: number, y: number): void {
  if (g.inTown && tile !== 0) setTileAt(g, x, y, tile);
}

export const viewAt = (g: Game, x: number, y: number): number => g.view[y * 32 + x];
export const setView = (g: Game, x: number, y: number, v: number): void => {
  g.view[y * 32 + x] = v;
};
export const actorAt = (g: Game, x: number, y: number): number => g.actorMap[y * 16 + x];
/** The terrain drawn at view square (x, y): its own tile, or for an actor's square the ground the actor stands on. */
export function groundAt(g: Game, x: number, y: number): number | undefined {
  if (x < 0 || x > 10 || y < 0 || y > 10) return undefined;
  const v = viewAt(g, x, y);
  return g.cycles.shown[v !== 0 ? v : g.groundMap[y * 16 + x]];
}

// --- Loading Britannia and the Underworld ---------------------------------------

/**
 * Whether the entrance in this chunk is closed: a dungeon's is sealed
 * until its Word of Power is yelled there (D_58d0 set; u5d outsubs.c
 * OUTSUBS_0000, closed for chunks not in D_3866), a shrine is ruined once
 * its Shadowlord is bound to it (D_58d8 bit 7; OUTSUBS_004a).
 */
function dungeonSealed(g: Game, offset: number): boolean {
  const chunk = (offset >> 8) & 0xff;
  const ids = g.data.bytes(0x3866, 8);
  for (let i = 0; i < 8; i++) if (ids[i] === chunk) return g.s.d58d0[i] === 0;
  return true;
}
function shrineRuined(g: Game, offset: number): boolean {
  const chunk = (offset >> 8) & 0xff;
  const ids = g.data.bytes(0x386e, 8);
  for (let i = 0; i < 8; i++) if (ids[i] === chunk) return g.s.d58d8[i] > 0x7f;
  return false;
}

/**
 * Read one 16x16 chunk into quadrant `quad` (OUTSUBS_0098). `offset` is
 * the chunk's world position as (y & 0xf0) << 8 | (x & 0xf0) << 4, as the
 * original packed it. Unstored Britannia chunks are open water.
 */
function loadChunk(g: Game, underworld: boolean, quad: number, offset: number): void {
  const dest = g.map.subarray(quad * 256, quad * 256 + 256);
  offset &= 0xffff;
  if (!underworld) {
    const stored = g.data.bytes(0x3876 + ((offset >> 8) & 0xff), 1)[0];
    if (stored === 0xff) {
      dest.fill(1);
      return;
    }
    dest.set(g.data.files.get('BRIT.DAT').subarray(stored * 256, stored * 256 + 256));
  } else {
    dest.set(g.data.files.get('UNDER.DAT').subarray(offset, offset + 256));
  }
  const ox = (offset >> 4) & 0xf0;
  const oy = (offset >> 8) & 0xf0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const t = dest[y * 16 + x];
      if ((t === T.Cave || t === T.Mine || t === T.Dungeon) && dungeonSealed(g, offset)) setTileAt(g, x + ox, y + oy, T.DF);
      else if (t === T.Shrine && shrineRuined(g, offset)) setTileAt(g, x + ox, y + oy, T.Ruins);
    }
  }
}

/** OUTSUBS_01b4: load the chunks the move by (dx, dy) brings in; (0, ±1) at entry loads both rows. */
export function loadChunks(g: Game, dx: number, dy: number): void {
  const s = g.s;
  const base = s.chunkX * 0x10 + s.chunkY * 0x100;
  const right = s.chunkX === 0xf0 ? -0xf00 : 0x100;
  const under = s.level > 0x7f;
  if (dx === -1 || dy === -1) loadChunk(g, under, 0, base);
  if (dx === 1 || dy === -1) loadChunk(g, under, 1, base + right);
  if (dx === -1 || dy === 1) loadChunk(g, under, 2, base + 0x1000);
  if (dx === 1 || dy === 1) loadChunk(g, under, 3, base + right + 0x1000);
  findLighthouses(g);
}

/** Remember where a lighthouse (tile 0x1b) is in the map, for its beam. */
function findLighthouses(g: Game): void {
  const i = g.map.indexOf(T.Lighthouse);
  const l = g.lighthouse;
  if (i < 0) {
    l.x1 = l.y1 = -1;
    return;
  }
  l.x1 = i & 0xf;
  l.y1 = (i & 0xf0) >> 4;
  if (i & 0x100) l.x1 += 0x10;
  if (i & 0x200) l.y1 += 0x10;
}

/** OUTSUBS_02c8: slide the loaded chunks when the window moves by (dx, dy). */
export function shiftChunks(g: Game, dx: number, dy: number): void {
  const a = dx < 0 || dy < 0 ? 3 : 0;
  const b = dx < 0 || dy > 0 ? 2 : 1;
  const c = a + dy + dx * 2;
  const d = b + dy + dx * 2;
  g.map.copyWithin(a * 256, b * 256, b * 256 + 256);
  g.map.copyWithin(c * 256, d * 256, d * 256 + 256);
}

/** The chunk window for the party's position (MAINOUT_0000): the party sits in its middle half. */
export function centreChunks(g: Game): void {
  const s = g.s;
  s.chunkX = s.x & 0xf0;
  if ((s.x & 0xf) < 8) s.chunkX = (s.chunkX - 0x10) & 0xf0;
  s.chunkY = s.y & 0xf0;
  if ((s.y & 0xf) < 8) s.chunkY = (s.chunkY - 0x10) & 0xf0;
  loadChunks(g, 0, 1);
  loadChunks(g, 0, -1);
}

// --- Sight and light -----------------------------------------------------------

/** ULTIMA_6ff0: a viewport cell's distance from the centre, by the table D_6aa8. */
export function viewDistance(g: Game, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= 11 || y >= 11) return 0;
  if (x > 5) x = 10 - x;
  if (y > 5) y = 10 - y;
  return g.data.distance()[x + y * 6];
}

/** ULTIMA_5dfe: whether sight passes through a tile at this distance (doors and some walls only when next to them). */
function seeThrough(g: Game, tile: number, distance: number): boolean {
  if (tile === 0x4b || tile === 0x4a || tile === 0xba || tile === 0xbb || tile === 0x98) return distance === 1;
  return !g.data.opaque().includes(tile);
}

/**
 * ULTIMA_5a28: the breadth-first walk out from the viewport's centre.
 * With `mode` 'sight' it fills the viewport (D_ab02) with what is seen;
 * with 'light' it spreads a light source's glow into the light map
 * (D_ad14), using the viewport as its visited set.
 */
function walkSight(g: Game, light: number, y0: number, x0: number, mode: 'sight' | 'light', oy: number, ox: number, out: Uint8Array): void {
  if (light <= 0) return;
  const s = g.s;
  const view = g.view;
  const lit = g.combatMap;
  const queue: number[] = [];
  let read = 0;
  light++;
  queue.push(5, 5);
  out[oy * 0x20 + ox + 0xa5] = tileAt(g, x0 + s.chunkX + 5, y0 + s.chunkY + 5);
  let dir = 7;
  let ok = true;
  while (read < queue.length) {
    const py = queue[read++];
    const px = queue[read++];
    let y = py;
    let x = px;
    while (dir > -1) {
      switch (dir) {
        case 0:
        case 1:
        case 7:
          x--;
          break;
        case 4:
        case 5:
          x++;
          break;
        case 2:
        case 3:
          y--;
          break;
        case 6:
          y++;
          break;
      }
      if (x < 0 || x > 10 || y < 0 || y > 10) ok = false;
      const limit = mode === 'light' ? 0x20 : 0xb;
      if (oy + y < 0 || ox + x < 0 || oy + y >= limit || ox + x >= 0x20) {
        dir--;
        ok = true;
        continue;
      }
      const ptr = (oy + y) * 0x20 + ox + x;
      if (mode === 'light') {
        const vi = y * 32 + x;
        if (x >= 0 && x <= 10 && y >= 0 && y <= 10 && view[vi] !== 0 && oy + y <= 0x1f) view[vi] = 0;
        else ok = false;
      } else if (ok && out[ptr] !== 0xff) {
        ok = false;
      }
      if (ok) {
        let tile = tileAt(g, x0 + x + s.chunkX, y0 + y + s.chunkY);
        const dist = viewDistance(g, x, y);
        if (dist >= light) {
          if (mode === 'sight') {
            if (!seeThrough(g, tile, dist)) {
              const litParent = y0 + py < 0x20 && x0 + px < 0x20 && y0 + y >= 0 && x0 + px >= 0 ? lit[(y0 + py) * 0x20 + x0 + px] : 0;
              const litHere = y0 + y >= 0 && x0 + x >= 0 && y0 + y < 0x20 && x0 + x < 0x20 ? lit[(y0 + y) * 0x20 + x0 + x] : 0;
              if (out[py * 0x20 + px] === 0 || litParent === 0 || litHere === 0) tile = out[ptr] = 0xff;
              else out[ptr] = tile;
            } else if (y0 + y < 0 || x0 + x < 0 || x0 + x >= 0x20 || y0 + y >= 0x20) {
              out[ptr] = 0;
            } else {
              out[ptr] = lit[(y0 + y) * 0x20 + x0 + x] !== 0 ? tile : 0;
            }
          } else {
            tile = 0xff;
          }
        } else {
          out[ptr] = tile;
        }
        if (seeThrough(g, tile, dist)) queue.push(y, x);
      }
      dir--;
      ok = true;
    }
    dir = 7;
  }
}

/** ULTIMA_5d0a: rebuild the viewport around (x, y), relative to the chunk window. */
export function buildView(g: Game, light: number, x: number, y: number): void {
  for (let r = 0; r < 11; r++) g.view.fill(0xff, r * 32, r * 32 + 11);
  const x0 = x - 5;
  const y0 = y - 5;
  if (light > 0) {
    walkSight(g, light, y0, x0, 'sight', 0, 0, g.view);
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) if (g.view[r * 32 + c] === 0) g.view[r * 32 + c] = 0xff;
    }
  }
  if (light < 0) {
    // Everything, walls or no (the See All spell and potion).
    for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) g.view[r * 32 + c] = tileAt(g, x0 + c + g.s.chunkX, y0 + r + g.s.chunkY);
  }
}

/** ULTIMA_5e4a: the light map: every square lit by a light source in the 32x32 window. */
export function buildLightMap(g: Game): void {
  const s = g.s;
  const lit = g.combatMap;
  lit.fill(0xff);
  const sources = g.data.lightSources();
  const found: number[] = [];
  for (let y = 0; y < 0x20; y++) {
    for (let x = 0; x < 0x20; x++) {
      const t = tileAt(g, s.chunkX + x, s.chunkY + y);
      if (sources.includes(t)) {
        found.push(y, x);
        lit[y * 32 + x] = t;
      }
    }
  }
  for (let i = 0; i < found.length; i += 2) {
    const y = found[i] - 5;
    const x = found[i + 1] - 5;
    for (let r = 0; r < 11; r++) g.view.fill(0xff, r * 32, r * 32 + 11);
    walkSight(g, 10, y, x, 'light', y, x, lit);
  }
  for (let i = 0; i < 0x400; i++) if (lit[i] === 0xff) lit[i] = 0;
}

// --- Actors over the map --------------------------------------------------------

/** ULTIMA_51a0: which way a sitting or sleeping figure faces (none while time stands still). */
function facing(g: Game): number {
  return g.s.icon === 0x54 /* 'T' */ ? 0 : g.random(0, 3);
}

/**
 * ULTIMA_51b8: put an actor's tile in viewport cell (vx, vy), for the
 * actor at map square (mx, my). People on furniture change to sitting,
 * sleeping, climbing and mirror-gazing figures.
 */
function placeActor(g: Game, vx: number, vy: number, mx: number, my: number, tile: number, party = false): void {
  if (tile === 0x1c || (tile >= 0x12 && tile < 0x16) || tile >= 0x40 || (tile >= 0x28 && tile < 0x2c)) {
    const under = tileAt(g, mx, my);
    // Deep forest hides what stands in it. The DOS game hid the party there too; the port keeps it in sight.
    if ((under === T.EC || under === T.A) && !party) return;
    if (under === T.T57) {
      setView(g, vx, vy, T.T38);
      return;
    }
    if (under === T.T6A || under === T.T6B) {
      if ((tile & 0xf0) === 0x80) return;
      if ((tile & 0xfc) === 0x28) return;
    } else if (tile < 0x80) {
      switch (under) {
        case T.T84:
          tile = facing(g) + 0x60;
          break;
        case T.T85:
          tile = facing(g) + 0x64;
          break;
        case T.LadderUp:
          tile = 0x17;
          break;
        case T.LadderDown:
          tile = 0x18;
          break;
        case T.Bed:
          tile = 0x1a;
          break;
        case T.Mirror:
        case T.Mirror9E:
          tile = facing(g) + 0x3c;
          break;
        case T.Chair92: {
          const below = tileAt(g, mx, my + 1);
          tile = below === T.Table9A || below === T.Table9C ? facing(g) + 0x34 : 0x32;
          break;
        }
        case T.Chair90: {
          const above = tileAt(g, mx, my - 1);
          tile = above === T.Table9B || above === T.Table9C ? facing(g) + 0x38 : 0x30;
          break;
        }
        case T.Chair91:
        case T.Chair93:
          tile = (under & 3) + 0x30;
          break;
        default:
          if (tileAt(g, mx, my - 1) === T.Mirror && vy !== 0) setView(g, vx, vy - 1, T.Mirror9E);
          break;
      }
    }
  }
  putActor(g, vx, vy, tile & 0xff);
}

/** An actor takes a view square: its tile noted, the terrain kept as its ground. */
function putActor(g: Game, vx: number, vy: number, tile: number): void {
  const v = viewAt(g, vx, vy);
  if (v !== 0) g.groundMap[vy * 16 + vx] = v;
  g.actorMap[vy * 16 + vx] = tile;
  setView(g, vx, vy, 0);
}

/**
 * A fight's drawing layer for what an actor shows (overlayActors): a slain foe's corpse and the fields 0, loot 1, a
 * fallen member's body 2, anyone standing 3.
 */
function fieldLayer(tile: number): number {
  if ((tile & 0xfc) === 0xe8 || tile === 0x1f) return 0;
  if (tile >= 0x01 && tile <= 0x0f) return 1;
  return tile === 0x1e ? 2 : 3;
}

/** ULTIMA_5394: the party and every actor in view, over the viewport. */
export function overlayActors(g: Game): void {
  const s = g.s;
  if (s.mapId < 0x80) {
    const a0 = s.actors[0];
    a0.x = s.x;
    a0.y = s.y;
    a0.z = s.level;
    a0.tile = a0.anim = s.partyTile;
    // A moongate shows as risen (0xdd) near the party and lowered (0x1c) further out.
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const v = viewAt(g, x, y);
        if (v === T.DD && viewDistance(g, x, y) > 5) setView(g, x, y, T.T1C);
        else if (v === T.T1C && viewDistance(g, x, y) <= 5) setView(g, x, y, T.DD);
      }
    }
  }
  // In a fight, what lies on one square is drawn in layers (the port's; 1988 drew by actor, a body only where nothing
  // else was): a slain foe's corpse and the fields beneath, then loot over them, then a fallen member's body over that
  // - to be seen, whatever it fell on - and whoever stands there over all.
  const order = [...Array(32).keys()].reverse();
  const combat = s.mapId >= 0x80;
  if (combat) order.sort((a, b) => fieldLayer(s.actors[a].tile) - fieldLayer(s.actors[b].tile));
  for (const i of order) {
    const a = s.actors[i];
    if (a.tile === 0) continue;
    let vx = a.x;
    let vy = a.y;
    if (s.mapId < 0x80) {
      vx = (vx - (s.x - 5)) & 0xff;
      vy = (vy - (s.y - 5)) & 0xff;
      if (a.z !== s.level || vx > 10 || vy > 10) continue;
    }
    const v = viewAt(g, vx, vy);
    // The Standard look shows the party wherever it stands, the Underworld's dark (0xff, which is also the view's
    // "unseen") too: the Amulet worn, the party walks it, and was not drawn - in 1988 as here in the EGA look.
    const party = i === 0 && s.mapId < 0x80 && g.options.tileSet === 'standard';
    if (a.anim === 0 || (v === 0xff && !party) || v === T.T87) continue;
    if ((a.tile & 0xfc) === 0xe8 || a.tile === 0x1e || a.tile === 0x1f) {
      if (v !== 0 || (combat && a.tile === 0x1e)) putActor(g, vx, vy, a.anim);
    } else if (a.anim === 0x1d || a.anim === 0x1e) {
      putActor(g, vx, vy, a.anim);
    } else if (a.tile === 0x5c) {
      if (v === T.Chair92) {
        putActor(g, vx, vy, a.anim);
      } else {
        placeActor(g, vx, vy, a.x, a.y, a.anim - 8);
      }
    } else {
      placeActor(g, vx, vy, a.x, a.y, a.anim, i === 0 && s.mapId < 0x80);
    }
  }
}

/**
 * What can lie under a thing that stands (the port's, for the Standard look): the ground outdoors, the floors
 * indoors. A chair, a brazier or a lamp post is a map square of its own, and its EGA tile has its floor drawn in;
 * the Standard one is drawn on a clear ground, and is given the floor of the squares round it.
 */
const GROUNDS = new Set([
  0x04, 0x05, 0x06, 0x07, 0x08, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x30, 0x31, 0x32, 0x33, 0x40, 0x43, 0x44, 0x45, 0x48, 0x49,
]);
/** Brush and scrub have their bushes drawn in: under a thing that stands, they are the grass they grow in. */
const BARE: Record<number, number> = { 0x06: 0x05, 0x08: 0x05 };

/** The mouths in the mountains - a cave, a mine, a dungeon: they stand in the mountainside, whatever is before them. */
const MOUTHS = new Set([0x16, 0x17, 0x18, 0x38]);
const MOUNTAINS = 0x0c;

/** The ground under view square (x, y), a thing `t` standing on it: the mountains under a mouth, else groundAround. */
export function groundUnder(g: Game, x: number, y: number, t: number): number {
  return MOUTHS.has(t) ? MOUNTAINS : groundAround(g, x, y);
}

/** Whether tile `t` is a ground (a floor, the grass) rather than a thing that stands on one. */
export const isGround = (t: number): boolean => GROUNDS.has(t);

/**
 * The ground under a thing `t` on any grid of squares (`at(dx, dy)` the square that far from it, undefined off the
 * grid): the mountains under a mouth, else the ground most of the squares round it show, those beside it counting
 * twice those at its corners, or `otherwise` if none does. The towne's view and the title's little scenes both use it.
 */
export function groundAmong(t: number, at: (dx: number, dy: number) => number | undefined, otherwise: number): number {
  if (MOUTHS.has(t)) return MOUNTAINS;
  const votes = new Map<number, number>();
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const v = dx || dy ? at(dx, dy) : undefined;
      if (v === undefined || !GROUNDS.has(v)) continue;
      const bare = BARE[v] ?? v;
      votes.set(bare, (votes.get(bare) ?? 0) + (dx && dy ? 1 : 2));
    }
  }
  let best = otherwise;
  let most = 0;
  for (const [v, n] of votes) {
    if (n > most) {
      best = v;
      most = n;
    }
  }
  return best;
}

/** The ground most of the squares round view square (x, y) show (those beside it counting twice those at its corners). */
export function groundAround(g: Game, x: number, y: number): number {
  return groundAmong(
    -1,
    (dx, dy) => {
      if (x + dx < 0 || x + dx > 10 || y + dy < 0 || y + dy > 10) return undefined;
      const v = viewAt(g, x + dx, y + dy);
      return v !== 0 ? v : g.groundMap[(y + dy) * 16 + x + dx];
    },
    g.inTown ? 0x44 : T.Grass,
  );
}

/**
 * Where view square (x, y) is, with the squares round it, for tile art that draws what lies between squares (the
 * shores, the woods): on Britannia or in the Underworld, in a settlement, or on the combat map. A square beyond a
 * settlement's or the arena's edge counts as the nearest square inside it. Undefined in a dungeon's passages.
 */
export function placeOf(g: Game, x: number, y: number): Place | undefined {
  const s = g.s;
  const around = new Uint8Array(25);
  if (s.mapId === 0) {
    const wx = (s.x - 5 + x) & 0xff;
    const wy = (s.y - 5 + y) & 0xff;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) around[(dy + 2) * 5 + dx + 2] = tileAt(g, wx + dx, wy + dy);
    return { map: s.level > 0x7f ? 1 : 0, x: wx, y: wy, around };
  }
  // A settlement's level (32 squares a side) round the party, or the combat map (11) as the view shows it.
  const [size, ox, oy, map] = g.inTown
    ? [32, s.x - 5, s.y - 5, 0x100 + s.mapId * 16 + (s.level & 0xf)]
    : g.inCombat
      ? [11, 0, 0, 2]
      : [0, 0, 0, 0];
  if (!size) return undefined;
  const clamp = (v: number): number => Math.max(0, Math.min(size - 1, v));
  const mx = ox + x;
  const my = oy + y;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) around[(dy + 2) * 5 + dx + 2] = tileAt(g, clamp(mx + dx), clamp(my + dy));
  return { map, x: mx, y: my, around };
}

/** A member's tint on the map, as their name's colour in the Standard look: green poisoned, lavender asleep. */
const FIGURE_TINT: Record<number, number> = { [Status.Poisoned]: 0x40ff40, [Status.Sleeping]: 0xb8a0ff };

/**
 * Where each of the party on foot is in their walk (the Standard look's, the port's): a frame of their figure's four,
 * moved on about every other tick as the actors' are (animateActors), each on their own - by a generator of its own,
 * not the game's dice, which the actors and the fights share. And after them the dungeon creature's, on its map.
 */
const partyFrames = [0, 0, 0, 0, 0, 0, 0];

/** The dungeon creature's frame of its figure's four, on the Standard look's map (dungeonMap.ts): its own walk. */
export const creatureFrame = (): number => partyFrames[6];
let partySeed = 0x2545;

/** The party's walk moved on a tick (updateFrame, as the actors' is). */
export function animateParty(): void {
  for (let i = 0; i < partyFrames.length; i++) {
    partySeed = (Math.imul(partySeed, 1103515245) + 12345) >>> 0;
    if ((partySeed >>> 16) & 1) partyFrames[i] = (partyFrames[i] + 1) & 3;
  }
}

/**
 * The living members as they are drawn on the map, in marching order (the dead are left out): each class's figure as
 * a fight draws it - the Avatar's the walking Avatar - in the frame of their walk, in the tint of their state.
 */
export function partyFigures(g: Game): Figure[] {
  const s = g.s;
  const classTiles = g.data.bytes(0x1ade, 9);
  const out: Figure[] = [];
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead) continue;
    const cls = CLASSES.indexOf(String.fromCharCode(p.cls));
    const tile = (classTiles[Math.max(0, cls)] & 0xfc) + partyFrames[out.length % partyFrames.length];
    out.push({ tile: 0x100 + tile, tint: FIGURE_TINT[p.status] ?? 0, dress: dressingOf(g, m) });
  }
  return out;
}

/**
 * The Standard look's party on foot: on Britannia and in the Underworld, its leader alone (the first living member,
 * walking) - or, with PARTY_GRID, its first four living members in a grid of two by two on the party's square (the
 * ultima3 port's); in a settlement, the first living member there and the others after it in a line, on the squares
 * it came through (g.trail). Where a square of the line is out of sight,
 * or someone else stands on it, that member is not drawn. The EGA look keeps the one figure.
 */
function partyOnFoot(g: Game): 'grid' | 'line' | 'one' | null {
  const s = g.s;
  if (g.options.tileSet !== 'standard' || s.partyTile !== A.Avatar) return null;
  // Out in the world the party is one figure, its leader (the first member alive), walking; or, with PARTY_GRID, the
  // first four in a grid of two by two (the ultima3 port's). The Apple ][ tiles show the Avatar, as the Apple did.
  if (s.mapId === 0) return g.options.tiles === 'apple2' || g.options.tiles === 'pc-ega' ? null : PARTY_GRID ? 'grid' : 'one';
  if (g.inTown) return 'line';
  return null;
}

/** Whether the party out in the world is drawn as its first four members in a grid of two by two, or its leader alone. */
const PARTY_GRID = false;

/** ULTIMA_56ac_DrawMap: draw the viewport. */
export function drawView(g: Game): void {
  const d = g.draw;
  const s = g.s;
  const style = partyOnFoot(g);
  const figures = style ? partyFigures(g) : [];
  // Where the party's leader stands (out of a fight: the view's middle square), so the mirror he stands before gives
  // back the Avatar as the player made it, and one anyone else stands before the original's reflection.
  const lead = s.mapId < 0x80 ? placeOf(g, 5, 5) : undefined;
  d.leader?.(lead ? { map: lead.map, x: lead.x, y: lead.y } : null);
  // The squares the followers stand on, in the view: each the next living member after the leader.
  const followers = new Map<number, Figure>();
  if (style === 'line')
    g.trail.forEach((at, i) => {
      const f = figures[i + 1];
      if (!f || at.z !== s.level) return;
      const vx = at.x - s.x + 5;
      const vy = at.y - s.y + 5;
      if (vx < 0 || vx > 10 || vy < 0 || vy > 10 || (vx === 5 && vy === 5)) return;
      if (Math.abs(vx - 5) > 5 || Math.abs(vy - 5) > 5) return;
      const v = viewAt(g, vx, vy);
      if (v === 0 || v === 0xff) return; // someone stands there, or it is out of sight
      if (!followers.has(vy * 16 + vx)) followers.set(vy * 16 + vx, f);
    });
  // The squares where a companion stands (companions.ts): their figure drawn in their colours.
  const companions = new Map<number, Dressing>();
  if (d.dressAs)
    s.actors.forEach((a, i) => {
      const dress = a.tile === 0 ? null : dressingOfActor(g, i);
      if (!dress) return;
      const [vx, vy] = s.mapId < 0x80 ? [(a.x - (s.x - 5)) & 0xff, (a.y - (s.y - 5)) & 0xff] : [a.x, a.y];
      if (vx <= 10 && vy <= 10) companions.set(vy * 16 + vx, dress);
    });
  /** A figure drawn as `dress`, a companion, where one is given. */
  const drawn = (dress: Dressing | null | undefined, draw: () => void): void => {
    if (!dress) return draw();
    d.dressAs?.(dress);
    draw();
    d.dressAs?.(null);
  };
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const v = viewAt(g, x, y);
      const place = placeOf(g, x, y);
      if (v === 0) {
        const a = actorAt(g, x, y);
        const ground = g.cycles.shown[g.groundMap[y * 16 + x]];
        // The party's own square, the party as it is drawn (not sitting, lying or on a ladder: those keep their pose).
        const party = style !== null && x === 5 && y === 5 && a === (s.partyTile & 0xff) && figures.length > 0;
        const under = g.groundMap[y * 16 + x];
        const floor = GROUNDS.has(under) ? undefined : g.cycles.shown[groundUnder(g, x, y, under)];
        if (party && style === 'grid' && d.party) d.party(0x100 + a, x, y, figures, ground, floor, place);
        else if (party && (style === 'line' || style === 'one'))
          drawn(figures[0].dress, () => d.tile(figures[0].tile, x, y, ground, place, figures[0].tint, floor));
        else if (a !== 0x16) drawn(companions.get(y * 16 + x), () => d.tile(0x100 + a, x, y, ground, place, 0, floor));
      } else if (v === T.Moongate && g.s.moongateHeight !== 0 && g.s.moongateHeight < 0x10) {
        d.moongate(g.s.moongateHeight, g.s.mapId === 0xff ? 'brick' : 'grass', x, y);
      } else {
        // A thing that stands is given the floor round it, for a tile set that draws it on a clear ground.
        const ground = GROUNDS.has(v) ? undefined : g.cycles.shown[groundUnder(g, x, y, v)];
        const follower = followers.get(y * 16 + x);
        // A follower stands on the square's own thing (a stool, a barrel) on its floor, as the leader does.
        if (follower) drawn(follower.dress, () => d.tile(follower.tile, x, y, g.cycles.shown[v], place, follower.tint, ground));
        else d.tile(g.cycles.shown[v], x, y, ground, place);
      }
    }
  }
  drawReadings(g);
  g.drawCombatMarks?.();
}

/**
 * A chest's badge (the port's): what its search said, in its top-right corner - a trap (a red "!"), none (a green
 * tick), or disarmed (a blue tick) - the party's reading, right or wrong, which the next bump goes by (bumpAct.ts).
 * Shape and colour both tell them apart. Drawn in the EGA's pixels, so both looks have it.
 */
const BADGES: Partial<Record<Bumped, { fill: number; glyph: string[] }>> = {
  trap: { fill: Colour.red, glyph: ['  #  ', '  #  ', '  #  ', '     ', '  #  '] },
  clean: { fill: Colour.green, glyph: ['    #', '   # ', '# #  ', ' #   ', '     '] },
  disarmed: { fill: Colour.blue, glyph: ['    #', '   # ', '# #  ', ' #   ', '     '] },
};

/** The badges of the chests in view that have been searched (Game.bumped). */
export function drawReadings(g: Game): void {
  if (g.bumped.size === 0 || g.inDungeon) return;
  const s = g.s;
  const d = g.draw;
  for (let i = 1; i < 0x20; i++) {
    const a = s.actors[i];
    if (a.tile !== 1) continue;
    let vx = a.x;
    let vy = a.y;
    if (s.mapId < 0x80) {
      vx = (vx - (s.x - 5)) & 0xff;
      vy = (vy - (s.y - 5)) & 0xff;
      if (a.z !== s.level) continue;
    }
    if (vx > 10 || vy > 10 || viewAt(g, vx, vy) !== 0 || actorAt(g, vx, vy) !== 1) continue; // out of sight
    const badge = BADGES[g.bumped.get(thingKey(g, a.x, a.y)) ?? 'done'];
    if (!badge) continue;
    // A 7x7 plaque, its corners cut, in the square's top-right: a dark rim, the colour, the glyph in white.
    const left = vx * 16 + 8 + 9;
    const top = vy * 16 + 8;
    d.pen = Colour.black;
    d.fill(left + 1, top, left + 5, top + 6);
    d.fill(left, top + 1, left + 6, top + 5);
    d.pen = badge.fill;
    d.fill(left + 1, top + 1, left + 5, top + 5);
    d.pen = Colour.brightWhite;
    badge.glyph.forEach((row, y) => [...row].forEach((c, x) => c === '#' && d.plot(left + 1 + x, top + 1 + y)));
  }
}
