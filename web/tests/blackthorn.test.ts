import { describe, expect, it } from 'vitest';
import { answers } from '../src/game/story.ts';
import { newGame } from './helpers.ts';

/**
 * Blackthorn demands the mantra of a shrine. The original takes anything typed and looks in it for the
 * mantra; a player with no keyboard is offered the three answers that moment holds.
 */
describe("Blackthorn's question", () => {
  it('offers silence and refusal to a player who does not know the mantra', () => {
    const { g } = newGame();
    const said = answers(g, 0);
    expect(said.map((a) => a.label)).toEqual(['Say nothing', 'Refuse']);
    // Neither answer gives anything away.
    const mantra = g.data.table(0x1f5e, 8)[0].toUpperCase();
    for (const a of said) expect(a.word.includes(mantra)).toBe(false);
  });

  it('offers the mantra once it has been heard, named as it will be said', () => {
    const { g } = newGame();
    const mantra = g.data.table(0x1f5e, 8)[2].toUpperCase();
    g.words.add(mantra);
    const said = answers(g, 2);
    expect(said).toHaveLength(3);
    expect(said[2].label).toBe(`Tell him ${mantra}`);
    expect(said[2].word.includes(mantra)).toBe(true); // this is the answer that defiles the shrine
  });

  it('offers only the mantra he asks for, not every one known', () => {
    const { g } = newGame();
    const mantras = g.data.table(0x1f5e, 8);
    g.words.add(mantras[5].toUpperCase());
    expect(answers(g, 5)).toHaveLength(3); // the one he demands
    expect(answers(g, 4)).toHaveLength(2); // a shrine whose mantra is not known
    expect(answers(g, 5)[2].label).toContain(mantras[5].toUpperCase());
  });
});
