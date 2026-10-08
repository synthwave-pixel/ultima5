/**
 * dungeonMap.ts
 *
 * The graph paper of old, drawn over the first-person view: the level's
 * eight by eight grid of cells, as much of it as the party has walked
 * (fog.ts), each cell with the mark of what it is. 'small' puts it in
 * the corner of the view; 'full' gives it the whole view, which turns
 * the dungeon into a map to read rather than a corridor to peer down.
 * Neither shows a cell the party has not seen (the port's, from the
 * ultima3 port's auto-map).
 *
 * The Standard look draws the cells in its own tiles, a pixel to a pixel -
 * cobbles, the wall in the dungeon's light, the ladders, the fountain, a
 * chest, a door - and the party as its leader (the Avatar as the player
 * made it), a pointer on the side it faces; and its small map, five cells
 * a side round the party, sits
 * under the party panel over the top of the log (text.ts cover), the log
 * going on beneath it unseen until the map is lifted.
 */

import { Colour, DUNGEON_TINTS } from '../ui/colours.ts';
import { creatureSeen, feltCells, inTheDark } from './fog.ts';
import { creatureFrame, partyFigures } from './world.ts';
import { compactPanel, Win } from './frame.ts';
import type { Game } from './game.ts';
import { A, T } from './tiles.ts';

/** The map's square on the screen, in EGA pixels a side from (8, 8): the Standard look's dungeon view, grown to it. */
const SQUARE = 0xb0;

/** The dungeon view's rectangle on the screen (DUNGEON_1a90 fills it). */
const VIEW = { x1: 0x10, y1: 0x0e, x2: 0xaf, y2: 0xb2 };
const CELLS = 8;

/**
 * The log's cells the Standard look's small map (or small view) lies over: under the party panel's band, nine rows of
 * the log's fifteen, the rest of it going on below.
 */
const LOG_COVER = { c1: 0x18, r1: 9, c2: 0x27, r2: 17 };

/** Where in them, in EGA pixels: a square centred in the right-hand column, a frame's room round it. */
const SLOT = { x: 0xc0 + (128 - 64) / 2, y: 75, size: 64 };

/**
 * The small map's cells a side, the party in the middle one; each cell as many pixels as fit (twelve: its tiles drawn
 * at three quarters of their size), the map centred in the square.
 */
const AROUND = 5;
const SMALL_CELL = Math.floor(SLOT.size / AROUND);
const SMALL_AT = (SLOT.size - SMALL_CELL * AROUND) >> 1;

/**
 * The Standard look's cells drawn in its own tiles, laid edge to edge as a town's are - a pixel of a tile to a pixel
 * of the map (the cells are sixteen pixels, as the tiles are): the rock the wall in the dungeon's light, a passage
 * cobbles, and what stands in it over them, as the tiles have it.
 */
const COBBLES = T.T44;
const BONES = 0xcf;
const COLLAPSED = T.DF;
const STANDS: Partial<Record<Kind, number[]>> = {
  up: [T.LadderUp],
  down: [T.LadderDown],
  updown: [T.LadderDown, T.LadderUp], // the up ladder over the down
  chest: [0x100 + A.Chest],
  treasure: [0x100 + A.Gold],
  door: [T.DoorB8],
  roomDoor: [T.DoorB8],
};

/** What a cell is, by the high nibble the original keeps it in: what the party knows of it, a hidden thing as it looks. */
export type Kind =
  | 'rock'
  | 'floor'
  | 'up'
  | 'down'
  | 'updown'
  | 'fountain'
  | 'pit'
  | 'chest'
  | 'treasure'
  | 'field'
  | 'door'
  | 'roomDoor'
  | 'rubble';

