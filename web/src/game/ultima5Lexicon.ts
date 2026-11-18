/**
 * ultima5Lexicon.ts
 *
 * Ultima V's words (lexicon.ts): every townsman's keywords and what their questions listen for, from TOWNE, DWELLING,
 * CASTLE and KEEP.TLK; the virtues, mantras, words of power, the Lycaeum's lore, what a well grants, the Shadowlords'
 * names and the Oppression's password, from DATA.OVL; and what every Avatar knows from the start (words.ts
 * KNOWN_FROM_THE_START). Set by Ultima V's Game. Moved from words.ts unchanged.
 */

import type { Game } from './game.ts';
import type { Lexicon } from './lexicon.ts';
import { key, KNOWN_FROM_THE_START, scriptAnswers, scriptKeywords, scriptSpeech, WISHES } from './words.ts';

/**
 * Every word the game answers to, from the player's own files: each
 * townsman's keywords, the mantras and virtues, the words of power and
 * the Lycaeum's lore. Read once and kept, since nothing in it changes.
 */
function ultima5Answers(g: Game): Set<string> {
  if (!cached.has(g.data)) {
    const stubs = new Set<string>();
    for (const name of ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) {
      const file = g.data.files.get(name);
      if (!file?.length) continue;
      const count = file[0] | (file[1] << 8);
      for (let i = 0; i < count; i++) {
        const at = 2 + i * 4;
        const script = file.subarray(file[at + 2] | (file[at + 3] << 8), i + 1 < count ? file[at + 6] | (file[at + 7] << 8) : file.length);
        for (const word of scriptKeywords(script)) stubs.add(key(word));
        // And what their questions listen for (the Resistance's password, a name), beyond yes and no.
        for (const word of scriptAnswers(script)) if (word.length > 2) stubs.add(key(word));
      }
    }
    for (const table of [
      g.data.table(0x1f4e, 8), // the virtues
      g.data.table(0x1f5e, 8), // their mantras
      g.data.table(0x4502, 8), // the words of power
      g.data.table(0x4c74, 0x1a), // the Lycaeum's lore
      WISHES.map((a) => g.t(a)), // what a well will grant
      g.data.table(0x444a, 3), // the Shadowlords' names, yelled at their flames
      [g.t(0x4a9a)], // the password the Oppression's guards ask of one who wears the badge
    ]) {
      for (const word of table) if (word) stubs.add(key(word));
    }
    stubs.delete('');
    cached.set(g.data, stubs);
  }
  return cached.get(g.data)!;
}
const cached = new WeakMap<Game['data'], Set<string>>();

const U5: Lexicon = {
  answerable: (g) => ultima5Answers(g as Game),
  startingWords: KNOWN_FROM_THE_START,
};

/** Ultima V's lexicon, the one object (set by Game). */
export const ultima5Lexicon = (): Lexicon => U5;

/** How many of Britannia's townsfolk say each word (scriptSpeech, their questions too): what is rare is a topic. */
export function townsfolkSaying(g: Game): (word: string) => number {
  if (!saying.has(g.data)) {
    const count = new Map<string, number>();
    const compressed = g.data.table(0x24ea, 0x80);
    for (const name of ['TOWNE.TLK', 'DWELLING.TLK', 'CASTLE.TLK', 'KEEP.TLK']) {
      const file = g.data.files.get(name);
      if (!file?.length) continue;
      const n = file[0] | (file[1] << 8);
      const starts = Array.from({ length: n }, (_, i) => file[4 + i * 4] | (file[5 + i * 4] << 8)).sort((a, b) => a - b);
      for (const at of starts) {
        const end = starts.find((s) => s > at) ?? file.length;
        for (const w of new Set(scriptSpeech(file.subarray(at, end), compressed, true))) count.set(w, (count.get(w) ?? 0) + 1);
      }
    }
    saying.set(g.data, count);
  }
  const count = saying.get(g.data)!;
  return (word) => count.get(word.toLowerCase()) ?? 0;
}
const saying = new WeakMap<Game['data'], Map<string, number>>();
