/**
 * lexicon.ts
 *
 * The words a game answers to, which is what the party learns from what it hears and reads (words.ts Vocabulary):
 * each game's own, set by the game as it is made. Ultima V's are every townsman's keywords, the mantras, the words of
 * power and the rest, read from its files (ultima5Lexicon.ts); another game on this engine brings its own.
 */

import type { GameCore } from './gameCore.ts';

export interface Lexicon {
  /** Every word, or stub of one, the game answers to, as Vocabulary keys them (upper case, letters and digits). */
  answerable(g: GameCore): Set<string>;
  /** What a new Avatar knows before hearing anything. */
  startingWords: readonly string[];
}

let inUse: Lexicon | null = null;

/** The game's words, from now on (a game sets its own as it is made). */
export function useLexicon(l: Lexicon | null): void {
  inUse = l;
}

/** The words in use: null before any game has set them. */
export function lexicon(): Lexicon | null {
  return inUse;
}