export function kindOf(cell: number): Kind {
  switch (cell & 0xf0) {
    case 0x00:
    case 0x90: // "nothing of note"
      return 'floor';
    case 0x10:
      return 'up';
    case 0x20:
      return 'down';
    case 0x30:
      return 'updown';
    case 0x40: // a closed chest (its trap in the low bits)
      return 'chest';
    case 0x50:
      return 'fountain';
    case 0x60: // a pit; a pit trap or a bomb not yet found looks like the passage it lies in
      return (cell & 7) === 0 ? 'pit' : 'floor';
    case 0x70: // an opened chest, its treasure to be got
      return 'treasure';
    case 0x80: // sleep, poison, fire and energy fields
      return 'field';
    case 0xe0:
      return 'door';
    case 0xa0: // a room's heavy door: cleared (0xa_) or its fight still behind it (0xf_)
    case 0xf0:
      return 'roomDoor';
    case 0xc0: // a stalactite, a caved in passage or a skeleton: in the way
      return 'rubble';
    default:
      return 'rock'; // a wall, and a door still hidden in one
  }
}

/** Whether the party can go through a cell of this kind (the map's cells are linked where it can). */
const passable = (kind: Kind): boolean => kind !== 'rock' && kind !== 'rubble';

/** A field's colour, by its kind (the low bits): as the view's crackle has it (dungeon.ts field). */
const FIELD_COLOURS = [Colour.magenta, Colour.green, Colour.red, Colour.blue];

/** A cell in the Standard look's tiles (STANDS); false where the look draws no tiles, and nothing is drawn. */
function tiled(g: Game, kind: Kind, px: number, py: number, n: number, field: number): boolean {
  const d = g.draw;
  const dungeon = g.s.mapId - 0x20;
  const light = DUNGEON_TINTS[dungeon >= 1 && dungeon <= 8 ? dungeon : 0];
  const tile = (t: number, tint?: number): boolean => !!d.icon?.(t, px, py, n, false, tint);
  if (kind === 'rock' || kind === 'rubble') {
    // The rock: the wall in the dungeon's light.
    if (!tile(T.Wall, light)) return false;
    // Rubble: remains or a caved in passage over it, as the dungeon has them (Save.dungeonLook); a stalactite, the
    // rock alone.
    const look = g.s.dungeonLook & 0xf;
    if (kind === 'rubble' && look !== 1) tile(look === 2 ? COLLAPSED : BONES);
    return true;
  }
  // The passage: cobbles, and what stands in it over them.
  if (!tile(COBBLES)) return false;
  const r = Math.max(1, Math.round(n / 5));
  const [cx, cy] = [px + Math.round(n / 2), py + Math.round(n / 2)];
  if (kind === 'fountain') tile(g.cycles.shown[T.Fountain]);
  else if (kind === 'pit') {
    // A pit: the original's black box.
    d.pen = Colour.black;
    d.fill(cx - r, cy - r, cx + r - 1, cy + r - 1);
  } else if (kind === 'field') {
    d.pen = FIELD_COLOURS[field & 3] + 8;
    d.fill(cx - r, cy - r, cx + r - 1, cy + r - 1);
  } else for (const t of STANDS[kind] ?? []) tile(t);
  return true;
}

