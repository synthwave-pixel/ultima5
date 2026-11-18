/**
 * saysWord.ts
 *
 * How a word said is matched against a word from the game (Ultima V's ULTIMA_6f1e, moved from cmds.ts unchanged):
 * every game's, since the words a party learns are matched with it (words.ts).
 */

/** ULTIMA_6f1e: typed words (upper case) match a word from the game when they begin with all of it. */
export function saysWord(word: string, typed: string): boolean {
  // Words of nine letters or more are compared on their first eight (the original's loop stops a letter short).
  const w = (word.length >= 9 ? word.slice(0, 8) : word).toUpperCase();
  // What is said may come from the keyboard (capitals, as the original reads it) or from the list of words heard
  // (as they were heard): it is the word that matters, not its case.
  return typed.slice(0, w.length).toUpperCase() === w;
}
