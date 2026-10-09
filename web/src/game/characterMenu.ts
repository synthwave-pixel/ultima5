/**
 * characterMenu.ts
 *
 * The title's choice of character (the port's), where more than one is kept: Journey Onward's list of them, the
 * newest last save first, each by name and level, where they are and when they last saved - and at its foot, Delete a
 * character..., asked twice. And the title's Manage Saves: Export and Import saved game, Delete Character, and Remove
 * game files.
 */

import type { Game } from './game.ts';
import { choose, confirm, transferLines, type Item, type Setting } from './menu.ts';
import { Save } from './save.ts';
import { avatarName, characters, deleteCharacter, fromBase64, savedWhen, savedWhere, type Character } from './storage.ts';

/** How many lines of the list each character takes. */
const LINES = 3;

/** A character's name, or what stands for none. */
const nameOf = (c: Character): string => avatarName(c.data) || 'The nameless';

/** A character's lines: their name and level, to be chosen; where they are and when they saved, in grey. */
function linesOf(g: Game, c: Character): Item[] {
  const level = new Save(fromBase64(c.data.save)).members[0].level;
  const where = savedWhere(g, c.data);
  return [
    { label: `${nameOf(c)}, level ${level}` },
    { label: where.charAt(0).toUpperCase() + where.slice(1), enabled: false },
    { label: savedWhen(c.data.written), enabled: false },
  ];
}

/** A box drawn after the first has the title put back under it first (`redraw`), so none shows round a smaller one. */
function boxes(redraw: () => Promise<void>): () => Promise<void> {
  let first = true;
  return async () => {
    if (!first) await redraw();
    first = false;
  };
}

/**
 * Whom to delete, from the characters `all` (one or many), and asked again by name, No first; deleted with all their
 * saves if Yes. True if one was. `box` readies the screen for each box.
 */
async function deleteOne(g: Game, all: Character[], box: () => Promise<void>): Promise<boolean> {
  await box();
  const d = await choose(
    g,
    'Delete whom?',
    all.flatMap((c) => linesOf(g, c)),
    0,
    true,
  );
  if (d < 0) return false;
  const c = all[Math.floor(d / LINES)];
  await box();
  if (!(await confirm(g, `Delete ${nameOf(c)} and all their saves?`, true))) return false;
  deleteCharacter(c.id);
  return true;
}

/**
 * The title's Delete Character: whom, from every character kept - the only one too, which the picker (two or more)
 * cannot offer - asked twice. True if one was deleted. `redraw` as pickCharacter's.
 */
export async function deleteCharacterMenu(g: Game, redraw: () => Promise<void>): Promise<boolean> {
  const all = characters();
  return all.length > 0 && deleteOne(g, all, boxes(redraw));
}

/**
 * The character to journey with, chosen from those kept - any deleted on the way (Delete a character..., its last
 * line) - or null for B, or where a deletion has left one or none (the title, to go on from there). In a box of its
 * own over the title's picture, which `redraw` puts back under each box after the first.
 */
export async function pickCharacter(g: Game, redraw: () => Promise<void>): Promise<Character | null> {
  const box = boxes(redraw);
  for (;;) {
    const all = characters();
    if (all.length < 2) return null;
    await box();
    const items: Item[] = [...all.flatMap((c) => linesOf(g, c)), { label: '', enabled: false }, { label: 'Delete a character...' }];
    const i = await choose(g, 'Whose journey?', items, 0, true);
    if (i === -2) continue; // to be drawn anew
    if (i < 0) return null;
    if (i < all.length * LINES) return all[Math.floor(i / LINES)];
    await deleteOne(g, all, box);
  }
}

/**
 * The title's Manage Saves (the port's): Export and Import saved game (menu.ts transferLines), Delete Character, and
 * Remove game files, in a box of its own over the title's picture, which `redraw` puts back under each box after the
 * first. Export and Delete want a character kept; Import does not, so a new machine's first game can come in here.
 * Returns 'deleted' where a character went (the title then forgets whose game it had), 'left' where the game is to be
 * taken up anew (an import, the files removed), else null.
 */
export async function manageSavesMenu(g: Game, redraw: () => Promise<void>): Promise<'deleted' | 'left' | null> {
  const box = boxes(redraw);
  let deleted = false;
  let at = 0;
  for (;;) {
    const kept = characters().length > 0;
    const [exporting, importing] = transferLines(g);
    const lines: Setting[] = [
      // Notes short enough for the box's three lines (Settings' are wider).
      { ...exporting, note: 'A game, to the clipboard or a file.', enabled: exporting.enabled !== false && kept },
      { ...importing, note: 'A game from the clipboard or a file.' },
      {
        label: 'Delete Character',
        key: 0x44,
        note: 'A character, and all their saves.',
        enabled: kept,
        act: async () => {
          if (await deleteCharacterMenu(g, redraw)) deleted = true;
        },
      },
      {
        label: 'Remove game files',
        key: 0x52,
        note: 'Forget the game files. Saves are kept.',
        enabled: !!g.hooks.uninstall,
        act: async () => {
          if (
            !(await confirm(
              g,
              'Forget the installed Ultima V files? The saved games are kept; the files must be installed again to play.',
              true,
            ))
          )
            return;
          await g.hooks.uninstall?.();
          return 0;
        },
      },
    ];
    await box();
    at = await choose(g, 'Manage Saves', lines, at, true);
    if (at === -2) continue; // to be drawn anew
    if (at < 0) return deleted ? 'deleted' : null;
    if (typeof (await lines[at].act?.()) === 'number') return 'left';
  }
}
