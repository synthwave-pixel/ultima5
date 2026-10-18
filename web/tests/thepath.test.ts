import { describe, expect, it } from 'vitest';
import { journalTop, pathTier } from '../src/game/journal.ts';
import { newGame } from './helpers.ts';

/**
 * The Path (the port's): the saved game's karma as a word, each tier ending where the game changes - Gruman's mantra
 * at 50, Annon's Word at 75, a resurrection without loss at 98 - in 1988's own words for it.
 */
describe('the Path', () => {
  it('names the tiers where the game changes', () => {
    const at = (k: number): string => pathTier(k).word;
    expect([0, 19, 20, 49, 50, 74, 75, 97, 98, 99].map(at)).toEqual([
      'Strayed',
      'Strayed',
      'Misguided',
      'Misguided',
      'Seeker',
      'Seeker',
      'Wise',
      'Wise',
      'Enlightened',
      'Enlightened',
    ]);
  });

  it('stands in the journal as a word, never the number, a new Avatar Wise - the karma the rules read', () => {
    const { g } = newGame();
    const line = () => journalTop(g).find((l) => l.label.startsWith('The Path'))!;
    // The Story's (and the Classic's): 1988's karma.
    g.options.rules = 'story';
    expect(g.s.karma).toBe(75);
    expect(line().label).toBe(`The Path${'Wise'.padStart(13)}`);
    g.s.karma = 74; // one sin
    expect(line().label).toBe(`The Path${'Seeker'.padStart(13)}`);
    expect(line().about).toMatch(/unworthy/);
    expect(line().label).not.toMatch(/\d/);
    expect(line().hint).toMatch(/Alms/);
    expect(line().open).toBeUndefined();
    // The Modern's: its own karma, the four pools - and a page of them, each by its word.
    g.options.rules = 'modern';
    expect(line().label).toBe(`The Path${'Wise'.padStart(13)}`); // a new game's pools, 75 each, whatever 1988's says
    g.path.pools.deeds = 40;
    expect(line().label).toBe(`The Path${'Seeker'.padStart(13)}`);
    expect(line().open!.lines.map((l) => l.label)).toEqual([
      `In word${'Wise'.padStart(14)}`,
      `In deed${'Misguided'.padStart(14)}`,
      `In battle${'Wise'.padStart(12)}`,
      `In the quest${'Wise'.padStart(9)}`,
    ]);
  });
});
