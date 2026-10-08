/**
 * fog.ts
 *
 * What the party has seen: the two worlds, every level of every town,
 * keep and castle, and every dungeon's grid of cells. A square is marked
 * the moment the viewport shows it, so the record is exactly the
 * original's sight: line of sight round mountains and walls, the light
 * the party carries at night, and everything the See All spell turns up.
 * Underground, where the party sees by turning on the spot, it is the
 * cell it stands in and as far as the passages leading off it run.
 *
 * It is the player's knowledge, not the Avatar's, but it belongs with
 * the saved game: it travels in the save file beside the journal's
 * clues, run-length encoded because early on it is nearly all dark.
 */

import { SETTLEMENTS, TOWN_SIZE, WORLD_SIZE } from '../data/maps.ts';
import type { Game } from './game.ts';

const SQUARES = WORLD_SIZE * WORLD_SIZE;

/** A level of a settlement or a dungeon, as the record keys it: the map and the level it is. */
export const placeKey = (mapId: number, level: number): string => `${mapId}.${level & 0xff}`;

/** How many squares a side a place's map is: a settlement's level, or a dungeon's grid of cells. */
export const placeSize = (mapId: number): number => (mapId > SETTLEMENTS ? 8 : TOWN_SIZE);

/** The two worlds' maps, a byte a square: 1 where it has been seen. */
export class Fog {
  readonly brit = new Uint8Array(SQUARES);
  readonly under = new Uint8Array(SQUARES);
  /** Every level of every town and dungeon the party has set foot in, by placeKey. */
  readonly places = new Map<string, Uint8Array>();
  /** Where a moongate led, for every gate the party has stepped into: "x,y" of the gate to "x,y" of its far end. */
  readonly gates = new Map<string, string>();
  /**
   * The places whose names the party has learnt (mapMarks.ts: "place:<id>", "shrine:<n>"): entered, or named in
   * someone's hearing (placeNames.ts). Till then the map calls a place only what it looks like ("Towne?").
   */
  readonly named = new Set<string>();
  private counts = [0, 0];

  of(underworld: boolean): Uint8Array {
    return underworld ? this.under : this.brit;
  }

  seen(underworld: boolean, x: number, y: number): boolean {
    return this.of(underworld)[(y & 0xff) * WORLD_SIZE + (x & 0xff)] !== 0;
  }

  mark(underworld: boolean, x: number, y: number): void {
    const map = this.of(underworld);
    const i = (y & 0xff) * WORLD_SIZE + (x & 0xff);
    if (map[i]) return;
    map[i] = 1;
    this.counts[underworld ? 1 : 0]++;
  }

  count(underworld: boolean): number {
    return this.counts[underworld ? 1 : 0];
  }

  /** Whether the Underworld has been seen at all: what opens its map to the player. */
  get knowsUnderworld(): boolean {
    return this.counts[1] > 0;
  }

  /** Everything another record knows, added to this one: what the player has learnt is never unlearnt. */
  merge(other: Fog): void {
    for (const world of [false, true]) {
      const mine = this.of(world);
      const theirs = other.of(world);
      for (let i = 0; i < mine.length; i++) if (theirs[i] && !mine[i]) mine[i] = 1;
      this.counts[world ? 1 : 0] = tally(mine);
    }
    for (const [from, to] of other.gates) if (!this.gates.has(from)) this.gates.set(from, to);
    for (const key of other.named) this.named.add(key);
    for (const [key, theirs] of other.places) {
      const mine = this.places.get(key);
      if (!mine) {
        this.places.set(key, theirs.slice());
        continue;
      }
      for (let i = 0; i < mine.length && i < theirs.length; i++) if (theirs[i]) mine[i] = 1;
    }
  }

  /** Nothing known at all, for a game begun afresh. */
  clear(): void {
    this.brit.fill(0);
    this.under.fill(0);
    this.places.clear();
    this.gates.clear();
    this.named.clear();
    this.counts = [0, 0];
  }

  /** A gate stepped into, and where it put the party: the pair is the player's own to keep. */
  learnGate(fromX: number, fromY: number, toX: number, toY: number): void {
    this.gates.set(`${fromX & 0xff},${fromY & 0xff}`, `${toX & 0xff},${toY & 0xff}`);
  }

  /** Where a gate is known to lead, or nothing. */
  gateLeadsTo(x: number, y: number): [number, number] | null {
    const to = this.gates.get(`${x & 0xff},${y & 0xff}`);
    if (!to) return null;
    const [tx, ty] = to.split(',').map(Number);
    return [tx, ty];
  }

