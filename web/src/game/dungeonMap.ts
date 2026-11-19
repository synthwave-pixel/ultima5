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
 *
 * Every game's: it reads the dungeon through the game's DungeonMapSource
 * (useDungeonMap) - the view's box, the look, the party's level, each
 * cell's kind and tiles, the cells known and the creatures seen. Ultima
 * V's is ultima5DungeonMap.ts.
 */

import { Colour } from '../ui/colours.ts';
import type { GameCore } from './gameCore.ts';
import type { ViewCell } from './io.ts';

/** The map's square on the screen, in EGA pixels a side from (8, 8): the Standard look's dungeon view, grown to it. */
const SQUARE = 0xb0;

const CELLS = 8;
/** The message log's text window (frame.ts Win.messages). */
const LOG = 2;

/**
 * The log's cells the Standard look's small map (or small view) lies over: under the party panel's band, nine rows of
 * the log, the rest of it going on below - from row 9 under Ultima V's six-line panel, or the row a game's taller panel
 * leaves it (DungeonMapSource.slotRow).
 */
const SLOT_ROWS = 9;
const SLOT_ROW = 9;
const logCover = (src: DungeonMapSource): { c1: number; r1: number; c2: number; r2: number } => {
  const r1 = src.slotRow ?? SLOT_ROW;
  return { c1: 0x18, r1, c2: 0x27, r2: r1 + SLOT_ROWS - 1 };
};

/** Where in them, in EGA pixels: a square centred in the right-hand column, a frame's room round it (y 75 at row 9). */
const SLOT_SIZE = 64;
const slotOf = (src: DungeonMapSource): { x: number; y: number; size: number } => ({
  x: 0xc0 + (128 - SLOT_SIZE) / 2,
  y: (src.slotRow ?? SLOT_ROW) * 8 + 3,
  size: SLOT_SIZE,
});

/**
 * The small map's cells a side, the party in the middle one; each cell as many pixels as fit (twelve: its tiles drawn
 * at three quarters of their size), the map centred in the square.
 */
const AROUND = 5;
const SMALL_CELL = Math.floor(SLOT_SIZE / AROUND);
const SMALL_AT = (SLOT_SIZE - SMALL_CELL * AROUND) >> 1;

/**
 * What a cell is: what the party knows of it, a hidden thing as it looks. Orbs, altars and traps are Ultima IV's
 * (Ultima V's levels have none).
 */
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
  | 'rubble'
  | 'orb'
  | 'altar'
  | 'trap';

/**
 * How a cell is drawn in the look's tiles, one over another - each with its tint - and a box of an EGA colour over its
 * middle where the original drew one (a pit, a field). No tiles: the look draws the map's own shapes.
 */
export interface CellLook {
  tiles: { tile: number; tint?: number }[];
  box?: number;
}

/** The level the party is on, as the map reads it. Its cells are (x, y), 0-7; the level wraps. */
export interface MapLevel {
  /** The level's own name, for Smooth motion's glide (the scene it slides within). */
  readonly scene: string;
  /** The party's cell, and the way it faces: 0 north, 1 east, 2 south, 3 west. */
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  /** What the party knows of a cell. */
  kind(x: number, y: number): Kind;
  /** A field's colour (its low bits: 0 magenta, 1 green, 2 red, 3 blue, FIELD_COLOURS), and the look's detail. */
  detail(x: number, y: number): number;
  /** Whether the level's passages join through a cell: one the party can pass, or a hidden door it walks through. */
  joins(x: number, y: number): boolean;
  /** The cells the party has seen (y * 8 + x, non-zero), kept; none where it has never been. */
  known(): Uint8Array | undefined;
  /** In the dark: the eight round the party felt for, not kept (feltCells). */
  readonly dark: boolean;
  /** The creatures the party sees: each one's cell, its tile in the Standard look, and its name for the glide. */
  creatures(): { x: number; y: number; tile: number; mover: string }[];
  /** The look's tiles for a cell of `kind`, `detail` its detail. */
  look(kind: Kind, detail: number): CellLook;
}

