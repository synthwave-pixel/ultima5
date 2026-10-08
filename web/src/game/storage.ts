/**
 * storage.ts
 *
 * The saved game as JSON (the ultima3 model): SAVED.GAM's block and the
 * two worlds' actor lists (SAVED.OOL), base64, beside JSON for what the
 * modern engine adds. Kept in the browser's local storage, each
 * character's apart (characters.ts): their last save in its own slot, and
 * the seven before it each in one of theirs, to go back to (localSave) -
 * eight saves for each of eight characters.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Fog, type FogData } from './fog.ts';
import { Vocabulary, type WordData } from './words.ts';
import { Game, type Note } from './game.ts';
import { Save, SAVE_SIZE } from './save.ts';
import { Win } from './frame.ts';
import { addressedAsLady, type Appearance, LADY, validAppearance } from './appearance.ts';
import { placeTitle } from './journal.ts';
import { SETTINGS_KEY } from './settings.ts';
import {
  characterIds,
  charKey,
  chooseCharacter,
  chosenCharacter,
  forgetMade,
  freshId,
  haveCharacterList,
  MAX_CHARACTERS,
  newCharacter,
  writeCharacterIds,
} from './characters.ts';

/** Before characters, the one last save, whoever's (migrated to a character's: characters.ts, migrate). */
export const SAVE_KEY = 'ultima5.save';
export const SAVE_VERSION = 1;
/** Before characters, the index of the saves before the last, each kept under SAVE_KEY and a number ("ultima5.save.12"). */
export const SAVES_KEY = 'ultima5.saves';
/** Before characters, how many saves before the last were kept. */
const OLD_EARLIER = 9;
/** How many saves before the last are kept: seven, eight saves in all (the virtues', and the characters' number). */
export const EARLIER = 7;

