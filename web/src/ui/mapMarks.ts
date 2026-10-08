/**
 * mapMarks.ts
 *
 * The marks on the map: six by six pixels, three squares to a side, one
 * for each place worth walking to. What a mark is drawn as says what
 * sort of place it is - walls for a towne, towers for a castle, a gable
 * for a hut, a cave mouth for a dungeon, an altar for a shrine, a ring
 * for a moongate - and its name comes from the player's own files, told
 * once the party has been inside or heard it named (Fog.named); till then
 * it is called what it looks like: "Towne?".
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

export type MarkKind = 'towne' | 'castle' | 'village' | 'hut' | 'dungeon' | 'shrine' | 'moongate' | 'gate-known' | 'region' | 'party';

/** What the record of the party's travels can say about a gate. */
export interface Gates {
  gateLeadsTo(x: number, y: number): [number, number] | null;
}

export interface Mark {
  x: number;
  y: number;
  kind: MarkKind;
  /** A gate the party has ridden: where it put them. */
  leadsTo?: [number, number] | undefined;
  /** What to print when the player asks, or undefined for a place with no name of its own. */
  name?: string;
  /** The place's key in the record of names learnt (Fog.named): "place:<id>", "shrine:<n>". None: always named. */
  key?: string;
  /** What it is called till its name is learnt: what the cloth map shows of it ("Towne?"). */
  hint?: string;
  /** Whether the mapmaker knew of it: drawn on the paper before the party ever goes there. */
  onPaper: boolean;
}

/** Six rows of six, `#` where the ink goes. */
export const GLYPHS: Record<MarkKind, string[]> = {
  towne: ['#.#.#.', '######', '#....#', '#.##.#', '#....#', '######'],
  castle: ['#.##.#', '#.##.#', '######', '#....#', '#.##.#', '######'],
  village: ['..##..', '.####.', '######', '.#..#.', '.#..#.', '.####.'],
  hut: ['..##..', '.####.', '######', '..##..', '..##..', '..##..'],
  dungeon: ['.####.', '######', '##..##', '#....#', '#....#', '#....#'],
  shrine: ['..##..', '.#..#.', '..##..', '..##..', '.####.', '######'],
  moongate: ['..##..', '.#..#.', '#....#', '#....#', '.#..#.', '..##..'],
  // A gate the party has ridden: the ring filled, so a glance tells the known from the untried.
  'gate-known': ['..##..', '.####.', '######', '######', '.####.', '..##..'],
  // A name on the cloth map for the land itself: a cartographer's cross, where its runes are written.
  region: ['#....#', '.#..#.', '..##..', '..##..', '.#..#.', '#....#'],
  // Where the party stands: no ink of its own, the map draws the party there (mapView.ts).
  party: ['......', '......', '......', '......', '......', '......'],
};

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

export const GLYPH_SIZE = 6;

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

/** What the map calls a mark: its name where the party knows it (`knows`, Fog.knowsName), else its hint. */
export function labelOf(mark: Mark, knows: (key: string) => boolean): string {
  return mark.key === undefined || knows(mark.key) ? (mark.name ?? '') : (mark.hint ?? '');
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

/**
 * A gate the party has ridden is named by where it led: the nearest
 * place to its far end, if there is one close by, so the gate table
 * writes itself one trip at a time.
 */
function named(marks: Mark[]): void {
  for (const gate of marks) {
    if (!gate.leadsTo) continue;
    const [tx, ty] = gate.leadsTo;
    let near: Mark | null = null;
    let best = 9;
    for (const m of marks) {
      if (m === gate || m.kind === 'moongate' || m.kind === 'gate-known' || m.kind === 'region' || !m.name) continue;
      const d = Math.abs(m.x - tx) + Math.abs(m.y - ty);
      if (d < best) {
        best = d;
        near = m;
      }
    }
    if (!near?.name) continue;
    // Named by the place's name where the party knows it (its key), else by what the place looks like.
    const looks = (near.hint ?? '').replace(/\?$/, '').toLowerCase();
    if (near.key !== undefined) {
      gate.key = near.key;
      gate.hint = `${gate.name} to ${/^[aeiou]/.test(looks) ? 'an' : 'a'} ${looks}`;
    }
    gate.name = `${gate.name} to ${near.name}`;
  }
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

/**
 * Marks three squares wide overlap where places crowd together (Britain
 * and the castle, the huts on the Verity isle), so any that touch are
 * eased apart along the line between them, the first left where it is.
 */
function spread(marks: Mark[]): Mark[] {
  const near = 3;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const dx = marks[j].x - marks[i].x;
        const dy = marks[j].y - marks[i].y;
        if (Math.abs(dx) >= near || Math.abs(dy) >= near) continue;
        marks[j].x += dx === 0 ? (j % 2 ? 1 : -1) : Math.sign(dx);
        marks[j].y += dy === 0 ? (j % 2 ? -1 : 1) : Math.sign(dy);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return marks;
}

/** The mark nearest (`x`, `y`), the world wrapping at `size`; -1 if there are none. */
export function nearestMark(marks: Mark[], x: number, y: number, size: number): number {
  let best = -1;
  let score = Infinity;
  marks.forEach((m, i) => {
    const dx = Math.min(Math.abs(m.x - x), size - Math.abs(m.x - x));
    const dy = Math.min(Math.abs(m.y - y), size - Math.abs(m.y - y));
    if (dx * dx + dy * dy < score) {
      score = dx * dx + dy * dy;
      best = i;
    }
  });
  return best;
}

/** An offset on a world that wraps, the shorter way round: -size/2 up to size/2. */
export const wrapped = (d: number, size: number): number => ((((d + size / 2) % size) + size) % size) - size / 2;

/**
 * The mark nearest `from` in a direction, among those given: the one whose angle is close and whose distance is least.
 * On a world of `size` squares a side, which wraps, the way round the edge is a way too.
 */
export function stepTo(marks: Mark[], from: number, dx: number, dy: number, size = 0): number {
  if (!marks.length) return -1;
  if (from < 0) return 0;
  const a = marks[from];
  let best = -1;
  let score = Infinity;
  for (let i = 0; i < marks.length; i++) {
    if (i === from) continue;
    const ox = size ? wrapped(marks[i].x - a.x, size) : marks[i].x - a.x;
    const oy = size ? wrapped(marks[i].y - a.y, size) : marks[i].y - a.y;
    const along = ox * dx + oy * dy;
    if (along <= 0) continue;
    const across = Math.abs(ox * dy - oy * dx);
    if (across > along * 1.2) continue; // outside the cone: that way lies another mark, not this one
    const d = along + across * 1.5;
    if (d < score) {
      score = d;
      best = i;
    }
  }
  return best === -1 ? from : best;
}