/** Draw one cell at (px, py), `n` pixels a side, with arms to the cells it opens onto. */
function cell(g: Game, kind: Kind, px: number, py: number, n: number, links: number, field = 0): void {
  const d = g.draw;
  if (tiled(g, kind, px, py, n, field)) return;
  if (kind === 'rock' || kind === 'rubble') {
    // The rock: dark grey.
    d.pen = Colour.darkGray;
    d.fill(px + 1, py + 1, px + n - 2, py + n - 2);
    if (kind === 'rock') return;
    // Rubble in the way: the rock's block, strewn with stones.
    const [cx, cy, r] = [px + Math.round(n / 2), py + Math.round(n / 2), Math.max(1, Math.round(n / 5))];
    d.pen = Colour.lightGray;
    d.plot(cx - r, cy);
    d.plot(cx, cy - r);
    d.plot(cx + r, cy + 1);
    return;
  }
  const inset = Math.max(1, Math.round(n / 8));
  // The arms to the cells it opens onto: an even width on an even cell, so they sit on its middle, as much of the
  // passage to either side of them.
  const arm = Math.max(2, Math.round(n / 6) * 2);
  const a0 = (n - arm) >> 1;
  const a1 = a0 + arm - 1;
  const mid = Math.round(n / 2);
  d.pen = Colour.lightGray;
  d.fill(px + inset, py + inset, px + n - 1 - inset, py + n - 1 - inset);
  if (links & 1) d.fill(px + a0, py, px + a1, py + inset);
  if (links & 2) d.fill(px + n - 1 - inset, py + a0, px + n - 1, py + a1);
  if (links & 4) d.fill(px + a0, py + n - 1 - inset, px + a1, py + n - 1);
  if (links & 8) d.fill(px, py + a0, px + inset, py + a1);
  const cx = px + mid;
  const cy = py + mid;
  const r = Math.max(1, Math.round(n / 5));
  switch (kind) {
    case 'up':
    case 'down':
    case 'updown':
      d.pen = Colour.brightYellow;
      for (let i = 0; i <= r; i++) {
        const w = kind === 'down' ? r - i : i;
        d.line(cx - w, cy - r + i, cx + w, cy - r + i);
        if (kind === 'updown') d.line(cx - (r - i), cy + i, cx + (r - i), cy + i);
      }
      break;
    case 'fountain':
      d.pen = Colour.brightBlue;
      d.fill(cx - r, cy - r, cx + r, cy + r);
      break;
    case 'treasure':
      d.pen = Colour.brightYellow;
      d.fill(cx - r, cy - (r >> 1), cx + r, cy + (r >> 1));
      break;
    case 'pit':
      d.pen = Colour.black;
      d.fill(cx - r, cy - r, cx + r, cy + r);
      break;
    case 'chest':
      d.pen = 6; // brown
      d.fill(cx - r, cy - (r >> 1), cx + r, cy + (r >> 1));
      break;
    case 'roomDoor':
      // A room's door: a door in a room's outline.
      d.pen = Colour.brightWhite;
      d.line(cx - r, cy - r, cx + r, cy - r);
      d.line(cx - r, cy + r, cx + r, cy + r);
      d.line(cx - r, cy - r, cx - r, cy + r);
      d.line(cx + r, cy - r, cx + r, cy + r);
      d.pen = Colour.red;
      d.fill(cx - (r >> 1), cy - r + 1, cx + (r >> 1), cy + r - 1);
      break;
    case 'door':
      d.pen = Colour.red;
      d.fill(cx - (r >> 1) - 1, cy - r, cx + (r >> 1) + 1, cy + r);
      break;
    case 'field':
      d.pen = FIELD_COLOURS[field & 3] + 8;
      d.fill(cx - r, cy - r, cx + r, cy + r);
      break;
    case 'floor':
      break;
  }
}

/** The Standard tile of each dungeon creature (MON0-7.16), for looks that draw it as its figure: the view, the map. */
export const DUNGEON_CREATURES = [0x190, 0x194, 0x198, 0x19c, 0x1a0, 0x1a4, 0x1b0, 0x1ac];

/**
 * The level's creature (actor 1) on its cell at (px, py), `n` pixels a side: in the Standard look its figure, walking;
 * in the EGA look a red mark.
 */
function creature(g: Game, px: number, py: number, n: number): void {
  const d = g.draw;
  if (d.icon?.(DUNGEON_CREATURES[g.s.actors[1].tile & 7] + creatureFrame(), px, py, n)) return;
  const r = Math.max(1, Math.round(n / 5));
  const [cx, cy] = [px + Math.round(n / 2), py + Math.round(n / 2)];
  d.pen = Colour.brightRed;
  d.fill(cx - r, cy - r, cx + r - 1, cy + r - 1);
}

