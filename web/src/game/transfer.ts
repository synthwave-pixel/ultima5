/**
 * transfer.ts
 *
 * A game carried between browsers, devices and the apps (the ultima3 port's Export and Import): a character's
 * saved game as its JSON text (storage.ts), with their settings beside it, out to the clipboard or a file and back in
 * from either. Where it goes and where it comes from are choices on the screen, and whose it is asked about there
 * too - no box to type in - so a controller does it all. The page does the carrying (GameHooks.transfer;
 * ui/pageHooks.ts).
 */

import { charKey, chooseCharacter, MAX_CHARACTERS, newCharacter } from './characters.ts';
import type { Game } from './game.ts';
import { choose, showText, wrap } from './menu.ts';
import { loadOptions, normaliseOptions, saveOptions, type Options } from './settings.ts';
import {
  avatarName,
  characters,
  currentCharacter,
  deleteCharacter,
  localSave,
  parseSave,
  roomForCharacter,
  serialize,
  type Character,
  type SaveData,
} from './storage.ts';

/** What the page can carry a game's text through. Each throws where the page may not. */
export interface Transfer {
  /** Onto the clipboard. */
  copy(text: string): Promise<void>;
  /** Off the clipboard. */
  paste(): Promise<string>;
  /** The page's own box to paste into, where the clipboard cannot be read: its text, or null. */
  pasteBox?(): Promise<string | null>;
  /**
   * Saved as a file, offered as `name`: the name it was saved by (the Android app's picker lets the player change it),
   * or null when they chose no place for it. Absent where no file can be written.
   */
  save?: ((text: string, name: string) => Promise<string | null>) | undefined;
  /** A file the player picks, read; '' when they pick none. */
  open(): Promise<string>;
}

/**
 * JSON in 7-bit ASCII: every other letter written as its \uXXXX escape, which JSON reads back as the letter. An exported
 * game goes through mail, chat and clipboards that may not keep anything else whole.
 */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * An exported game's text as it came back, put right where it was handled on the way: an export is 7-bit ASCII on one
 * line, so what else is in it came in transit - lines broken (JSON writes none of its own, and base64 reads through
 * them), quotes made curly, spaces made unbreakable, a byte-order mark or zero-width letters put in - and is undone.
 */