/** What the map needs of a game: set by the game (useDungeonMap); Ultima V's is ultima5DungeonMap.ts. */
export interface DungeonMapSource {
  /** The first-person view's rectangle on the screen, in EGA pixels (inclusive): the EGA look's maps lie in it. */
  readonly view: { x1: number; y1: number; x2: number; y2: number };
  /** Whether the Standard look is drawn (its tiles, its small map over the log, its whole-level map round the party). */
  standard(): boolean;
  /** Whether the party panel is compact, the small map's room under it over the log (frame.ts compactPanel). */
  compact(): boolean;
  /**
   * The log's first row the Standard look's small map (or small view) lies over, nine rows of it: unset, row 9, under
   * Ultima V's six-line panel; a game whose panel is taller says where its log begins.
   */
  readonly slotRow?: number;
  /** The party's leader's tile in the Standard look (world.ts partyFigures), or null. */
  leader(): number | null;
  /** The level the party is on, or null outside a dungeon. */
  level(): MapLevel | null;
}

const sources = new WeakMap<GameCore, DungeonMapSource>();

/** The game's dungeon as the map reads it (null: none). */
export function useDungeonMap(g: GameCore, source: DungeonMapSource | null): void {
  if (source) sources.set(g, source);
  else sources.delete(g);
}

export function dungeonMapSource(g: GameCore): DungeonMapSource | null {
  return sources.get(g) ?? null;
}

/** The party's level, where the game has a map and the party is below. */
const levelOf = (g: GameCore): MapLevel | null => sources.get(g)?.level() ?? null;

/** Whether the party can go through a cell of this kind (the map's cells are linked where it can). */
export const passable = (kind: Kind): boolean => kind !== 'rock' && kind !== 'rubble';

/** A field's colour, by its kind (the low bits): as the view's crackle has it (dungeon.ts field). */
export const FIELD_COLOURS = [Colour.magenta, Colour.green, Colour.red, Colour.blue];

/** A cell in the look's tiles (MapLevel.look); false where the look draws no tiles, and nothing is drawn. */
function tiled(g: GameCore, lv: MapLevel, kind: Kind, px: number, py: number, n: number, field: number): boolean {
  const d = g.draw;
  const { tiles, box } = lv.look(kind, field);
  if (tiles.length === 0) return false;
  for (const [k, t] of tiles.entries()) if (!d.icon?.(t.tile, px, py, n, false, t.tint) && k === 0) return false;
  if (box !== undefined) {
    const r = Math.max(1, Math.round(n / 5));
    const [cx, cy] = [px + Math.round(n / 2), py + Math.round(n / 2)];
    d.pen = box;
    d.fill(cx - r, cy - r, cx + r - 1, cy + r - 1);
  }
  return true;
}

/** Draw one cell at (px, py), `n` pixels a side, with arms to the cells it opens onto. */
function cell(g: GameCore, lv: MapLevel, kind: Kind, px: number, py: number, n: number, links: number, field = 0): void {
  const d = g.draw;
  if (tiled(g, lv, kind, px, py, n, field)) return;
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
    case 'orb':
      d.pen = Colour.magenta + 8;
      d.fill(cx - r, cy - r, cx + r, cy + r);
      break;
    case 'altar':
      d.pen = Colour.brightWhite;
      d.fill(cx - r, cy - (r >> 1), cx + r, cy + (r >> 1));
      break;
    case 'trap':
      d.pen = Colour.brightRed;
      d.line(cx - r, cy - r, cx + r, cy + r);
      d.line(cx - r, cy + r, cx + r, cy - r);
      break;
    case 'floor':
      break;
  }
}

/**
 * A creature seen (MapLevel.creatures, its `tile`) on its cell at (px, py), `n` pixels a side: in the Standard look its
 * figure, walking; in the EGA look a red mark.
 */
