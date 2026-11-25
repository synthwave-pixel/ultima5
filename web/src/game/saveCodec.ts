/**
 * saveCodec.ts
 *
 * What the saves' machinery (storage.ts: characters, the last save and the earlier ones, verified writes, packing,
 * the list of saves) needs of a game's own saves, and the one in use. A game's save is JSON; the machinery reads only
 * StoredSave's fields of it, and leaves the rest - what the game is, how it is checked and put back, who and where -
 * to the game's codec. Ultima V's is ultima5Saves.ts, set by its Game.
 */

import type { GameCore } from './gameCore.ts';

/** What the machinery reads of any game's save. */
export interface StoredSave {
  /** Which game wrote it (brand.ts GAME_ID): another game's is never taken up. */
  game: string;
  version: number;
  /** When it was written (ms since 1970). */
  written: number;
  /** The game's own state, base64: a save of the very same game has the same (cloudCopy.ts, same). */
  save: string;
}

/** A game's own saves. */
export interface SaveCodec {
  /** The game as a save. */
  serialize(g: GameCore): StoredSave;
  /** A save's text checked and read; throws with the reason when it will not do. */
  parse(text: string): StoredSave;
  /** A save of the very game `a` was: nothing played since (it is not kept twice). */
  same(a: StoredSave, b: StoredSave): boolean;
  /** The Avatar's name in a save (the list of characters). */
  avatarName(d: StoredSave): string;
  /** The Avatar's level in a save (a character's card: characterMenu.ts cardOf). */
  level(d: StoredSave): number;
  /**
   * A word for a character's card after the name ("Kestrel, Bard, level 2": characterMenu.ts cardOf), or undefined
   * for none. Ultima V gives none; the plain list of characters (avatarName) is not touched by it.
   */
  cardDetail?(d: StoredSave): string | undefined;
  /** Where a save was made, in words (the list of saves to go back to). */
  where(g: GameCore, d: StoredSave): string;
  /** Whether the game may save itself now (autosave). */
  canAutosave(g: GameCore): boolean;
  /** A save taken up: the game put where it was (Journey Onward). `fresh`: the game's memory starts anew first, as
   * when a character is taken up from the title rather than an earlier save of the game being played. */
  restore(g: GameCore, d: StoredSave, fresh: boolean): void;
}

let codec: SaveCodec | null = null;

/** The game's codec, from now on (a game sets its own as it is made). */
export function useSaves(c: SaveCodec): void {
  codec = c;
}

/** The codec in use; throws where no game has set one. */
export function saveCodec(): SaveCodec {
  if (!codec) throw new Error('no game has set how it saves (saveCodec.ts useSaves)');
  return codec;
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
