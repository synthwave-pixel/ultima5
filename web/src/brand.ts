/**
 * brand.ts
 *
 * The game's identifiers, in one place: the prefix of every key it keeps in the browser's storage, the tag a saved
 * game carries, the installed files' database, the exported save's file name, and the repository its releases and
 * issues are on. Prose ("Ultima V" in what the player reads) is not here. A fork for another game (the Ultima IV port)
 * changes these and nothing else, so its saves never meet this game's on a shared origin.
 */

/** What every storage key starts with ("ultima5.settings"), what a save says it is, and the database's name. */
export const GAME_ID = 'ultima5';

/** The GitHub repository the releases and issues are on. */
export const REPO = 'synthwave-pixel/ultima5';

/** A storage key of this game's: `${GAME_ID}.${rest}`. */
export const storageKey = (rest: string): string => `${GAME_ID}.${rest}`;

/** GAME_ID as it goes into a regular expression. */
export const GAME_ID_PATTERN = GAME_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
