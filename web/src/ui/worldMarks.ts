/**
 * worldMarks.ts
 *
 * The marks on a world's map, any game's: six by six pixels, three
 * squares to a side, one for each place worth walking to. What a mark is
 * drawn as says what sort of place it is - walls for a towne, towers for
 * a castle, a gable for a hut, a cave mouth for a dungeon, an altar for a
 * shrine, a ring for a moongate - and the map calls it by its name once
 * the party has learnt it, till then by what it looks like: "Towne?".
 *
 * Here are what a mark is, how marks crowded together are eased apart and
 * a ridden gate named, and how the d-pad steps between them on a world
 * that wraps. Which places a game has, and where, is the game's own
 * (Ultima V's: mapMarks.ts marksFor). Nothing here reads a game's files.
 */

export type MarkKind = 'towne' | 'castle' | 'village' | 'hut' | 'dungeon' | 'shrine' | 'moongate' | 'gate-known' | 'region' | 'party';

export interface Mark {
  x: number;
  y: number;
  kind: MarkKind;
  /** A gate the party has ridden: where it put them. */
  leadsTo?: [number, number] | undefined;
  /** What to print when the player asks, or undefined for a place with no name of its own. */
  name?: string;
  /** The place's key in the game's record of names learnt (Ultima V's: "place:<id>", "shrine:<n>"). None: always named. */
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
  // Where the party stands: no ink of its own, the map draws the party there (worldMapView.ts).
  party: ['......', '......', '......', '......', '......', '......'],
};

export const GLYPH_SIZE = 6;

/** What the map calls a mark: its name where the party knows it (`knows`), else its hint. */
export function labelOf(mark: Mark, knows: (key: string) => boolean): string {
  return mark.key === undefined || knows(mark.key) ? (mark.name ?? '') : (mark.hint ?? '');
}

/**
 * A gate the party has ridden is named by where it led: the nearest
 * place to its far end, if there is one close by, so the gate table
 * writes itself one trip at a time.
 */
export function named(marks: Mark[]): void {
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

/**
 * Marks three squares wide overlap where places crowd together (Britain
 * and the castle, the huts on the Verity isle), so any that touch are
 * eased apart along the line between them, the first left where it is.
 */
export function spread(marks: Mark[]): Mark[] {
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

/**
 * Where a map opened on a place (`focus`, a mark's key: the journal's View) opens: the first of the worlds (each its
 * marks) that has it, and which of its marks it is; null for no focus or where no world has it (worldMapView.ts).
 */
export function focusOf(worlds: readonly (readonly Mark[])[], focus: string): { world: number; at: number } | null {
  if (!focus) return null;
  const world = worlds.findIndex((list) => list.some((m) => m.key === focus));
  if (world < 0) return null;
  return { world, at: worlds[world].findIndex((m) => m.key === focus) };
}