export function mendImport(text: string): string {
  return text
    .replace(/[\r\n\u2028\u2029\ufeff\u200b-\u200d\u2060]/g, '')
    .replace(/[\u201c\u201d\u201e\u201f\u2033\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim();
}

/**
 * An exported game taken in: as it came, where it reads - an export from before they were ASCII may have curly quotes
 * of its own in its journal - or else mended of what transit did to it (mendImport). Throws, as parseSave, where
 * neither will do.
 */
export function readImport(text: string): Exported {
  try {
    return parseSave(text);
  } catch (e) {
    try {
      return parseSave(mendImport(text));
    } catch {
      throw e;
    }
  }
}

/** An exported game: the save, and the settings of the character it is (older files have none). */
type Exported = SaveData & { settings?: Partial<Options> };

/**
 * The game to export: the one in play, or at the title character `id`'s saved one (the current character's with
 * none named: the newest that reads, where the last will not), each with their settings; null if there is none.
 */
export function exportText(g: Game, id: string | null = null): string | null {
  if (g.inPlay) return asciiJson({ ...serialize(g), settings: g.options });
  const who = id ?? currentCharacter();
  const saved = who === null ? null : (characters().find((c) => c.id === who)?.data ?? null);
  if (!saved) return null;
  let settings: Partial<Options> | undefined;
  try {
    const raw = localStorage.getItem(charKey(who!, 'settings'));
    if (raw) settings = JSON.parse(raw) as Partial<Options>;
  } catch {
    /* without them */
  }
  return asciiJson(settings ? { ...saved, settings } : saved);
}

/**
 * The exported file's name: the game, whose, and when, to the minute ("ultima5-Shalom-20260926-1435.json"; with no
 * name, "ultima5-20260926-1435.json").
 */
export function exportName(when = new Date(), who = ''): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const day = `${when.getFullYear()}${two(when.getMonth() + 1)}${two(when.getDate())}`;
  const name = who.replace(/[^A-Za-z0-9]/g, '');
  return `ultima5-${name ? `${name}-` : ''}${day}-${two(when.getHours())}${two(when.getMinutes())}.json`;
}

/** A character, as a list of them names each: the Avatar's name ("Shalom"). */
const nameOf = (c: Character): string => avatarName(c.data) || 'The nameless';

const say = async (g: Game, title: string, text: string): Promise<void> => void (await showText(g, title, wrap(text)));

/** Export: the game, to the clipboard or a file. */
export async function exportGame(g: Game): Promise<void> {
  const t = g.hooks.transfer;
  if (!t) return;
  // At the title, with more than one character: whose, first.
  let id: string | null = null;
  const all = g.inPlay ? [] : characters();
  if (all.length > 1) {
    const i = await choose(
      g,
      'Export whose game?',
      all.map((c) => ({ label: nameOf(c) })),
      0,
      true,
    );
    if (i < 0) return;
    id = all[i].id;
  }
  const text = exportText(g, id);
  if (!text) return say(g, 'Export', 'There is no saved game to export.');
  const fileName = exportName(new Date(), avatarName(parseSave(text)));
  const where = await choose(
    g,
    'Export',
    [
      { label: 'To the clipboard', note: 'To paste into Import on another browser or device.' },
      ...(t.save ? [{ label: 'To a file', note: `Saved as ${fileName}.` }] : []),
    ],
    0,
    true,
  );
  if (where === 0) {
    try {
      await t.copy(text);
      await say(g, 'Export', 'The game is copied to the clipboard.');
    } catch {
      await say(g, 'Export', 'The clipboard is not available here.');
    }
  } else if (where === 1 && t.save) {
    try {
      const name = await t.save(text, fileName);
      if (name !== null) await say(g, 'Export', `The game is saved as ${name}.`); // null: no place chosen
    } catch {
      await say(g, 'Export', 'A file could not be saved here.');
    }
  }
}

/**
 * Import: a game from the clipboard or a file, checked, and kept once the player says so - a new character, or, where
 * one of the same name is kept, in their game's place if the player would rather. True if it was: the page is then
 * loaded again, to start from the title with it.
 */
export async function importGame(g: Game): Promise<boolean> {
  const t = g.hooks.transfer;
  if (!t) return false;
  const from = await choose(g, 'Import', [{ label: 'From the clipboard' }, { label: 'From a file' }], 0, true);
  let text: string | null;
  if (from === 0) {
    try {
      text = (await t.paste()).trim();
    } catch {
      // The clipboard not to be read here (a browser that will not, an app's web view): the page's box to paste into.
      if (!t.pasteBox) {
        await say(g, 'Import', 'The clipboard cannot be read here.');
        return false;
      }
      text = (await t.pasteBox())?.trim() ?? null;
      if (text === null) return false;
    }
    if (!text) {
      await say(g, 'Import', 'The clipboard is empty.');
      return false;
    }
  } else if (from === 1) {
    try {
      text = (await t.open()).trim();
    } catch {
      await say(g, 'Import', 'The file could not be read.');
      return false;
    }
    if (!text) return false; // none picked
  } else return false;
  let file: Exported;
  try {
    file = readImport(text);
  } catch (e) {
    const why = e instanceof SyntaxError ? 'it is not a saved game' : (e as Error).message;
    await say(g, 'Import', `That will not do: ${why}.`);
    return false;
  }
  const { settings: sent, ...save } = file;
  // The settings of a game exported before the mixer say Music and Sound FX in the old way: put in today's words first.
  const settings = sent && normaliseOptions(sent);
  const name = avatarName(save) || 'The nameless';
  const same = characters().find((c) => avatarName(c.data) === avatarName(save));
  // A new character only where there is room for one (MAX_CHARACTERS); a namesake's place may always be taken.
  const room = roomForCharacter();
  if (!same && !room) {
    await say(g, 'Import', `${MAX_CHARACTERS} characters are kept, all there is room for: delete one to import ${name}.`);
    return false;
  }
  const lines: { label: string; note: string; act: 'replace' | 'add' | null }[] = [
    ...(same
      ? [{ label: `Replace ${name}'s game`, note: `${name}'s game is kept among their earlier saves.`, act: 'replace' as const }]
      : []),
    ...(room
      ? [
          {
            label: same ? 'Keep both' : `Add ${name}`,
            note: `${name} is added as ${same ? 'another' : 'a'} character.`,
            act: 'add' as const,
          },
        ]
      : []),
    { label: 'Cancel', note: 'Nothing changes.', act: null },
  ];
  const answer = await choose(
    g,
    'Import?',
    lines.map(({ label, note }) => ({ label, note })),
    lines.length - 1,
    true,
  );
  const act = lines[answer]?.act ?? null;
  if (act === null) return false;
  const replacing = act === 'replace';
  // Kept as any save is (storage.ts): read back before it counts - in a new character's keeping, with the file's
  // settings or a copy of those in use; or in the namesake's, the game it replaces kept among their earlier saves.
  const was = currentCharacter();
  const id = replacing && same ? same.id : newCharacter();
  chooseCharacter(id);
  if (replacing && settings) saveOptions({ ...loadOptions(), ...settings });
  else if (!replacing) saveOptions({ ...loadOptions(), ...g.options, ...settings });
  if (!localSave.put(JSON.stringify(save))) {
    if (!replacing) deleteCharacter(id);
    chooseCharacter(was);
    await say(g, 'Import', 'The game could not be stored here.');
    return false;
  }
  return true;
}