export interface SaveData {
  game: 'ultima5';
  version: number;
  /** SAVED.GAM, base64. */
  save: string;
  /** BRIT.OOL and UNDER.OOL, base64. */
  brit: string;
  under: string;
  /** When it was written (ms since 1970). */
  written: number;
  /** The journal's clues (the modern engine's; older saves have none). */
  notes?: Note[];
  /** The regalia worn, in their own slot (Game.regalia; older saves kept them in the lasting spell's). */
  regalia?: number;
  /** What has been seen of the worlds, the towns and the dungeons, run-length encoded (older saves have none). */
  fog?: FogData;
  /** The words the player has heard said, and whose answers they have had (older saves have none). */
  words?: WordData;
  /** False for a game not yet begun, whose first turn points to the Tips (older saves have none: begun). */
  tipsNudged?: boolean;
  /** The Avatar's appearance (appearance.ts; older saves have none: the default). */
  appearance?: Appearance;
  /** The companions' looks made at a mirror, by name (companions.ts; older saves have none: each as they begin). */
  companions?: Record<string, Appearance>;
  /** The day the old man last came to camp (Game.oldManDay; older saves have none: not yet). */
  oldManDay?: number;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function serialize(g: Game): SaveData {
  return {
    game: 'ultima5',
    version: SAVE_VERSION,
    save: toBase64(g.s.b),
    brit: toBase64(g.ool.brit),
    under: toBase64(g.ool.under),
    written: Date.now(),
    notes: g.notes,
    regalia: g.regalia,
    fog: g.fog.encode(),
    words: g.words.encode(),
    tipsNudged: g.tipsNudged,
    appearance: g.appearance,
    companions: Object.fromEntries(g.companionLooks),
    oldManDay: g.oldManDay,
  };
}

/** Parse and check a save; throws with the reason when it will not do. */
export function parseSave(text: string): SaveData {
  const d = JSON.parse(text) as Partial<SaveData>;
  if (d.game !== 'ultima5') throw new Error('not an Ultima V save');
  if (typeof d.version !== 'number' || d.version > SAVE_VERSION) throw new Error('a save from a newer version');
  if (typeof d.save !== 'string' || typeof d.brit !== 'string' || typeof d.under !== 'string') throw new Error('the save is incomplete');
  if (fromBase64(d.save).length !== SAVE_SIZE || fromBase64(d.brit).length !== 256 || fromBase64(d.under).length !== 256)
    throw new Error('the save is damaged');
  return d as SaveData;
}

/**
 * A saved game taken up again. What the player has mapped is theirs, not
 * the Avatar's, so the save's record is added to what is already known
 * rather than put in its place: going back to a save after a party wipe
 * does not unlearn the country walked since it was written. `fresh`: a
 * character taken up from the title, from nothing of anyone else's - the
 * maps and the words known begun anew before the save's are added.
 */
export function restore(g: Game, d: SaveData, fresh = false): void {
  if (fresh) {
    g.fog = new Fog();
    g.words = new Vocabulary();
  }
  g.s.b.set(fromBase64(d.save));
  g.ool.brit.set(fromBase64(d.brit));
  g.ool.under.set(fromBase64(d.under));
  g.notes = Array.isArray(d.notes) ? d.notes : [];
  // The regalia worn: their own slot, or - a save from before it - the spell's slot they shared, moved out of it.
  const s = g.s;
  if (typeof d.regalia === 'number') g.regalia = d.regalia;
  else if (s.icon === 0x0e || s.icon === 0x1c || s.icon === 0x1d) {
    g.regalia = s.icon;
    s.icon = s.protection = 0;
  } else g.regalia = 0;
  g.fog.merge(Fog.decode(d.fog));
  g.words.merge(Vocabulary.decode(d.words));
  g.tipsNudged = d.tipsNudged !== false;
  g.oldManDay = typeof d.oldManDay === 'number' && Number.isFinite(d.oldManDay) ? d.oldManDay : -1;
  g.appearance = validAppearance(d.appearance);
  const made = typeof d.companions === 'object' && d.companions !== null ? Object.entries(d.companions) : [];
  g.companionLooks = new Map(made.map(([name, look]) => [name, validAppearance(look)]));
  g.draw.avatar?.(g.appearance, addressedAsLady(g));
}

/**
 * The ultima3 port's autosave: the game saves itself at Journey onward
 * and whenever the party enters a place from outside - a towne, castle,
 * keep, hut or dungeon - or comes out of one (the doors within a place
 * save nothing), and says so. What is saved is always the party
 * outside, on the place's square: a town is as it will be found again, a
 * dungeon is never saved from within by itself (Save game keeps it there,
 * as 1988's Q did; Save and quit does not, menu.ts pauseMenu), and the
 * open country between places is left to Quit. Not while the party lies
 * dead, waiting on Lord British. True if it was saved: where it could not
 * be, the log says "Not saved!" in the place of "(saved)".
 */
export function autosave(g: Game): boolean {
  if (g.s.mapId !== 0) return false;
  let alive = false;
  for (let i = 0; i < g.s.partySize; i++) if (g.s.members[i].status !== 0x44) alive = true; // 'D'
  if (!alive || localSave.off) return false;
  const saved = localSave.write(g);
  // In the log, whatever window was being drawn in: coming back from "All is lost" to the last save, the screen's
  // was, and the note was printed over the frame's corner.
  const t = g.text;
  const was = t.current;
  t.select(Win.messages);
  g.print(saved ? '(saved)\n' : 'Not saved!\n');
  t.select(was);
  return saved;
}

/** The saved game's Avatar as the player made it, and whether addressed as Lady; null with no game saved. */
export function savedAvatar(): { look: Appearance; lady: boolean } | null {
  const saved = localSave.read();
  if (!saved) return null;
  return { look: validAppearance(saved.appearance), lady: new Save(fromBase64(saved.save)).members[0].gender === LADY };
}

/** A save kept: the key it is stored under, and the game. */
export interface Kept {
  key: string;
  data: SaveData;
}

/** The saves before the last, by key, newest first; `next` numbers the next one kept. */
interface Index {
  next: number;
  keys: string[];
}

/**
 * A save as it is kept: compressed (deflate, then base64 - ASCII, which every browser's storage keeps as it is), behind
 * a mark saying so. A heavy save - every map walked, every word heard, a full journal - is some 150K characters as
 * text and a fifth of that kept, so a character's eight saves crowd no one else's out. Saves kept before, as text, read
 * as they are.
 */
const PACKED = 'z1:';

/** A save's text, as it is to be kept. */
export function packSave(text: string): string {
  return PACKED + toBase64(deflateSync(strToU8(text), { level: 9 }));
}

/** A save as kept, as its text again: unpacked where it was packed (a save kept as text, as it is). Throws if damaged. */
export function unpackSave(kept: string): string {
  return kept.startsWith(PACKED) ? strFromU8(inflateSync(fromBase64(kept.slice(PACKED.length)))) : kept;
}

/** A save as kept, taken up, or null where there is none or it will not do (damaged, cut short). */
function parsed(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    return parseSave(unpackSave(text));
  } catch {
    return null;
  }
}

