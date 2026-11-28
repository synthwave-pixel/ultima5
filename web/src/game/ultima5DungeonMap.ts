/**
 * ultima5DungeonMap.ts
 *
 * Ultima V's dungeon as the dungeon map reads it (dungeonMap.ts DungeonMapSource): what each of DUNGEON.DAT's cells is
 * (kindOf) and how the Standard look draws it (cellLook), the level's creature where the party sees it (fog.ts
 * creatureSeen), the record of what it has seen (Fog), the dark (fog.ts inTheDark), the party's leader and the panel.
 * The reads dungeonMap.ts made itself before it took any game.
 */

import { Colour, DUNGEON_TINTS, OWN_COLOURS, OWN_ROCK_LIGHT } from '../ui/colours.ts';
import { FIELD_COLOURS, passable, type CellLook, type DungeonMapSource, type Kind, type MapLevel } from './dungeonMap.ts';
import { creatureSeen, inTheDark } from './fog.ts';
import { compactPanel } from './frame.ts';
import type { Game } from './game.ts';
import { A, T } from './tiles.ts';
import { creatureFrame, partyFigures } from './world.ts';
import { actor } from './actors.ts';

/** The dungeon view's rectangle on the screen (DUNGEON_1a90 fills it). */
const VIEW = { x1: 0x10, y1: 0x0e, x2: 0xaf, y2: 0xb2 };

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

/**
 * How a cell of `kind` (a field's colour its cell's low bits, `field`) is drawn in the look's tiles (STANDS), one over another - each with its tint, the rock's Remastered's
 * dungeon light - and a box of an EGA colour over its middle where the original drew one (a pit, a field): the Enhanced
 * map's and the maps' page's alike (interiorMap.ts dungeonPicture).
 */
export function cellLook(g: Game, kind: Kind, field = 0): CellLook {
  const dungeon = g.s.mapId - 0x20;
  // The dungeon's light, Remastered's own: every other look's wall as its look draws it.
  // Hythloth's (OWN_COLOURS) its own red rock's.
  const lit = OWN_COLOURS.includes(dungeon) ? OWN_ROCK_LIGHT : DUNGEON_TINTS[dungeon >= 1 && dungeon <= 8 ? dungeon : 0];
  const light = g.options.tiles === 'modern-pc' ? lit : undefined;
  if (kind === 'rock' || kind === 'rubble') {
    const wall = light === undefined ? { tile: T.Wall } : { tile: T.Wall, tint: light };
    // Rubble: remains or a caved in passage over the rock, as the dungeon has them (Save.dungeonLook); a stalactite,
    // the rock alone.
    const look = g.s.dungeonLook & 0xf;
    return { tiles: kind === 'rubble' && look !== 1 ? [wall, { tile: look === 2 ? COLLAPSED : BONES }] : [wall] };
  }
  // The passage: cobbles, and what stands in it over them - a pit the original's black box, a field its colour.
  const tiles = [{ tile: COBBLES }];
  if (kind === 'fountain') return { tiles: [...tiles, { tile: g.cycles.shown[T.Fountain] }] };
  if (kind === 'pit') return { tiles, box: Colour.black };
  if (kind === 'field') return { tiles, box: FIELD_COLOURS[field & 3] + 8 };
  return { tiles: [...tiles, ...(STANDS[kind] ?? []).map((tile) => ({ tile }))] };
}

/** The Standard tile of each dungeon creature (MON0-7.16), for looks that draw it as its figure: the view, the map. */
export const DUNGEON_CREATURES = [0x190, 0x194, 0x198, 0x19c, 0x1a0, 0x1a4, 0x1b0, 0x1ac];

/** A cell of the party's level as the save holds it (DUNGEON_0000 cellIndex). */
const cellAt = (g: Game, x: number, y: number): number => g.s.dungeon[g.s.level * 0x40 + (y & 7) * 8 + (x & 7)];

/** Ultima V's game as the dungeon map reads it; Game sets it (dungeonMap.ts useDungeonMap). */
export function ultima5DungeonMap(g: Game): DungeonMapSource {
  const level: MapLevel = {
    get scene() {
      return `${g.s.mapId}:${g.s.level}`;
    },
    get x() {
      return g.s.x;
    },
    get y() {
      return g.s.y;
    },
    get facing() {
      return g.s.facing;
    },
    kind: (x, y) => kindOf(cellAt(g, x, y)),
    // The cell itself: a field's colour its low bits.
    detail: (x, y) => cellAt(g, x, y),
    // A hidden door, which once found the party walks through, joins the level up too.
    joins: (x, y) => (cellAt(g, x, y) & 0xf0) === 0xd0 || passable(kindOf(cellAt(g, x, y))),
    known: () => g.fog.placeSeen(g.s.mapId, g.s.level),
    get dark() {
      return inTheDark(g);
    },
    // The level's creature (actor 1), where the party sees it: its figure (MON0-7.16), walking.
    creatures: () => {
      if (!creatureSeen(g)) return [];
      const a = actor(g, 1);
      return [{ x: a.x, y: a.y, tile: DUNGEON_CREATURES[a.tile & 7] + creatureFrame(), mover: 'a1' }];
    },
    look: (kind, detail) => cellLook(g, kind, detail),
  };
  return {
    view: VIEW,
    standard: () => g.options.tileSet === 'standard',
    compact: () => compactPanel(g),
    leader: () => partyFigures(g)[0]?.tile ?? null,
    level: () => (g.inDungeon ? level : null),
  };
}
