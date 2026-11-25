/**
 * mapMarks.ts
 *
 * Ultima V's marks on the map (what a mark is: worldMarks.ts): one for
 * each place worth walking to, its name from the player's own files,
 * told once the party has been inside or heard it named (Fog.named);
 * till then it is called what it looks like: "Towne?".
 *
 * On Britannia's drawn map the marks the mapmaker knew are there from
 * the start, in brown ink, as the cloth map in the box drew them: a towne
 * stood there, not which towne. And the cloth map's names for the land
 * itself, in runes on it - its seas, isles, forests and plains - are
 * marks of their own, named from the start. The Underworld has no such
 * map, so nothing shows there until it is walked.
 */

import type { DataOvl } from '../data/dataOvl.ts';
import { readLocations, WORLD_SIZE } from '../data/maps.ts';
import { TILE_NAMES } from '../data/tileNames.ts';
import type { Save } from '../game/save.ts';
import { T } from '../game/tiles.ts';
import { named, spread, type Mark, type MarkKind } from './worldMarks.ts';

/** What the record of the party's travels can say about a gate. */
export interface Gates {
  gateLeadsTo(x: number, y: number): [number, number] | null;
}

/**
 * The cloth map's names for the land, as the runes on it read (a player's translation, the box's map beside it), each
 * at a square of what it names: the isle, the forest, the water.
 */
export const REGIONS: { name: string; x: number; y: number }[] = [
  { name: 'The Deep Forest', x: 52, y: 58 },
  { name: 'The High Steppes', x: 112, y: 52 },
  { name: 'Lost Hope Bay', x: 146, y: 48 },
  { name: 'Bloody Plains', x: 176, y: 56 },
  { name: 'The Drylands', x: 207, y: 45 },
  { name: 'Dagger Isle', x: 232, y: 62 },
  { name: "Serpent's Spine", x: 100, y: 74 },
  { name: 'Lock Lake', x: 128, y: 78 },
  { name: 'Lost River', x: 44, y: 93 },
  { name: 'Verity Isle', x: 232, y: 105 },
  { name: 'Britanny Bay', x: 100, y: 119 },
  { name: 'Spiritwood', x: 44, y: 136 },
  { name: 'Fens of the Dead', x: 96, y: 157 },
  { name: 'The Great Sea', x: 160, y: 190 },
  { name: 'Isle of the Avatar', x: 228, y: 203 },
  { name: 'Cape of Heroes', x: 102, y: 210 },
  { name: 'Valorian Isles', x: 33, y: 218 },
  { name: 'The Isle of Deeds', x: 140, y: 236 },
];

/** What the tile on a square makes the place there. */
function kindOf(tile: number): MarkKind {
  switch (tile) {
    case T.Towne:
      return 'towne';
    case T.Castle:
    case T.Keep:
    case T.CastleLB:
    case T.PalaceBlackthorn:
      return 'castle';
    case T.Village:
      return 'village';
    case T.Shrine:
      return 'shrine';
    case T.Cave:
    case T.Mine:
    case T.Dungeon:
      return 'dungeon';
    default:
      return 'hut';
  }
}

/**
 * Whether the cloth map in the box draws a place of this kind: its towns, castles, keeps, villages and lighthouses
 * (and its shrines and moongates, marked apart) - but no hut, and no dungeon's mouth. Those the party finds for itself.
 */
function onCloth(tile: number): boolean {
  return tile !== T.Hut && kindOf(tile) !== 'dungeon';
}

/** A name as a line is printed: BRITAIN becomes Britain. */
function titled(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Every mark for a world: the settlements and dungeons DATA.OVL lists,
 * the eight shrines from its tables, and the moongates where the save
 * says the moonstones lie - so a stone dug up and buried elsewhere moves
 * its ring.
 */
export function marksFor(ovl: DataOvl, save: Save, map: Uint8Array, underworld: boolean, gates?: Gates): Mark[] {
  const marks: Mark[] = [];
  const tileAt = (x: number, y: number): number => map[(y & 0xff) * WORLD_SIZE + (x & 0xff)];
  for (const loc of readLocations(ovl)) {
    const tile = tileAt(loc.x, loc.y);
    // A place belongs to the world whose map has its entrance on it.
    if (!isPlace(tile)) continue;
    marks.push({
      x: loc.x,
      y: loc.y,
      kind: kindOf(tile),
      name: titled(loc.name),
      key: `place:${loc.id}`,
      hint: `${titled(TILE_NAMES[tile] ?? '')}?`,
      onPaper: !underworld && onCloth(tile),
    });
  }
  const virtues = ovl.strings(0x1f4e, 8);
  const sx = ovl.bytes(0x1f6e, 8);
  const sy = ovl.bytes(0x1f76, 8);
  for (let i = 0; i < 8; i++) {
    if (tileAt(sx[i], sy[i]) !== T.Shrine) continue;
    marks.push({ x: sx[i], y: sy[i], kind: 'shrine', name: titled(virtues[i]), key: `shrine:${i}`, hint: 'Shrine?', onPaper: !underworld });
  }
  if (!underworld) {
    for (let i = 0; i < 8; i++) {
      if (save.moonstoneHeld[i] !== 0 || save.moonstoneZ[i] !== 0) continue; // carried, or buried elsewhere
      const x = save.moonstoneX[i];
      const y = save.moonstoneY[i];
      const led = gates?.gateLeadsTo(x, y) ?? null;
      marks.push({
        x,
        y,
        kind: led ? 'gate-known' : 'moongate',
        name: titled(TILE_NAMES[T.Moongate]),
        onPaper: true,
        leadsTo: led ?? undefined,
      });
    }
    for (const r of REGIONS) marks.push({ x: r.x, y: r.y, kind: 'region', name: r.name, onPaper: true });
  }
  named(marks);
  return spread(marks);
}

function isPlace(tile: number): boolean {
  return (
    tile === T.Towne ||
    tile === T.Castle ||
    tile === T.Keep ||
    tile === T.Village ||
    tile === T.Hut ||
    tile === T.Shrine ||
    tile === T.Cave ||
    tile === T.Mine ||
    tile === T.Dungeon ||
    tile === T.Lighthouse ||
    tile === T.Ruins ||
    tile === T.CastleLB ||
    tile === T.PalaceBlackthorn
  );
}