function creature(g: GameCore, tile: number, px: number, py: number, n: number): void {
  const d = g.draw;
  if (d.icon?.(tile, px, py, n)) return;
  const r = Math.max(1, Math.round(n / 5));
  const [cx, cy] = [px + Math.round(n / 2), py + Math.round(n / 2)];
  d.pen = Colour.brightRed;
  d.fill(cx - r, cy - r, cx + r - 1, cy + r - 1);
}

/** The party, and which way it faces. */
function party(g: GameCore, src: DungeonMapSource, lv: MapLevel, px: number, py: number, n: number): void {
  const d = g.draw;
  const cx = px + Math.round(n / 2);
  const cy = py + Math.round(n / 2);
  const r = Math.max(1, Math.round(n / 7));
  const [dx, dy] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][lv.facing & 3];
  // The Standard look: the party's leader, as the map above ground draws it (world.ts partyFigures: the Avatar as the
  // player made it, walking, or the first of the party still living), its tile laid on the cell a pixel to a pixel;
  // and a pointer out past the cell's edge on the side the party faces, in the way it would go.
  const lay = (): boolean => {
    const leader = src.leader();
    return src.standard() && leader !== null && !!d.icon?.(leader, px, py, n);
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
export function byCompass(g: GameCore): boolean {
  return g.options.tileSet === 'standard' && g.options.dungeonView === 'full';
}

/** The Standard look's small map taken off the log: the log's rows under it drawn again as they now read. */
export function liftDungeonMap(g: GameCore): void {
  if (!g.mapOverLog) return;
  g.mapOverLog = false;
  g.text.uncover();
}

/**
 * A grid of the level's cells, `span` a side centred on (cx, cy) - the level wraps; the whole level's is centred on
 * (4, 4), so that it starts at its first cell - each `n` pixels, at (x0, y0), in a frame of its own (it is set in
 * something: the log, the EGA look's view).
 */
function grid(
  g: GameCore,
  src: DungeonMapSource,
  lv: MapLevel,
  seen: Uint8Array,
  x0: number,
  y0: number,
  n: number,
  span: number,
  cx: number,
  cy: number,
): void {
  const d = g.draw;
  const w = n * span;
  d.pen = Colour.black;
  d.fill(x0 - 2, y0 - 2, x0 + w + 1, y0 + w + 1);
  d.pen = Colour.lightGray;
  d.line(x0 - 2, y0 - 2, x0 + w + 1, y0 - 2);
  d.line(x0 - 2, y0 + w + 1, x0 + w + 1, y0 + w + 1);
  d.line(x0 - 2, y0 - 2, x0 - 2, y0 + w + 1);
  d.line(x0 + w + 1, y0 - 2, x0 + w + 1, y0 + w + 1);
  const kindAt = (x: number, y: number): Kind => lv.kind(x & 7, y & 7);
  const open = (x: number, y: number): boolean => seen[(y & 7) * CELLS + (x & 7)] !== 0 && passable(kindAt(x, y));
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
      cell(g, lv, kindAt(x, y), x0 + i * n, y0 + j * n, n, links, lv.detail(x, y));
    }
  }
  // The creatures, where the party sees them (MapLevel.creatures), and the party over all.
  for (const a of lv.creatures()) {
    const [ax, ay] = [(a.x - cx - first + 8) & 7, (a.y - cy - first + 8) & 7];
    if (ax < span && ay < span) creature(g, a.tile, x0 + ax * n, y0 + ay * n, n);
  }
  const px = ((lv.x & 7) - cx - first + 8) & 7;
  const py = ((lv.y & 7) - cy - first + 8) & 7;
  if (px < span && py < span) party(g, src, lv, x0 + px * n, y0 + py * n, n);
}

type Box = DungeonMapSource['view'];

