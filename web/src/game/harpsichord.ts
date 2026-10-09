/**
 * harpsichord.ts
 *
 * The harpsichord (TOWN_0e34, the number keys at one in 1988): a note for each of 1 to 9, and the tune that, played
 * through at Lord British's in his chamber, opens the way to the sandalwood box. 1988 took the notes as the number
 * keys, the player seated at it; the port also gives it a keyboard of its own (the port's), over the view - the d-pad
 * along nine keys, A to play one, B to get up - from Play or by walking into the harpsichord from any side. Each note
 * sounds as it is played, its number rising from its key and fading.
 *
 * And a help for one who knows the tune (the port's): where Lord Kenneth's lesson is among the clues heard - "the
 * first phrase goes 678 987 8767653" - a gold dot on the tune's next key, at Lord British's harpsichord alone, while
 * the way is still shut and the box not yet had.
 */

import type { Game } from './game.ts';
import { K, Pad, type HarpView } from './io.ts';
import { tileAt } from './world.ts';

/** The harpsichord's tile. */
export const HARPSICHORD_TILE = 0x8d;

/** Lord British's chamber, and the wall in it the tune opens (TOWN_0e34). */
const CHAMBER = { mapId: 0x11, level: 2, x: 0x11, y: 0xd };

/** Harpsichord state (D_2767): how far into the tune that opens the way in Lord British's castle. */
let tuneAt = 0;

/** The tune: thirteen notes, 1 to 9 (DATA.OVL D_275a). */
export const tune = (g: Game): number[] => [...g.data.bytes(0x275a, 0xd)];

/**
 * A note played (TOWN_0e34): heard, and the tune followed - on through it, or back to its start, or, at two of its
 * notes, back to where the same notes begin it again. True where it is played through at Lord British's, in his
 * chamber: the way is to open (openTheWay).
 */
export function strike(g: Game, note: number): boolean {
  const s = g.s;
  if (!g.soundOff) void g.sound.pulse(g.data.words(0x2746, 10)[note], 1, 4000, 20000, -4);
  const t = tune(g);
  if (t[tuneAt] === note) {
    tuneAt++;
    if (tuneAt === t.length) {
      tuneAt = 0;
      return s.mapId === CHAMBER.mapId && s.level === CHAMBER.level;
    }
  } else if (tuneAt === 0xa && note === 8) {
    tuneAt = 3;
  } else if (tuneAt === 0xb && note === 7) {
    tuneAt = 2;
  } else if (note === t[0]) {
    tuneAt = 1;
  } else {
    tuneAt = 0;
  }
  return false;
}

/** The tune played through at Lord British's: the wall of his chamber gives way, the ground shaking. */
export async function openTheWay(g: Game): Promise<void> {
  const { shakeScreen } = await import('./effects.ts');
  g.map[CHAMBER.y * 32 + CHAMBER.x] ^= 0xb;
  await shakeScreen(g);
  g.viewDirty = 1;
}

/** Whether a harpsichord stands beside the party (a side, not a corner): Play is offered, and walking into it plays. */
export function besideHarpsichord(g: Game): boolean {
  const s = g.s;
  return [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ].some(([dx, dy]) => tileAt(g, s.x + dx, s.y + dy) === HARPSICHORD_TILE);
}

/** Whether the tune is known: Lord Kenneth's lesson, its notes, among the clues heard (journal.ts). */
function knowsTune(g: Game): boolean {
  const notes = tune(g).join('');
  return g.notes.some((n) => n.text.replace(/[^0-9]/g, '').includes(notes));
}

/** Whether the chamber's wall is as the castle's file has it: the way not opened since the party came to the floor. */
function wayShut(g: Game): boolean {
  const s = g.s;
  const loc = g.data.locations[s.mapId - 1];
  if (!loc?.file) return false;
  const index = (loc.firstLevel ?? 0) + s.level;
  const file = g.data.files.get(loc.file);
  return file[index * 1024 + CHAMBER.y * 32 + CHAMBER.x] === g.map[CHAMBER.y * 32 + CHAMBER.x];
}

/**
 * The key the gold dot is on (0 to 8), or -1: the tune's next note, where the player knows the tune, at Lord British's
 * harpsichord, its way still shut and the sandalwood box not yet the party's.
 */
export function hintKey(g: Game): number {
  const s = g.s;
  if (s.mapId !== CHAMBER.mapId || s.level !== CHAMBER.level || s.sandalwoodBox !== 0) return -1;
  if (!wayShut(g) || !knowsTune(g)) return -1;
  return tune(g)[tuneAt] - 1;
}

/** The number keys, 1 to 9, kept as themselves by the menus' keys (a keyboard read as a controller too). */
const DIGITS = [0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];

/**
 * The harpsichord's keyboard (the port's): in a box in the middle of the view, its nine keys drawn over it by the
 * screen (Draw.harpsichord) - the bar moved along them, A playing the key under it (or a number key its own), B
 * leaving. Played through at Lord British's, it closes of itself and the way opens.
 */
export async function playHarpsichord(g: Game): Promise<number> {
  const { box, restoreView } = await import('./menu.ts');
  const { menuKey, PAUSED } = await import('./input.ts');
  const now = (): number => g.p.now?.() ?? 0;
  const frame = (): HarpView => {
    box(g, 'Harpsichord', 12, 6);
    const w = g.text.win;
    // The box's lines under its title: the keys' place, in EGA pixels.
    return {
      x: w.left * 8,
      y: (w.top + 2) * 8,
      w: (w.right - w.left + 1) * 8,
      h: (w.bottom - w.top - 1) * 8,
      at: 4,
      dot: -1,
      pressed: null,
      pops: [],
    };
  };
  let view = frame();
  let opened = false;
  // The music paused while the keyboard is up, its notes heard alone; on again (where it is on) when it closes.
  g.sound.setHeld('harpsichord', true);
  try {
    for (;;) {
      view = { ...view, dot: hintKey(g), pops: view.pops.filter((p) => now() - p.t < 1000) };
      g.draw.harpsichord?.(view);
      const k = await menuKey(g, DIGITS);
      if (k === PAUSED) {
        view = { ...frame(), at: view.at };
        continue;
      }
      let key = -1;
      if (k === K.Left) view = { ...view, at: (view.at + 8) % 9 };
      else if (k === K.Right) view = { ...view, at: (view.at + 1) % 9 };
      else if (k === Pad.A || k === K.Enter) key = view.at;
      else if (k >= 0x31 && k <= 0x39) key = k - 0x31;
      else if (k === Pad.B || k === K.Escape) break;
      if (key < 0) continue;
      const t = now();
      view = { ...view, at: key, pressed: { key, t }, pops: [...view.pops, { key, t }] };
      if (strike(g, key + 1)) {
        opened = true;
        break;
      }
    }
  } finally {
    g.sound.setHeld('harpsichord', false);
    g.draw.harpsichord?.(null);
    await restoreView(g);
  }
  if (opened) await openTheWay(g);
  return 0;
}
