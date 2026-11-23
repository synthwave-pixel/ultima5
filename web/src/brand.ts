/**
 * brand.ts
 *
 * The game's identifiers, in one place: the prefix of every key it keeps in the browser's storage, the tag a saved
 * game carries, the installed files' database, the exported save's file name, and the repository its releases and
 * issues are on, and the game's name as the shared screens say it (the installer, the start-up's notes, the update's
 * boxes, Steam (beta), Manage Saves: GAME_NAME). The game's own prose is not here. A fork for another game (the Ultima
 * IV port) changes these and nothing else, so its saves never meet this game's on a shared origin.
 */

/** What every storage key starts with ("ultima5.settings"), what a save says it is, and the database's name. */
export const GAME_ID = 'ultima5';

/** The game's name in what the player reads on the screens every game on this engine shares. */
export const GAME_NAME = 'Ultima V';

/** Its full title, as the installer heads its page. */
export const GAME_TITLE = 'ULTIMA V: WARRIORS OF DESTINY';

/** Where a player without a copy can get one (the installer's page; the README links the same): the link and its words. */
export const STORE = {
  url: 'https://www.gog.com/en/game/ultima_456',
  /** "No copy yet? GOG sells it in <title>, <after>" */
  title: 'Ultima 4+5+6',
  after: 'with Ultima IV and VI.',
};

/** The GitHub repository the releases and issues are on. */
export const REPO = 'synthwave-pixel/ultima5';

/** A storage key of this game's: `${GAME_ID}.${rest}`. */
export const storageKey = (rest: string): string => `${GAME_ID}.${rest}`;

/** GAME_ID as it goes into a regular expression. */
export const GAME_ID_PATTERN = GAME_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The folder under web/public/ (and the site) the game's rendered music lies in (its TuneSet's `folder`): each tune
 * fetched the first time it plays, then kept by the service worker (tools/serviceWorker.ts).
 */
export const MUSIC_FOLDER = 'music';

/**
 * A cache of the service worker's, as game `id` names it: one Cache Storage holds every game's on a shared origin
 * (github.io), so each game's are its own - Ultima V's the plain names they have always had, so its players' kept
 * music stays kept; any other game's its id before them ("ultima4-music").
 */
export const cacheNameFor = (id: string, name: string): string => (id === 'ultima5' ? name : `${id}-${name}`);

/** A cache of the service worker's, named for this game (cacheNameFor). */
export const cacheName = (name: string): string => cacheNameFor(GAME_ID, name);