/** The EGA look's maps of the whole level, each a grid of the level as it lies: over all the view, or in its corner. */
const egaWhole = (view: Box): { x: number; y: number; n: number } => ({
  x: view.x1 + Math.floor((view.x2 - view.x1 + 1 - 20 * CELLS) / 2),
  y: view.y1 + Math.floor((view.y2 - view.y1 + 1 - 20 * CELLS) / 2),
  n: 20,
});
const egaCorner = (view: Box): { x: number; y: number; n: number } => ({ x: view.x2 - 8 * CELLS - 3, y: view.y1 + 3, n: 8 });

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

/**
 * Where the cells the party can reach lie from it, the level unrolled from where it stands: its passages walked out
 * step by step, each cell placed at its steps from the party (dx, dy), as far as they run - the passages as they are
 * rather than the eight by eight grid they are packed into, which wraps (most of the levels were laid out across their
 * own edges, and join up only as pieces). By each cell's place in the grid. Null where they loop round the level - a
 * cell met again at another place, so that they go on for ever (Shame's seventh level, Doom's fifth).
 */
export function unrolled(g: GameCore): Map<number, [number, number]> | null {
  const lv = levelOf(g);
  return lv && unrolledFrom(lv);
}

/** unrolled, of the level `lv`. */
function unrolledFrom(lv: MapLevel): Map<number, [number, number]> | null {
  const joinsAt = (dx: number, dy: number): boolean => lv.joins((lv.x + dx) & 7, (lv.y + dy) & 7);
  const placed = new Map<number, [number, number]>([[at8(lv.x, lv.y), [0, 0]]]);
  // Walked out from the party's own cell, which joins the passages round it (not through rock, which would join
  // pieces that do not meet).
  const queue: [number, number][] = joinsAt(0, 0) ? [[0, 0]] : [];
  for (let q = queue.shift(); q; q = queue.shift()) {
    for (const [sx, sy] of STEPS) {
      const [dx, dy] = [q[0] + sx, q[1] + sy];
      if (!joinsAt(dx, dy)) continue;
      const was = placed.get(at8(lv.x + dx, lv.y + dy));
      if (was && (was[0] !== dx || was[1] !== dy)) return null;
      if (was) continue;
      placed.set(at8(lv.x + dx, lv.y + dy), [dx, dy]);
      queue.push([dx, dy]);
    }
  }
  return placed;
}

/** A cell of the level round the party as the maps show it: (i, j) from the party, (x, y) its own on the level. */
export interface LevelCell {
  i: number;
  j: number;
  x: number;
  y: number;
}

/**
 * The cells of the party's level the maps show round it, `r` cells out each way, seen (`seen`, the level's eight by
 * eight): where the party's passages unroll (unrolled) each cell where it lies from the party and nowhere else - a
 * passage where it was walked out to, the rock beside such a passage - the level's other pieces (reached by other
 * ladders) not at all; where they loop round the level, every cell wherever it comes round.
 */
export function levelCells(g: GameCore, seen: Uint8Array, r: number): LevelCell[] {
  const lv = levelOf(g);
  return lv ? cellsOf(lv, seen, r) : [];
}

/** levelCells, of the level `lv`. */
function cellsOf(lv: MapLevel, seen: Uint8Array, r: number): LevelCell[] {
  const s = lv;
  const places = unrolledFrom(lv);
  const placedAt = (i: number, j: number): boolean => {
    const p = places?.get(at8(s.x + i, s.y + j));
    return !!p && p[0] === i && p[1] === j;
  };
  const shownAt = (i: number, j: number): boolean => {
    if (!places || placedAt(i, j)) return true;
    // Rock beside a passage where it lies (a corner's too); a passage anywhere else is another place.
    if (lv.joins((s.x + i) & 7, (s.y + j) & 7)) return false;
    for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) if (placedAt(i + ex, j + ey)) return true;
    return false;
  };
  const out: LevelCell[] = [];
  for (let j = -r; j <= r; j++)
    for (let i = -r; i <= r; i++) {
      const [x, y] = [(s.x + i) & 7, (s.y + j) & 7];
      if (seen[at8(x, y)] && shownAt(i, j)) out.push({ i, j, x, y });
    }
  return out;
}

