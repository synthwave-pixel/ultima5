import { describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import { lexicon, useLexicon, type Lexicon } from '../src/game/lexicon.ts';
import { ultima5Lexicon } from '../src/game/ultima5Lexicon.ts';
import { answersTo, KNOWN_FROM_THE_START, Vocabulary } from '../src/game/words.ts';
import { FakePlatform, newGame } from './helpers.ts';

/**
 * The words a game answers to (lexicon.ts): what Vocabulary learns from what is said, set by the game - Ultima V's
 * from its own files (ultima5Lexicon.ts), another game's (the Ultima IV port's) from its.
 */
describe('a game’s lexicon', () => {
  const test: Lexicon = { answerable: () => new Set(['VIRTUE']), startingWords: ['Avatar'] };

  it('learns only what the game in use answers to', () => {
    const { g } = newGame();
    const was = lexicon();
    useLexicon(test);
    try {
      const v = new Vocabulary();
      const core = new GameCore(new FakePlatform());
      expect(v.learn(core, 'Virtue and honour')).toBe(1);
      expect([v.knows('VIRTUE'), v.knows('HONOUR')]).toEqual([true, false]);
      expect(answersTo(core, 'virtues')).toBe(true);
    } finally {
      useLexicon(was);
    }
    expect(g.words.knows('Shadowlords')).toBe(true);
  });

  it('begins with the game’s starting words, and again when cleared', () => {
    const was = lexicon();
    useLexicon(test);
    try {
      const v = new Vocabulary();
      expect(v.all()).toEqual(['avatar']);
      v.add('Virtue');
      v.clear();
      expect(v.all()).toEqual(['avatar']);
    } finally {
      useLexicon(was);
    }
  });

  it('is Ultima V’s in Ultima V’s game: its files’ words, and its starting words', () => {
    const { g } = newGame();
    const u5 = ultima5Lexicon();
    expect(lexicon()).toBe(u5);
    expect(u5.startingWords).toBe(KNOWN_FROM_THE_START);
    const answers = u5.answerable(g);
    for (const w of ['SHAD', 'HONESTY', 'AHM']) expect(answers.has(w), w).toBe(true);
  });

  it('hears a word by the game’s own rule where it gives one, Ultima V’s otherwise', () => {
    const was = lexicon();
    const answers = (): Set<string> => new Set(['BEG', 'SHAD', 'HEALTH']);
    // Ultima IV's C_A4B4: the first four letters, a word shorter than four only whole.
    const fourOrWhole = (word: string, heard: string): boolean =>
      word.length < 4 ? heard.toUpperCase() === word.toUpperCase() : heard.slice(0, 4).toUpperCase() === word.slice(0, 4).toUpperCase();
    const core = new GameCore(new FakePlatform());
    try {
      useLexicon({ answerable: answers, startingWords: [], says: fourOrWhole });
      const v = new Vocabulary();
      v.learn(core, 'Beggars, begone! The shadows; heal.');
      expect(['beggars', 'begone', 'shadows', 'heal'].map((w) => v.knows(w))).toEqual([false, false, true, true]);
      expect([answersTo(core, 'beggars'), answersTo(core, 'beg'), answersTo(core, 'healer')]).toEqual([false, true, true]);
      expect([v.forStub('BEG'), v.forStub('SHAD'), v.forStub('HEALTH')]).toEqual([null, 'shadows', 'heal']);
      v.learn(core, 'Thou mayst beg.');
      expect(v.forStub('BEG')).toBe('beg');
      // None given: Ultima V's, a word heard beginning with the stub (saysWord).
      useLexicon({ answerable: answers, startingWords: [] });
      const u5 = new Vocabulary();
      u5.learn(core, 'Beggars, begone! The shadows; heal.');
      expect(['beggars', 'begone', 'shadows', 'heal'].map((w) => u5.knows(w))).toEqual([true, true, true, false]);
      expect([u5.forStub('BEG'), u5.forStub('HEALTH')]).toEqual(['begone', null]);
    } finally {
      useLexicon(was);
    }
  });
});