/** The party, and which way it faces. */
function party(g: Game, px: number, py: number, n: number): void {
  const d = g.draw;
  const cx = px + Math.round(n / 2);
  const cy = py + Math.round(n / 2);
  const r = Math.max(1, Math.round(n / 7));
  const [dx, dy] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][g.s.facing & 3];
  // The Standard look: the party's leader, as the map above ground draws it (world.ts partyFigures: the Avatar as the
  // player made it, walking, or the first of the party still living), its tile laid on the cell a pixel to a pixel;
  // and a pointer out past the cell's edge on the side the party faces, in the way it would go.
  const lay = (): boolean => {
    const leader = partyFigures(g)[0];
    return g.options.tileSet === 'standard' && !!leader && !!d.icon?.(leader.tile, px, py, n);
  };
  if (lay()) {
    // A triangle a row at a time, its base just past the cell's edge and its point outward, two pixels wide at the point
    // so that it sits on the cell's middle (an even cell has no middle pixel): white, as the figure is, outlined in
    // black all round so it shows on a passage as well as in the dark - its base's outline on the cell's own edge, so
    // that a single black pixel lies between it and the figure.
    const h = 2;
    const gap = 0;
    const [c0, c1] = [(n >> 1) - 1, n >> 1];
    const row = (k: number, w: number): void => {
      if (w < 0) return;
      if (dx === 0) {
        const y = dy < 0 ? py - 1 - gap - k : py + n + gap + k;
        d.line(px + c0 - w, y, px + c1 + w, y);
      } else {
        const x = dx < 0 ? px - 1 - gap - k : px + n + gap + k;
        d.line(x, py + c0 - w, x, py + c1 + w);
      }
    };
    d.pen = Colour.black;
    for (let k = -1; k <= h + 1; k++) row(k, k < 0 ? h + 1 : h - k + 1);
    d.pen = Colour.brightWhite;
    for (let k = 0; k <= h; k++) row(k, h - k);
    return;
  }
  d.pen = Colour.brightWhite;
  d.fill(cx - r, cy - r, cx + r, cy + r);
  d.pen = Colour.brightRed;
  const reach = r + Math.max(2, Math.round(n / 5));
  d.line(cx, cy, cx + dx * reach, cy + dy * reach);
}

/**
 * Whether the dungeon is walked, and pointed in, by the compass (the Standard look's whole-level map up): the d-pad's
 * Up is north rather than ahead (dungeon.ts compassStep, lookDirection).
 */
export function byCompass(g: Game): boolean {
  return g.options.tileSet === 'standard' && g.options.dungeonView === 'full';
}

/** The Standard look's small map taken off the log: the log's rows under it drawn again as they now read. */
export function liftDungeonMap(g: Game): void {
  if (!g.mapOverLog) return;
  g.mapOverLog = false;
  g.text.uncover();
}

/**
 * A grid of the level's cells, `span` a side centred on (cx, cy) - the level wraps; the whole level's is centred on
 * (4, 4), so that it starts at its first cell - each `n` pixels, at (x0, y0), in a frame of its own (it is set in
 * something: the log, the EGA look's view).
 */
function grid(g: Game, seen: Uint8Array, x0: number, y0: number, n: number, span: number, cx: number, cy: number): void {
  const s = g.s;
  const d = g.draw;
  const w = n * span;
  d.pen = Colour.black;
  d.fill(x0 - 2, y0 - 2, x0 + w + 1, y0 + w + 1);
  d.pen = Colour.lightGray;
  d.line(x0 - 2, y0 - 2, x0 + w + 1, y0 - 2);
  d.line(x0 - 2, y0 + w + 1, x0 + w + 1, y0 + w + 1);
  d.line(x0 - 2, y0 - 2, x0 - 2, y0 + w + 1);
  d.line(x0 + w + 1, y0 - 2, x0 + w + 1, y0 + w + 1);
  const at = (x: number, y: number): number => s.dungeon[s.level * 0x40 + (y & 7) * 8 + (x & 7)];
  const open = (x: number, y: number): boolean => seen[(y & 7) * CELLS + (x & 7)] !== 0 && passable(kindOf(at(x, y)));
  const first = -(span >> 1);
  for (let j = 0; j < span; j++) {
    for (let i = 0; i < span; i++) {
      const x = (cx + first + i) & 7;
      const y = (cy + first + j) & 7;
      if (!seen[y * CELLS + x]) continue;
      let links = 0;
      if (open(x, y - 1)) links |= 1;
      if (open(x + 1, y)) links |= 2;
      if (open(x, y + 1)) links |= 4;
      if (open(x - 1, y)) links |= 8;
      cell(g, kindOf(at(x, y)), x0 + i * n, y0 + j * n, n, links, at(x, y));
    }
  }
  // The creature, where the party sees it (fog.ts creatureSeen), and the party over all.
  const a = s.actors[1];
  if (creatureSeen(g)) {
    const [ax, ay] = [(a.x - cx - first + 8) & 7, (a.y - cy - first + 8) & 7];
    if (ax < span && ay < span) creature(g, x0 + ax * n, y0 + ay * n, n);
  }
  const px = ((s.x & 7) - cx - first + 8) & 7;
  const py = ((s.y & 7) - cy - first + 8) & 7;
  if (px < span && py < span) party(g, x0 + px * n, y0 + py * n, n);
}