  /**
   * Whether the party knows a place's name (`key`, as named): learnt, or - for a game saved before names were kept -
   * a town or dungeon the party has been inside.
   */
  knowsName(key: string): boolean {
    if (this.named.has(key)) return true;
    const id = /^place:(\d+)$/.exec(key)?.[1];
    return id !== undefined && [...this.places.keys()].some((k) => k.startsWith(`${id}.`));
  }

  /** The record for one level of a settlement or dungeon, made the first time the party is there. */
  place(mapId: number, level: number): Uint8Array {
    const key = placeKey(mapId, level);
    let map = this.places.get(key);
    if (!map) {
      const size = placeSize(mapId);
      map = new Uint8Array(size * size);
      this.places.set(key, map);
    }
    return map;
  }

  /** The record for a level if the party has ever been there, and nothing if it has not. */
  placeSeen(mapId: number, level: number): Uint8Array | undefined {
    return this.places.get(placeKey(mapId, level));
  }

  markPlace(mapId: number, level: number, x: number, y: number): void {
    const size = placeSize(mapId);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    this.place(mapId, level)[y * size + x] = 1;
  }

  encode(): FogData {
    const places: Record<string, string> = {};
    for (const [key, map] of this.places) places[key] = pack(map);
    return { brit: pack(this.brit), under: pack(this.under), places, gates: Object.fromEntries(this.gates), named: [...this.named] };
  }

  static decode(d: Partial<FogData> | undefined): Fog {
    const fog = new Fog();
    if (d?.brit) unpack(d.brit, fog.brit);
    if (d?.under) unpack(d.under, fog.under);
    for (const [from, to] of Object.entries(d?.gates ?? {})) if (typeof to === 'string') fog.gates.set(from, to);
    for (const key of Array.isArray(d?.named) ? d.named : []) if (typeof key === 'string') fog.named.add(key);
    for (const [key, text] of Object.entries(d?.places ?? {})) {
      const mapId = Number(key.split('.')[0]);
      if (!Number.isFinite(mapId)) continue;
      const size = placeSize(mapId);
      const map = new Uint8Array(size * size);
      unpack(text, map);
      fog.places.set(key, map);
    }
    fog.counts = [tally(fog.brit), tally(fog.under)];
    return fog;
  }
}

/** The record as it is written into the saved game. */
export interface FogData {
  brit: string;
  under: string;
  places: Record<string, string>;
  /** Where each gate the party has used led: "x,y" to "x,y". */
  gates: Record<string, string>;
  /** The places whose names the party has learnt (Fog.named); absent in a game saved before they were kept. */
  named?: string[];
}

function tally(map: Uint8Array): number {
  let n = 0;
  for (const b of map) if (b) n++;
  return n;
}

/**
 * Runs of dark and seen, alternating and starting with dark, each length
 * a base-64 varint (five bits a digit, the sixth set while more follow).
 */
const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function pack(map: Uint8Array): string {
  let out = '';
  let at = 0;
  let want = 0;
  while (at < map.length) {
    let run = 0;
    while (at + run < map.length && (map[at + run] !== 0 ? 1 : 0) === want) run++;
    let n = run;
    do {
      const digit = n & 0x1f;
      n >>= 5;
      out += DIGITS[digit | (n > 0 ? 0x20 : 0)];
    } while (n > 0);
    at += run;
    want ^= 1;
  }
  return out;
}

function unpack(text: string, map: Uint8Array): void {
  let at = 0;
  let want = 0;
  for (let i = 0; i < text.length && at < map.length; ) {
    let run = 0;
    let shift = 0;
    for (;;) {
      const d = DIGITS.indexOf(text[i++]);
      if (d < 0) return;
      run |= (d & 0x1f) << shift;
      shift += 5;
      if ((d & 0x20) === 0) break;
      if (i >= text.length) return;
    }
    if (want) map.fill(1, at, Math.min(map.length, at + run));
    at += run;
    want ^= 1;
  }
}

/**
 * Mark what the viewport is showing. Called once a turn while the party
 * is out in a world; the viewport holds 0xff where nothing is seen and 0
 * where an actor stands (which is a square in plain sight).
 */
export function revealView(g: Game): void {
  const s = g.s;
  if (s.mapId > SETTLEMENTS) {
    revealCells(g);
    return;
  }
  const underworld = s.mapId === 0 && s.level === 0xff;
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      if (g.view[y * 32 + x] === 0xff) continue;
      if (s.mapId === 0) g.fog.mark(underworld, s.x - 5 + x, s.y - 5 + y);
      else g.fog.markPlace(s.mapId, s.level, s.x - 5 + x, s.y - 5 + y);
    }
  }
}