/**
 * The Standard look's whole-level map: the party in the middle and the level round it, eleven cells a side filling the
 * map's square, moving with the party. Where the party's passages unroll (unrolled) each cell is drawn where it lies
 * from the party and nowhere else - a passage where it was walked out to, the rock beside such a passage - so the map
 * is the passages as they run, never the grid's own wrapping; the level's other pieces (reached by other ladders) not
 * at all. Where they loop round the level, it goes on as it begins past its edges, as a gem's view of it has it
 * (dungeon.ts dungeonView), every cell wherever it comes round.
 */
function aroundParty(g: GameCore, src: DungeonMapSource, lv: MapLevel, seen: Uint8Array, x0: number, y0: number): ViewCell[] {
  const s = lv;
  // Smooth motion: each square as drawn, to be drawn again bare of the party or the creature (ui/viewGlide.ts).
  const squares = new Map<number, () => void>();
  const r = ACROSS >> 1;
  const places = unrolledFrom(lv);
  const kindAt = (x: number, y: number): Kind => lv.kind(x & 7, y & 7);
  const open = (x: number, y: number): boolean => seen[at8(x, y)] !== 0 && passable(kindAt(x, y));
  for (const { i, j, x, y } of cellsOf(lv, seen, r)) {
    let links = 0;
    if (open(x, y - 1)) links |= 1;
    if (open(x + 1, y)) links |= 2;
    if (open(x, y + 1)) links |= 4;
    if (open(x - 1, y)) links |= 8;
    const square = (): void => cell(g, lv, kindAt(x, y), x0 + (i + r) * WHOLE, y0 + (j + r) * WHOLE, WHOLE, links, lv.detail(x, y));
    square();
    squares.set((j + r) * ACROSS + i + r, square);
  }
  const cells: ViewCell[] = [];
  /** Square (i, j) from the party as it is with no one on it: black where nothing of it is shown. */
  const bare = (i: number, j: number): NonNullable<ViewCell['bare']> => ({
    draw: () => {
      const [px, py] = [x0 + (i + r) * WHOLE, y0 + (j + r) * WHOLE];
      g.draw.pen = Colour.black;
      g.draw.fill(px, py, px + WHOLE - 1, py + WHOLE - 1);
      squares.get((j + r) * ACROSS + i + r)?.();
    },
  });
  // The creatures, where the party sees them (MapLevel.creatures): where each one's cell lies from the party.
  for (const a of lv.creatures()) {
    const [i, j] = places?.get(at8(a.x, a.y)) ?? [((a.x - s.x + 4) & 7) - 4, ((a.y - s.y + 4) & 7) - 4];
    if (Math.abs(i) <= r && Math.abs(j) <= r) {
      creature(g, a.tile, x0 + (i + r) * WHOLE, y0 + (j + r) * WHOLE, WHOLE);
      if (i !== 0 || j !== 0) cells[(j + r) * ACROSS + i + r] = { mover: a.mover, bare: bare(i, j) };
    }
  }
  party(g, src, lv, x0 + r * WHOLE, y0 + r * WHOLE, WHOLE);
  cells[r * ACROSS + r] = { party: true, bare: bare(0, 0) };
  return cells;
}

/**
 * The Standard look's first-person view made small beside the whole-level map, in EGA pixels (x1, y1, x2, y2,
 * inclusive): its whole picture fitted to the square slot, centred in it.
 */
function smallViewOf(src: DungeonMapSource): [number, number, number, number] {
  const view = src.view;
  const slot = slotOf(src);
  const w = Math.round(((view.x2 - view.x1 + 1) * slot.size) / (view.y2 - view.y1 + 1));
  const x = slot.x + ((slot.size - w) >> 1);
  return [x, slot.y, x + w - 1, slot.y + slot.size - 1];
}