/** The EGA look's maps of the whole level, each a grid of the level as it lies: over all the view, or in its corner. */
const EGA_WHOLE = {
  x: VIEW.x1 + Math.floor((VIEW.x2 - VIEW.x1 + 1 - 20 * CELLS) / 2),
  y: VIEW.y1 + Math.floor((VIEW.y2 - VIEW.y1 + 1 - 20 * CELLS) / 2),
  n: 20,
};
const EGA_CORNER = { x: VIEW.x2 - 8 * CELLS - 3, y: VIEW.y1 + 3, n: 8 };

/** The Standard look's whole-level map: eleven cells of sixteen pixels a side round the party, filling the map's square. */
const WHOLE = 16;
const ACROSS = 11;

/** The four steps between cells. */
const STEPS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A cell's place in the level's grid (y * 8 + x), wrapped. */
const at8 = (x: number, y: number): number => ((y & 7) << 3) | (x & 7);

/** Whether the level joins up through a cell: one the party can pass, and a hidden door, which once found it walks through. */
const joins = (cell: number): boolean => (cell & 0xf0) === 0xd0 || passable(kindOf(cell));

/**
 * Where the cells the party can reach lie from it, the level unrolled from where it stands: its passages walked out
 * step by step, each cell placed at its steps from the party (dx, dy), as far as they run - the passages as they are
 * rather than the eight by eight grid they are packed into, which wraps (most of the levels were laid out across their
 * own edges, and join up only as pieces). By each cell's place in the grid. Null where they loop round the level - a
 * cell met again at another place, so that they go on for ever (Shame's seventh level, Doom's fifth).
 */
export function unrolled(g: Game): Map<number, [number, number]> | null {
  const s = g.s;
  const cellAt = (dx: number, dy: number): number => s.dungeon[s.level * 0x40 + at8(s.x + dx, s.y + dy)];
  const placed = new Map<number, [number, number]>([[at8(s.x, s.y), [0, 0]]]);
  // Walked out from the party's own cell, which joins the passages round it (not through rock, which would join
  // pieces that do not meet).
  const queue: [number, number][] = joins(cellAt(0, 0)) ? [[0, 0]] : [];
  for (let q = queue.shift(); q; q = queue.shift()) {
    for (const [sx, sy] of STEPS) {
      const [dx, dy] = [q[0] + sx, q[1] + sy];
      if (!joins(cellAt(dx, dy))) continue;
      const was = placed.get(at8(s.x + dx, s.y + dy));
      if (was && (was[0] !== dx || was[1] !== dy)) return null;
      if (was) continue;
      placed.set(at8(s.x + dx, s.y + dy), [dx, dy]);
      queue.push([dx, dy]);
    }
  }
  return placed;
}

/**
 * The Standard look's whole-level map: the party in the middle and the level round it, eleven cells a side filling the
 * map's square, moving with the party. Where the party's passages unroll (unrolled) each cell is drawn where it lies
 * from the party and nowhere else - a passage where it was walked out to, the rock beside such a passage - so the map
 * is the passages as they run, never the grid's own wrapping; the level's other pieces (reached by other ladders) not
 * at all. Where they loop round the level, it goes on as it begins past its edges, as a gem's view of it has it
 * (dungeon.ts dungeonView), every cell wherever it comes round.
 */