/** A dungeon cell as the save holds it (DUNGEON_0000 cellIndex). */
const cellAt = (g: Game, x: number, y: number, level: number): number => g.s.dungeon[level * 0x40 + (y & 7) * 8 + (x & 7)];

/** Whether sight passes through a cell: a wall, a caved-in passage or a door not yet opened stops it. */
const solid = (cell: number): boolean => (cell & 0xf0) >= 0xa0;

/** Whether the party below ground is in the dark: no torch burning and no light spell on it (Look's "darkness"). */
export const inTheDark = (g: Game): boolean => g.s.d58a6 === 0 && g.s.d58a7 === 0;

/**
 * Underground, the party's cell and the eight round it, which it knows even in the dark (the port's, as the ultima3
 * port maps its dungeons: felt for, not seen, and so never kept on the map - dungeonMap.ts shows them while the party
 * stands there). `seen` is the level's record to add them to; a dungeon's grid is eight by eight and wraps.
 */
export function feltCells(g: Game, seen: Uint8Array): void {
  const s = g.s;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) seen[((s.y + dy) & 7) * 8 + ((s.x + dx) & 7)] = 1;
}

/**
 * Underground, the cells the party sees from where it stands, with a light: the cell it stands in and the eight round
 * it, and as far down each passage leading off it as the walls allow, with the walls to either hand - the party need
 * only turn on the spot to look. In the grid's places (0-7), which wrap.
 */
export function cellsInSight(g: Game): [number, number][] {
  const s = g.s;
  const out: [number, number][] = [];
  const mark = (x: number, y: number): number => out.push([x & 7, y & 7]);
  // The party's cell and the eight round it (the port's, as the ultima3 port maps its dungeons): the corners are
  // walls or passages as surely as the sides are.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(s.x + dx, s.y + dy);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let step = 1; step <= 3; step++) {
      const x = s.x + dx * step;
      const y = s.y + dy * step;
      mark(x, y);
      if (solid(cellAt(g, x & 7, y & 7, s.level))) break;
      // A passage's walls to either hand, as the view draws them down it.
      mark(x + dy, y + dx);
      mark(x - dy, y - dx);
    }
  }
  return out;
}

/**
 * Underground, what the party sees kept (cellsInSight), with a light. Nothing in the dark: what the party finds by
 * feel is not kept (feltCells).
 */
export function revealCells(g: Game): void {
  const s = g.s;
  if (s.mapId <= SETTLEMENTS || s.mapId >= 0x80 || inTheDark(g)) return;
  for (const [x, y] of cellsInSight(g)) g.fog.markPlace(s.mapId, s.level, x, y);
}

/**
 * Where the party, with a light, would see its creature: down each open passage as far as the view looks (as
 * cellsInSight), and a corner of the eight round the party where an open cell beside the party looks into it. Not
 * through rock or a closed door, as the eight round the party are otherwise known: the corners are mapped whatever is
 * between, but a creature is seen only where the view could show it.
 */
function creatureSight(g: Game): [number, number][] {
  const s = g.s;
  const open = (x: number, y: number): boolean => !solid(cellAt(g, x & 7, y & 7, s.level));
  const out: [number, number][] = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let step = 1; step <= 3; step++) {
      const [x, y] = [s.x + dx * step, s.y + dy * step];
      if (!open(x, y)) break;
      out.push([x & 7, y & 7]);
    }
  }
  for (const dx of [-1, 1])
    for (const dy of [-1, 1])
      if (open(s.x + dx, s.y + dy) && (open(s.x + dx, s.y) || open(s.x, s.y + dy))) out.push([(s.x + dx) & 7, (s.y + dy) & 7]);
  return out;
}

/**
 * Whether the party sees the level's creature (actor 1, the one that wanders it) where it stands: where the view could
 * show it with a light (creatureSight), or in the dark on one of the eight round the party, felt for as they are
 * (feltCells).
 */
export function creatureSeen(g: Game): boolean {
  const s = g.s;
  const a = s.actors[1];
  if (a.x > 7 || a.y > 7 || a.b5 === 0xff) return false;
  if (inTheDark(g)) return Math.abs(((a.x - s.x + 4) & 7) - 4) <= 1 && Math.abs(((a.y - s.y + 4) & 7) - 4) <= 1;
  return creatureSight(g).some(([x, y]) => x === a.x && y === a.y);
}
