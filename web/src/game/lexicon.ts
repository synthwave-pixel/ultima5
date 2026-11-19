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
  /**
   * Whether `heard` (a word as Vocabulary keys it) says `word` (one the game answers to, or a keyword's stub), as the
   * game matches what a player types. Where a game gives none, Ultima V's (saysWord, ULTIMA_6f1e): the word heard
   * begins with the game's, which may be a stub of three letters or more.
   */
  says?: (word: string, heard: string) => boolean;
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
