import { describe, expect, it } from 'vitest';
import { CHEATS } from '../src/game/cheats.ts';
import { K, Pad } from '../src/game/io.ts';
import { KNOWN_FROM_THE_START } from '../src/game/words.ts';
import { newGame } from './helpers.ts';

const addWord = CHEATS.find((c) => c.label === 'Add word')!;
const GRID = ['ABCDEFGHIJK', 'LMNOPQRSTUV', 'WXYZ0123456', '789.,!?-\'"*'];

/** A controller's presses on the letter picker for `word`, then Done. */
function pressesFor(word: string): number[] {
  const out: number[] = [];
  let r = 0;
  let col = 0;
  for (const ch of word) {
    const to = GRID.findIndex((row) => row.includes(ch));
    const c = GRID[to].indexOf(ch);
    for (; r !== to; r = (r + 1) % 5) out.push(K.Down);
    for (; col !== c; col = (col + 1) % 11) out.push(K.Right);
    out.push(Pad.A);
  }
  for (; r !== 4; r = (r + 1) % 5) out.push(K.Down);
  col = Math.min(col, 3);
  for (; col !== 2; col = (col + 1) % 4) out.push(K.Right);
  out.push(Pad.A);
  return out;
}

describe("Cheats' Add word", () => {
  it('makes a word the game answers to known, spelt on the letter picker', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const mantra = g.data.table(0x1f5e, 8)[0].toUpperCase();
    expect(g.words.knows(mantra)).toBe(false);
    p.keys.push(...pressesFor(mantra));
    const said = await addWord.apply(g);
    expect(g.words.knows(mantra)).toBe(true);
    expect(said).toMatch(/^Known now: /);
  });

  it('keeps a word typed on a keyboard, Backspace and all, Enter done', async () => {
    const { g, p } = newGame();
    g.options.input = 'letters';
    const mantra = g.data.table(0x1f5e, 8)[1].toUpperCase();
    p.keys.push(...[...`${mantra}Q`].map((c) => c.charCodeAt(0)), K.Backspace, K.Enter);
    await addWord.apply(g);
    expect(g.words.knows(mantra)).toBe(true);
  });

  it('keeps no word the game does not answer to, and says so', async () => {
    const { g, p } = newGame();
    g.options.input = 'letters';
    p.keys.push(...[...'ZQXJ'].map((c) => c.charCodeAt(0)), K.Enter);
    expect(await addWord.apply(g)).toBe('Nobody in Britannia answers to ZQXJ.');
    expect(g.words.all()).toEqual(KNOWN_FROM_THE_START.map((w) => w.toLowerCase())); // only what every Avatar knows
  });

  it('adds nothing when the picker is backed out of', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    p.keys.push(Pad.B);
    expect(await addWord.apply(g)).toBe('No word added.');
  });
});
