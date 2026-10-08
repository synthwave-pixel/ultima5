/**
 * characters.ts
 *
 * The characters kept on this machine (the port's): each an id, under which their saves and their settings are kept
 * in the browser's local storage (storage.ts, settings.ts), and the one in play this session. Who each character is
 * - their name, where they are, when they last saved - is read from their saves, not kept twice here.
 */

/**
 * The most characters kept on one machine: eight, each up to eight saves, sit well within a browser's few megabytes of
 * local storage - more, and their saves begin to crowd each other out. Saves from before characters are shared out
 * whatever their number; only a new character (made, or imported) waits for room.
 */
export const MAX_CHARACTERS = 8;

/** Every character's id, in the order they were made: `{ version: 1, ids }`. */
export const CHARACTERS_KEY = 'ultima5.characters';

/** Where something of character `id`'s is kept: "save", "saves", "settings" ("ultima5.char.k3x9q2.save"). */
export const charKey = (id: string, what: string): string => `ultima5.char.${id}.${what}`;

/** The character in play, or about to be: chosen at the title, made, or (storage.ts currentCharacter) the latest. */
let chosen: string | null = null;

/** Characters made this session: theirs to save under though the list could not be written (storage full). */
const made = new Set<string>();

/** The ids on the list, in the order made; none where it is missing or will not read. */
function listed(): string[] {
  try {
    const d = JSON.parse(globalThis.localStorage?.getItem(CHARACTERS_KEY) ?? '') as { ids?: unknown };
    return Array.isArray(d.ids) ? d.ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  } catch {
    return [];
  }
}

/** The ids of every last save kept, found by looking through the storage itself (where it can be looked through). */
function found(): string[] {
  const out: string[] = [];
  try {
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.key !== 'function' || typeof ls.length !== 'number') return out;
    for (let i = 0; i < ls.length; i++) {
      const m = /^ultima5\.char\.([a-z0-9]+)\.save$/.exec(ls.key(i) ?? '');
      if (m) out.push(m[1]);
    }
  } catch {
    /* the list alone, then */
  }
  return out;
}

/**
 * Every character's id: the list's, and any whose saves are kept but who are not on it - a list damaged, or one that
 * could not be written as they were made - so that no one's saves are ever out of reach. None with no storage.
 */
export function characterIds(): string[] {
  const ids = listed();
  for (const id of found()) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Whether there is a list of characters at all (none: a machine from before them, or a fresh one). */
export function haveCharacterList(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHARACTERS_KEY) != null;
  } catch {
    return false;
  }
}

/** The list written; false where it could not be. */
export function writeCharacterIds(ids: string[]): boolean {
  try {
    globalThis.localStorage?.setItem(CHARACTERS_KEY, JSON.stringify({ version: 1, ids }));
    return true;
  } catch {
    return false;
  }
}

/** A new id, unlike any in `taken`. */
export function freshId(taken: string[]): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 10);
    if (id.length >= 6 && !taken.includes(id)) return id;
  }
}

/**
 * A character added to the list, with nothing yet kept under them: their id - theirs to save under this session
 * though the list could not be written (their first save then puts them in reach: characterIds).
 */
export function newCharacter(): string {
  const ids = characterIds();
  const id = freshId(ids);
  made.add(id);
  writeCharacterIds([...ids, id]);
  return id;
}

/** Character `id` the one in play (null: none chosen, the latest stands for it). */
export function chooseCharacter(id: string | null): void {
  chosen = id;
}

/** The character chosen, where they are still kept (or were made this session); else null. */
export function chosenCharacter(): string | null {
  return chosen !== null && (made.has(chosen) || characterIds().includes(chosen)) ? chosen : null;
}

/** Character `id` gone: no longer one made this session (storage.ts deleteCharacter). */
export function forgetMade(id: string): void {
  made.delete(id);
}