/**
 * The first-person view as the whole-level map shows it small beside itself, with its frame (EGA pixels, inclusive),
 * where it is shown (the Standard look's map up, the party panel compact over the log); else null.
 */
export function smallView(g: GameCore): [number, number, number, number] | null {
  const src = dungeonMapSource(g);
  if (!src || !byCompass(g) || !src.compact()) return null;
  const [x1, y1, x2, y2] = smallViewOf(src);
  return [x1 - 1, y1 - 1, x2 + 1, y2 + 1];
}

/**
 * Where the map drawDungeonMap draws puts the level's cell (x, y), in the look and the map chosen: its top-left and side
 * in EGA pixels - on the whole level's map, or the small map round the party (null where the cell is not on it), or
 * none with the EGA look's map off. (The dungeon map cells page, mapcells.html, cuts the cells out by it.)
 */
export function mapCell(g: GameCore, x: number, y: number): [number, number, number] | null {
  const src = dungeonMapSource(g);
  const s = src?.level();
  if (!src || !s) return null;
  if (src.standard()) {
    if (g.options.dungeonView === 'full') {
      // Where the level unrolls from the party, there; else (rock, or a level that loops) its nearest.
      const r = ACROSS >> 1;
      const [i, j] = unrolledFrom(s)?.get(at8(x, y)) ?? [((x - s.x + 4) & 7) - 4, ((y - s.y + 4) & 7) - 4];
      return Math.abs(i) <= r && Math.abs(j) <= r ? [8 + (i + r) * WHOLE, 8 + (j + r) * WHOLE, WHOLE] : null;
    }
    const half = AROUND >> 1;
    const [i, j] = [(x - s.x + half) & 7, (y - s.y + half) & 7];
    const n = SMALL_CELL;
    const slot = slotOf(src);
    return i < AROUND && j < AROUND ? [slot.x + SMALL_AT + i * n, slot.y + SMALL_AT + j * n, n] : null;
  }
  if (g.options.dungeonMap === 'off') return null;
  const at = g.options.dungeonMap === 'full' ? egaWhole(src.view) : egaCorner(src.view);
  return [at.x + (x & 7) * at.n, at.y + (y & 7) * at.n, at.n];
}

/**
 * The map over the dungeon's view, the first-person view already drawn (on page 1, and in the view on the screen).
 * The EGA look: the level's map in the view's corner, or over all of it, or none (Settings). The Standard look: the
 * first-person view with the map round the party beside it under the party panel, over the top of the log; or, its
 * Map command switched (Options.dungeonView), the whole level's map in the view's place, and the first-person view
 * made small beside it. Nothing is drawn where the party has not been, and nothing at all outside a dungeon.
 */
export function drawDungeonMap(g: GameCore): void {
  const src = dungeonMapSource(g);
  const s = src?.level();
  if (!src || !s) {
    liftDungeonMap(g);
    return g.draw.viewDrawn?.(null);
  }
  const standard = src.standard();
  const mode = g.options.dungeonMap;
  // The level as far as it is known, and in the dark the cells round the party as well, felt for but not kept.
  const known = standard || mode !== 'off' ? s.known() : null;
  let seen = known;
  if (known !== null && s.dark) {
    seen = known ? known.slice() : new Uint8Array(CELLS * CELLS);
    feltCells(s, seen);
  }
  if (!seen || !standard) liftDungeonMap(g);
  if (!seen) return g.draw.viewDrawn?.(null);
  const d = g.draw;
  const full = standard ? g.options.dungeonView === 'full' : mode === 'full';
  // Smooth motion glides the Standard look's whole-level map, the level sliding under the party (ui/viewGlide.ts); the
  // small map and the first-person view step, as ever.
  if (!(standard && full)) {
    drawMap(g, src, s, seen, standard, full);
    d.viewDrawn?.(null);
    return;
  }
  d.viewBegin?.();
  const cells = drawMap(g, src, s, seen, standard, full);
  d.viewDrawn?.({
    scene: s.scene,
    origin: { x: s.x - (ACROSS >> 1), y: s.y - (ACROSS >> 1) },
    wrap: CELLS,
    cells,
    covered: false,
  });
}