function aroundParty(g: Game, seen: Uint8Array, x0: number, y0: number): void {
  const s = g.s;
  const r = ACROSS >> 1;
  const places = unrolled(g);
  const cellAt = (x: number, y: number): number => s.dungeon[s.level * 0x40 + at8(x, y)];
  const open = (x: number, y: number): boolean => seen[at8(x, y)] !== 0 && passable(kindOf(cellAt(x, y)));
  const placedAt = (i: number, j: number): boolean => {
    const p = places?.get(at8(s.x + i, s.y + j));
    return !!p && p[0] === i && p[1] === j;
  };
  const shownAt = (i: number, j: number): boolean => {
    if (!places || placedAt(i, j)) return true;
    // Rock beside a passage where it lies (a corner's too); a passage anywhere else is another place.
    if (joins(cellAt(s.x + i, s.y + j))) return false;
    for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) if (placedAt(i + ex, j + ey)) return true;
    return false;
  };
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const [x, y] = [(s.x + i) & 7, (s.y + j) & 7];
      if (!seen[at8(x, y)] || !shownAt(i, j)) continue;
      let links = 0;
      if (open(x, y - 1)) links |= 1;
      if (open(x + 1, y)) links |= 2;
      if (open(x, y + 1)) links |= 4;
      if (open(x - 1, y)) links |= 8;
      cell(g, kindOf(cellAt(x, y)), x0 + (i + r) * WHOLE, y0 + (j + r) * WHOLE, WHOLE, links, cellAt(x, y));
    }
  // The creature, where the party sees it (fog.ts creatureSeen): where its cell lies from the party.
  const a = s.actors[1];
  if (creatureSeen(g)) {
    const [i, j] = places?.get(at8(a.x, a.y)) ?? [((a.x - s.x + 4) & 7) - 4, ((a.y - s.y + 4) & 7) - 4];
    if (Math.abs(i) <= r && Math.abs(j) <= r) creature(g, x0 + (i + r) * WHOLE, y0 + (j + r) * WHOLE, WHOLE);
  }
  party(g, x0 + r * WHOLE, y0 + r * WHOLE, WHOLE);
}

/**
 * The Standard look's first-person view made small beside the whole-level map, in EGA pixels (x1, y1, x2, y2,
 * inclusive): its whole picture fitted to the square SLOT, centred in it.
 */
const SMALL_VIEW: [number, number, number, number] = (() => {
  const w = Math.round(((VIEW.x2 - VIEW.x1 + 1) * SLOT.size) / (VIEW.y2 - VIEW.y1 + 1));
  const x = SLOT.x + ((SLOT.size - w) >> 1);
  return [x, SLOT.y, x + w - 1, SLOT.y + SLOT.size - 1];
})();

/**
 * The first-person view as the whole-level map shows it small beside itself, with its frame (EGA pixels, inclusive),
 * where it is shown (the Standard look's map up, the party panel compact over the log); else null.
 */
export function smallView(g: Game): [number, number, number, number] | null {
  if (!byCompass(g) || !compactPanel(g)) return null;
  const [x1, y1, x2, y2] = SMALL_VIEW;
  return [x1 - 1, y1 - 1, x2 + 1, y2 + 1];
}

/**
 * Where the map drawDungeonMap draws puts the level's cell (x, y), in the look and the map chosen: its top-left and side
 * in EGA pixels - on the whole level's map, or the small map round the party (null where the cell is not on it), or
 * none with the EGA look's map off. (The dungeon map cells page, mapcells.html, cuts the cells out by it.)
 */
export function mapCell(g: Game, x: number, y: number): [number, number, number] | null {
  const s = g.s;
  if (g.options.tileSet === 'standard') {
    if (g.options.dungeonView === 'full') {
      // Where the level unrolls from the party, there; else (rock, or a level that loops) its nearest.
      const r = ACROSS >> 1;
      const [i, j] = unrolled(g)?.get(at8(x, y)) ?? [((x - s.x + 4) & 7) - 4, ((y - s.y + 4) & 7) - 4];
      return Math.abs(i) <= r && Math.abs(j) <= r ? [8 + (i + r) * WHOLE, 8 + (j + r) * WHOLE, WHOLE] : null;
    }
    const half = AROUND >> 1;
    const [i, j] = [(x - s.x + half) & 7, (y - s.y + half) & 7];
    const n = SMALL_CELL;
    return i < AROUND && j < AROUND ? [SLOT.x + SMALL_AT + i * n, SLOT.y + SMALL_AT + j * n, n] : null;
  }
  if (g.options.dungeonMap === 'off') return null;
  const at = g.options.dungeonMap === 'full' ? EGA_WHOLE : EGA_CORNER;
  return [at.x + (x & 7) * at.n, at.y + (y & 7) * at.n, at.n];
}

