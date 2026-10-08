import { describe, expect, it } from 'vitest';
import { answersTo, KNOWN_FROM_THE_START, scriptKeywords, Vocabulary } from '../src/game/words.ts';
import { serialize, restore } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

/**
 * The vocabulary: words learnt by being said or read, matched against the stubs the game keeps
 * (usually four letters), and offered back at the townsman who answers them.
 */
describe('what the player has heard', () => {
  it('learns only words the game answers to', () => {
    const { g } = newGame();
    const v = g.words;
    v.learn(g, 'The SHADOWLORDS are abroad. Zzzz qqqq xyzzy.');
    expect(v.knows('shadowlords')).toBe(true); // someone answers "shad"
    expect(v.knows('zzzz')).toBe(false);
    expect(v.knows('xyzzy')).toBe(false);
    // Whatever is learnt is a word some townsman, shrine or dungeon answers to.
    for (const word of v.all()) expect(v.forStub(word.slice(0, 4))).toBeTruthy();
  });

  it('matches a word to the stub the game keeps', () => {
    const { g } = newGame();
    const v = g.words;
    v.learn(g, 'The SHADOWLORDS are abroad.');
    expect(v.forStub('shad')).toMatch(/shadowlords/i);
    expect(v.forStub('scep')).toBeNull(); // the sceptre has never been spoken of
  });

  it('prefers the shorter word where several match a stub', () => {
    const v = new Vocabulary();
    v.add('MANY');
    v.add('MAN');
    expect(v.forStub('man')).toBe('MAN');
  });

  it('keeps which answers have been heard, by place and person', () => {
    const v = new Vocabulary();
    expect(v.wasHeard(6, 3, 2)).toBe(false);
    v.markHeard(6, 3, 2);
    expect(v.wasHeard(6, 3, 2)).toBe(true);
    expect(v.wasHeard(6, 4, 2)).toBe(false);
    expect(v.wasHeard(7, 3, 2)).toBe(false);
  });

  it('travels in the save, and merges rather than replaces', () => {
    const { g } = newGame();
    g.words.add('THIEF');
    g.words.markHeard(6, 3, 2);
    const data = serialize(g);
    g.words.add('SHADOWLORDS');
    restore(g, data);
    expect(g.words.knows('THIEF')).toBe(true);
    expect(g.words.knows('SHADOWLORDS')).toBe(true); // learnt since the save, and not unlearnt
    expect(g.words.wasHeard(6, 3, 2)).toBe(true);
  });

  it("reads a townsman's keywords out of their script", () => {
    const { g } = newGame();
    const file = g.data.files.get('TOWNE.TLK');
    const count = file[0] | (file[1] << 8);
    let most = 0;
    for (let i = 0; i < count; i++) {
      const at = 2 + i * 4;
      const words = scriptKeywords(file.subarray(file[at + 2] | (file[at + 3] << 8)));
      most = Math.max(most, words.length);
      // The game keeps them cut short, four letters more often than not, and never long.
      for (const w of words) expect(w.length).toBeLessThanOrEqual(16);
    }
    expect(most).toBeGreaterThan(5);
    expect(most).toBeLessThan(30);
  });

  it('learns the short mantras, which two letters would otherwise miss', () => {
    const { g } = newGame();
    g.words.learn(g, 'The mantra of Compassion is MU, and of Valour RA.');
    expect(g.words.knows('MU')).toBe(true);
    expect(g.words.knows('RA')).toBe(true);
    expect(g.words.forStub('Mu')).toMatch(/mu/i);
    // Two letters are kept only where the game answers to exactly that.
    expect(g.words.knows('is')).toBe(false);
  });

  it("knows at the start of a new game only what every Avatar knows: Lord British, the opening's, the virtues", () => {
    const v = new Vocabulary();
    expect(v.all()).toEqual(KNOWN_FROM_THE_START.map((w) => w.toLowerCase()));
    v.add('THIEF');
    v.clear();
    expect(v.knows('THIEF')).toBe(false);
    expect(v.all()).toEqual(KNOWN_FROM_THE_START.map((w) => w.toLowerCase()));
    // Each a word the game answers to: none kept for nothing.
    const { g } = newGame();
    for (const word of KNOWN_FROM_THE_START) expect(answersTo(g, word), word).toBe(true);
    expect(answersTo(g, 'Zqxj')).toBe(false);
    // A save from before it was known knows it when loaded, and what it heard besides.
    const old = Vocabulary.decode({ known: ['blackthorn'], heard: [], labels: [] });
    expect(old.knows('British')).toBe(true);
    expect(old.knows('Blackthorn')).toBe(true);
  });
});

/** A well grants what the player has thought to wish for - and Origin's five jokes stay hidden. */
describe('wishing at a well', () => {
  it('learns a horse when one is spoken of, and never the jokes', async () => {
    const { g } = newGame();
    const { WISHES } = await import('../src/game/words.ts');
    const words = WISHES.map((a) => g.t(a));
    expect(words).toContain('Horse');
    expect(words).toContain('Ferrari');
    // Nobody in Britannia says Ferrari, so nothing can teach it; a horse is spoken of everywhere.
    g.words.learn(g, 'The stable keeps a fine horse for sale.');
    expect(g.words.forStub('Horse')).toBeTruthy();
    for (const joke of words.filter((w) => w !== 'Horse')) expect(g.words.forStub(joke)).toBeNull();
  });
});