/**
 * The small map beside the first-person view drawn again at once, where it is up (the Enhanced interface, in a dungeon,
 * the view the large one, the panel its own height): a look chosen in a menu over it, or its tiles come, show on it then,
 * not only at the party's next step.
 */
export function redrawSideMap(g: GameCore): void {
  const src = dungeonMapSource(g);
  if (src?.level() && src.standard() && g.options.dungeonView === 'mini' && src.compact()) drawDungeonMap(g);
}

/** drawDungeonMap's drawing: the whole-level map's squares, as the Standard look draws them, for Smooth motion. */
function drawMap(g: GameCore, src: DungeonMapSource, s: MapLevel, seen: Uint8Array, standard: boolean, full: boolean): ViewCell[] {
  const d = g.draw;
  const view = src.view;
  let cells: ViewCell[] = [];
  if (full) {
    // The Standard look: the party in the middle of the map's square and the level round it (aroundParty), eleven cells
    // of sixteen pixels a side filling it as the view grown to it does (dungeon.ts showView). The EGA look: the level as
    // it lies, its first cell at the corner of the view.
    if (standard) {
      d.pen = Colour.black;
      d.fill(8, 8, 8 + SQUARE - 1, 8 + SQUARE - 1);
      cells = aroundParty(g, src, s, seen, 8, 8);
    } else {
      const at = egaWhole(view);
      d.pen = Colour.black;
      d.fill(view.x1, view.y1, view.x2, view.y2);
      grid(g, src, s, seen, at.x, at.y, at.n, CELLS, 4, 4);
    }
  }
  if (!standard) {
    const at = egaCorner(view);
    if (!full) grid(g, src, s, seen, at.x, at.y, at.n, CELLS, 4, 4);
    return cells;
  }
  // Beside the view, over the log's top rows: not while the party panel is at its full height over them (layout.ts).
  if (!src.compact()) return cells;
  const cover = logCover(src);
  const slot = slotOf(src);
  if (!g.mapOverLog) {
    g.text.cover(LOG, cover.c1, cover.r1, cover.c2, cover.r2);
    g.mapOverLog = true;
  }
  d.pen = Colour.black;
  d.fill(cover.c1 * 8, cover.r1 * 8, cover.c2 * 8 + 7, cover.r2 * 8 + 7);
  if (!full) {
    grid(g, src, s, seen, slot.x + SMALL_AT, slot.y + SMALL_AT, SMALL_CELL, AROUND, s.x & 7, s.y & 7);
    return cells;
  }
  // The first-person view, small: its whole picture fitted to the square, a frame against it.
  const [x, y, x2, y2] = smallViewOf(src);
  const [w, h] = [x2 - x + 1, y2 - y + 1];
  g.p.fx.transferScaled?.(1, 0, view.x1, view.y1, view.x2, view.y2, x, y, w, h);
  d.pen = Colour.lightGray;
  d.line(x - 1, y - 1, x + w, y - 1);
  d.line(x - 1, y + h, x + w, y + h);
  d.line(x - 1, y - 1, x - 1, y + h);
  d.line(x + w, y - 1, x + w, y + h);
  return cells;
}

/**
 * Underground, the party's cell and the eight round it, which it knows even in the dark (the port's, as the ultima3
 * port maps its dungeons: felt for, not seen, and so never kept on the map - the map shows them while the party stands
 * there). `seen` is the level's record to add them to; a dungeon's grid is eight by eight and wraps.
 */
export function feltCells(lv: MapLevel, seen: Uint8Array): void {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) seen[((lv.y + dy) & 7) * 8 + ((lv.x + dx) & 7)] = 1;
}