/**
 * The map over the dungeon's view, the first-person view already drawn (on page 1, and in the view on the screen).
 * The EGA look: the level's map in the view's corner, or over all of it, or none (Settings). The Standard look: the
 * first-person view with the map round the party beside it under the party panel, over the top of the log; or, its
 * Map command switched (Options.dungeonView), the whole level's map in the view's place, and the first-person view
 * made small beside it. Nothing is drawn where the party has not been, and nothing at all outside a dungeon.
 */
export function drawDungeonMap(g: Game): void {
  const s = g.s;
  const standard = g.options.tileSet === 'standard';
  const mode = g.options.dungeonMap;
  // The level as far as it is known, and in the dark the cells round the party as well, felt for but not kept.
  const known = standard || mode !== 'off' ? g.fog.placeSeen(s.mapId, s.level) : null;
  let seen = known;
  if (known !== null && inTheDark(g)) {
    seen = known ? known.slice() : new Uint8Array(CELLS * CELLS);
    feltCells(g, seen);
  }
  if (!seen || !standard) liftDungeonMap(g);
  if (!seen) return;
  const d = g.draw;
  const full = standard ? g.options.dungeonView === 'full' : mode === 'full';
  if (full) {
    // The Standard look: the party in the middle of the map's square and the level round it (aroundParty), eleven cells
    // of sixteen pixels a side filling it as the view grown to it does (dungeon.ts showView). The EGA look: the level as
    // it lies, its first cell at the corner of the view.
    if (standard) {
      d.pen = Colour.black;
      d.fill(8, 8, 8 + SQUARE - 1, 8 + SQUARE - 1);
      aroundParty(g, seen, 8, 8);
    } else {
      d.pen = Colour.black;
      d.fill(VIEW.x1, VIEW.y1, VIEW.x2, VIEW.y2);
      grid(g, seen, EGA_WHOLE.x, EGA_WHOLE.y, EGA_WHOLE.n, CELLS, 4, 4);
    }
  }
  if (!standard) {
    if (!full) grid(g, seen, EGA_CORNER.x, EGA_CORNER.y, EGA_CORNER.n, CELLS, 4, 4);
    return;
  }
  // Beside the view, over the log's top rows: not while the party panel is at its full height over them (layout.ts).
  if (!compactPanel(g)) return;
  if (!g.mapOverLog) {
    g.text.cover(Win.messages, LOG_COVER.c1, LOG_COVER.r1, LOG_COVER.c2, LOG_COVER.r2);
    g.mapOverLog = true;
  }
  d.pen = Colour.black;
  d.fill(LOG_COVER.c1 * 8, LOG_COVER.r1 * 8, LOG_COVER.c2 * 8 + 7, LOG_COVER.r2 * 8 + 7);
  if (!full) {
    grid(g, seen, SLOT.x + SMALL_AT, SLOT.y + SMALL_AT, SMALL_CELL, AROUND, s.x & 7, s.y & 7);
    return;
  }
  // The first-person view, small: its whole picture fitted to the square, a frame against it.
  const [x, y, x2, y2] = SMALL_VIEW;
  const [w, h] = [x2 - x + 1, y2 - y + 1];
  g.p.fx.transferScaled?.(1, 0, VIEW.x1, VIEW.y1, VIEW.x2, VIEW.y2, x, y, w, h);
  d.pen = Colour.lightGray;
  d.line(x - 1, y - 1, x + w, y - 1);
  d.line(x - 1, y + h, x + w, y + h);
  d.line(x - 1, y - 1, x - 1, y + h);
  d.line(x + w, y - 1, x + w, y + h);
}