/** Character `id`'s last save's key; their earlier saves are kept under it and a number ("ultima5.char.k3x9q2.save.12"). */
const lastKey = (id: string): string => charKey(id, 'save');
/** Character `id`'s index of their earlier saves. */
const indexKey = (id: string): string => charKey(id, 'saves');

/** Where character `id`'s saves are kept (the current character's with none named): for the tests to look at. */
export function saveKeys(id = currentCharacter()): { last: string; index: string } | null {
  return id === null ? null : { last: lastKey(id), index: indexKey(id) };
}

/** An index of earlier saves, read from `key`: only keys under `prefix` (a save's own) are taken, `most` of them. */
function readIndexAt(key: string, prefix: string, most = EARLIER): Index {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? '') as Partial<Index>;
    const keys = Array.isArray(d.keys) ? d.keys.filter((k): k is string => typeof k === 'string' && k.startsWith(`${prefix}.`)) : [];
    return { next: typeof d.next === 'number' && d.next > 0 ? d.next : 1, keys: keys.slice(0, most) };
  } catch {
    return { next: 1, keys: [] };
  }
}

const readIndex = (id: string): Index => readIndexAt(indexKey(id), lastKey(id));

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to be done */
  }
}

/** Out of room, as the browsers say it (Firefox's older name and code with the rest). */
function full(e: unknown): boolean {
  const { name, code } = (e ?? {}) as { name?: string; code?: number };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

/** When the save under `key` was written; 0 where it will not read (let go first). */
function writtenAt(key: string): number {
  return parsed(localStorage.getItem(key))?.written ?? 0;
}

/**
 * The oldest of every character's earlier saves let go to make room - never `spare`, nor anyone's last save - and
 * its index written again (but for `writing`, the index about to be written anyway). Character `id`'s index is `ix`,
 * the one in hand, changed in place. False with none left to go.
 */
function evictOldest(id: string, ix: Index, spare: string | null, writing: string): boolean {
  let oldest: { owner: string; key: string; at: number } | null = null;
  for (const owner of characterIds()) {
    const keys = (owner === id ? ix : readIndex(owner)).keys.filter((k) => k !== spare);
    const key = keys[keys.length - 1]; // newest first: the last is the oldest
    if (key === undefined) continue;
    const at = writtenAt(key);
    if (oldest === null || at < oldest.at) oldest = { owner, key, at };
  }
  if (oldest === null) return false;
  forget(oldest.key);
  localSave.evicted++;
  const owned = oldest.owner === id ? ix : readIndex(oldest.owner);
  owned.keys.splice(owned.keys.indexOf(oldest.key), 1);
  if (indexKey(oldest.owner) !== writing) {
    try {
      localStorage.setItem(indexKey(oldest.owner), JSON.stringify(owned));
    } catch {
      /* the index is written again with the save, or names a save that is gone - passed over on reading */
    }
  }
  return true;
}

/**
 * `text` stored under `key` and read back the same. Where the storage is full, the oldest of the earlier saves - of
 * any character, character `id`'s index `ix` - goes to make room (never `spare`, the copy of the last save the new
 * one is to replace, nor anyone's last save), and it is tried again, until there are none left to go. Any other
 * failure (no storage here, a private window's) is final: nothing kept is let go for it.
 */
function store(key: string, text: () => string, id: string, ix: Index, spare: string | null = null): boolean {
  for (;;) {
    const want = text();
    try {
      localStorage.setItem(key, want);
    } catch (e) {
      if (!full(e) || !evictOldest(id, ix, spare, key)) return false;
      continue;
    }
    try {
      return localStorage.getItem(key) === want;
    } catch {
      return false;
    }
  }
}

/** The same game: a save written again with nothing played since (the party taken back to it, and saved at once). */
const sameGame = (a: SaveData, b: SaveData): boolean => a.save === b.save && a.brit === b.brit && a.under === b.under;

/** Every save of character `id`'s that reads, newest first: the last, then those before it. */
function keptOf(id: string): Kept[] {
  const out: Kept[] = [];
  try {
    const last = parsed(localStorage.getItem(lastKey(id)));
    if (last) out.push({ key: lastKey(id), data: last });
    for (const key of readIndex(id).keys) {
      const data = parsed(localStorage.getItem(key));
      if (data) out.push({ key, data });
    }
  } catch {
    /* no storage here */
  }
  return out;
}

/** Character `id`'s last save; where it will not read, the newest of those before it that will. Null with none. */
function lastOf(id: string): SaveData | null {
  try {
    const last = parsed(localStorage.getItem(lastKey(id)));
    if (last) return last;
  } catch {
    return null;
  }
  return keptOf(id)[0]?.data ?? null;
}

/** A character and their last save, which says who and where they are, and when they last saved. */
export interface Character {
  id: string;
  data: SaveData;
}

/** Every character with a save that reads, the newest last save first. */
export function characters(): Character[] {
  migrate();
  const out: Character[] = [];
  for (const id of characterIds()) {
    const data = lastOf(id);
    if (data) out.push({ id, data });
  }
  return out.sort((a, b) => b.data.written - a.data.written);
}

/** Whether another character may be made or imported: fewer than MAX_CHARACTERS kept. */
export function roomForCharacter(): boolean {
  return characters().length < MAX_CHARACTERS;
}

/** The character in play: the one chosen, or the latest (the newest last save), now chosen; null with none. */
export function currentCharacter(): string | null {
  migrate();
  const id = chosenCharacter();
  if (id !== null) return id;
  const latest = characters()[0]?.id ?? null;
  chooseCharacter(latest);
  return latest;
}

/** The Avatar's name in a save. */
export const avatarName = (d: SaveData): string => new Save(fromBase64(d.save)).members[0].name.trim();

/**
 * Character `id` let go, and all their saves and settings with them. The last character's settings stay as those in
 * use with none (SETTINGS_KEY), so that nothing seen changes.
 */
export function deleteCharacter(id: string): void {
  const rest = characterIds().filter((other) => other !== id);
  try {
    const settings = localStorage.getItem(charKey(id, 'settings'));
    if (rest.length === 0 && settings !== null) localStorage.setItem(SETTINGS_KEY, settings);
  } catch {
    /* the defaults will do */
  }
  for (const key of readIndex(id).keys) forget(key);
  forget(indexKey(id));
  forget(lastKey(id));
  forget(charKey(id, 'settings'));
  forget(charKey(id, 'playing'));
  forgetMade(id);
  writeCharacterIds(rest);
  if (chosenCharacter() === null) chooseCharacter(null);
}

/**
 * The saves from before characters (one last save, SAVE_KEY, and nine earlier, SAVES_KEY - whoever's they were) made
 * characters, once: grouped by the Avatar's name, each group's newest its last save and the rest, newest first, its
 * earlier ones, each with a copy of the settings then in use. All is written before the list of characters, and the
 * old saves let go only after it: a migration that fails part way lets go of what it wrote, and is tried again.
 */
function migrate(): void {
  if (haveCharacterList()) return;
  const old: Kept[] = [];
  const oldKeys = [SAVE_KEY, ...readIndexAt(SAVES_KEY, SAVE_KEY, OLD_EARLIER).keys, SAVES_KEY];
  let settings: string | null;
  try {
    const last = parsed(localStorage.getItem(SAVE_KEY));
    if (last) old.push({ key: SAVE_KEY, data: last });
    for (const key of oldKeys.slice(1, -1)) {
      const data = parsed(localStorage.getItem(key));
      if (data) old.push({ key, data });
    }
    settings = localStorage.getItem(SETTINGS_KEY);
  } catch {
    return;
  }
  if (old.length === 0) return;
  const groups = new Map<string, Kept[]>();
  for (const k of old) {
    const name = avatarName(k.data);
    groups.set(name, [...(groups.get(name) ?? []), k]);
  }
  const newest = (saves: Kept[]): number => Math.max(...saves.map((k) => k.data.written));
  const ids: string[] = [];
  const written: string[] = [];
  const put = (key: string, text: string): void => {
    written.push(key);
    localStorage.setItem(key, text);
    if (localStorage.getItem(key) !== text) throw new Error('not kept');
  };
  try {
    for (const saves of [...groups.values()].sort((a, b) => newest(b) - newest(a))) {
      saves.sort((a, b) => b.data.written - a.data.written);
      const id = freshId(ids);
      ids.push(id);
      const text = (k: Kept): string => packSave(JSON.stringify(k.data));
      put(lastKey(id), text(saves[0]));
      const keys = saves.slice(1, 1 + EARLIER).map((k, i) => {
        const key = `${lastKey(id)}.${i + 1}`;
        put(key, text(k));
        return key;
      });
      put(indexKey(id), JSON.stringify({ next: keys.length + 1, keys }));
      if (settings !== null) put(charKey(id, 'settings'), settings);
    }
    if (!writeCharacterIds(ids)) throw new Error('no list');
  } catch {
    for (const key of written) forget(key);
    return;
  }
  // Every old key let go - those that would not read with the rest, so nothing is left behind unseen.
  for (const key of oldKeys) forget(key);
}

export const localSave = {
  /** How many times the game has been written (the tests count them). */
  writes: 0,
  /** How many earlier saves have been let go to make room for a new one (the tests count them). */
  evicted: 0,
  /** Never written: a window opened to look at a place (the tiles page's ?peek), the player's own game left alone. */
  off: false,
  /**
   * The current character's last save; where it will not read (damaged, cut short), the newest of the saves before
   * it that will, so that a bad slot never loses the game. Null with none.
   */
  read(): SaveData | null {
    const id = currentCharacter();
    return id === null ? null : lastOf(id);
  },
  /**
   * Every save of the current character's that reads, newest first: the last, then those before it (the last passed
   * over where it will not read).
   */
  all(): Kept[] {
    const id = currentCharacter();
    return id === null ? [] : keptOf(id);
  },
  /** The game saved, as `write` saves it; true once it is read back whole. */
  write(g: Game): boolean {
    if (this.off) return false;
    this.writes++;
    let text: string;
    try {
      text = JSON.stringify(serialize(g));
    } catch {
      return false;
    }
    return this.put(text);
  },
  /**
   * A save's text made the current character's last save (a new character's, with none), and true once it is read
   * back whole. Their last save before it is first copied to a slot of its own among their earlier ones (the oldest
   * past seven let go), and that copy read back, so that it is never lost to a new one that fails: where the new one
   * cannot be written whole, the last is as it was and the copy goes again. A save of the very game last saved
   * (nothing played since) is not kept twice.
   */
  put(text: string): boolean {
    let fresh: SaveData;
    let packed: string;
    try {
      fresh = parseSave(text);
      packed = packSave(text);
    } catch {
      return false;
    }
    let id = currentCharacter();
    if (id === null) {
      id = newCharacter();
      chooseCharacter(id);
    }
    const last = lastKey(id);
    try {
      const ix = readIndex(id);
      const lastText = localStorage.getItem(last);
      const before = parsed(lastText);
      let copy: string | null = null;
      if (before && lastText !== null && !sameGame(before, fresh)) {
        const key = `${last}.${ix.next++}`;
        if (!store(key, () => lastText, id, ix) || parsed(localStorage.getItem(key)) === null) {
          forget(key);
          return false;
        }
        ix.keys.unshift(key);
        const gone = ix.keys.splice(EARLIER);
        if (!store(indexKey(id), () => JSON.stringify(ix), id, ix, key)) {
          forget(key);
          return false;
        }
        for (const k of gone) forget(k);
        copy = key;
      }
      if (store(last, () => packed, id, ix, copy) && parsed(localStorage.getItem(last)) !== null) return true;
      // Not kept: the last save as it was - written back from its copy, should the failed write have touched it -
      // and then the copy let go, or kept among the earlier ones where the last could not be put back.
      if (copy !== null && lastText !== null) {
        if (localStorage.getItem(last) !== lastText) {
          try {
            localStorage.setItem(last, lastText);
          } catch {
            /* the copy stands for it */
          }
        }
        if (localStorage.getItem(last) === lastText) {
          ix.keys = ix.keys.filter((k) => k !== copy);
          store(indexKey(id), () => JSON.stringify(ix), id, ix);
          forget(copy);
        }
      }
      return false;
    } catch {
      return false;
    }
  },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When a save was made, by the player's own clock: "Oct 1, 4:35 PM" (and its year, where not this one's: "Oct 1
 * 2025, 4:35 PM"). Spelled out here rather than by the browser, whose "PM" may come after a space the game's
 * letters do not have.
 */
export function savedWhen(written: number, now = Date.now()): string {
  const d = new Date(written);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}, ${time}`;
}

/**
 * Where a save was made, by the game's own names: the towne, castle, keep or hut ("Yew", "Lord British's Castle"),
 * the dungeon and its level ("Wrong, level 3"), or out in the open "Britannia" or "the Underworld" - a place's name
 * there where the party stands on its square, as the game saves itself at a door ("Minoc"; "Deceit, Underworld" at
 * a dungeon's way up), a shrine's on its own ("Shrine of Honesty").
 */
export function savedWhere(g: Game, d: SaveData): string {
  const s = new Save(fromBase64(d.save));
  const id = s.mapId > 0x7f ? s.savedMapId : s.mapId;
  if (id > 0x20 && id <= 0x28) return `${placeTitle(g, id)}, level ${s.level + 1}`;
  if (id !== 0) return placeTitle(g, id) || 'Britannia';
  const under = s.level === 0xff;
  const locs = g.data.locations;
  for (let i = under ? 0x20 : 0; i < 0x28; i++) {
    if (locs[i]?.x !== s.x || locs[i]?.y !== s.y) continue;
    return under ? `${placeTitle(g, i + 1)}, Underworld` : placeTitle(g, i + 1);
  }
  if (!under) {
    const xs = g.data.bytes(0x1f6e, 8);
    const ys = g.data.bytes(0x1f76, 8);
    const virtues = g.data.table(0x1f4e, 8);
    for (let i = 0; i < 8; i++) {
      if (xs[i] !== s.x || ys[i] !== s.y) continue;
      const virtue = virtues[i].charAt(0) + virtues[i].slice(1).toLowerCase();
      // (Spirituality's, at the menus' width, the other way about.)
      return virtue.length > 11 ? `${virtue} shrine` : `Shrine of ${virtue}`;
    }
  }
  return under ? 'the Underworld' : 'Britannia';
}

/**
 * A list of saves to go back to, each on two lines: when it was made, to be chosen, and where under it in grey,
 * newest first. The save chosen, or null for B.
 */
export async function chooseSave(g: Game, title: string, saves: Kept[]): Promise<Kept | null> {
  const { choose } = await import('./menu.ts');
  const items = saves.flatMap((k) => {
    const where = savedWhere(g, k.data);
    return [{ label: savedWhen(k.data.written) }, { label: where.charAt(0).toUpperCase() + where.slice(1), enabled: false }];
  });
  for (;;) {
    const i = await choose(g, title, items);
    if (i === -2) continue; // to be drawn anew
    return i < 0 ? null : saves[i >> 1];
  }
}

/**
 * The game taken back to a save, all played since undone (All is lost's choice, and the Pause menu's), and handed
 * to the main loop (run.ts) to go on from where it was saved.
 */
export async function takeUp(g: Game, d: SaveData): Promise<never> {
  restore(g, d);
  const { drawFrame, gameWindows } = await import('./run.ts');
  gameWindows(g);
  drawFrame(g);
  g.viewDirty = 1;
  const { Relocate } = await import('./cheats.ts');
  throw new Relocate();
}

/**
 * CAST2_10fe_SaveGame: "Save game?" - Q, which 1988 called Quit. `asked`: the Pause menu's Save game (the port's), the
 * player's choice already made there - no "Quit:", no question, just the saving.
 */
export async function saveCommand(g: Game, asked = false): Promise<number> {
  if (asked)
    g.print(g.t(0x966a).replace(/^Yes\n/, '')); // "Saving...\n"
  else {
    const { yesNo } = await import('./input.ts');
    g.say(0xa1ea); // "Quit:"
    g.say(0x9658); // "\nSave game? "
    if (!(await yesNo(g))) {
      g.say(0x9666); // "No\n"
      return 0;
    }
    g.say(0x966a); // "Yes\nSaving...\n"
  }
  // Said done only once it is read back whole: where it could not be kept, the player is told so, the saves before
  // it as they were.
  if (localSave.write(g))
    g.say(0x96ac); // "Done.\n"
  else g.print('Not saved!\n');
  return 0;
}
