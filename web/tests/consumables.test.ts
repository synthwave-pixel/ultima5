import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { POTION_EFFECTS, scrollEffect, scrollShort, scrollWords } from '../src/game/magic.ts';
import { getObject } from '../src/game/items.ts';
import { journeyOnward } from '../src/game/run.ts';
import { runGame } from '../src/game/run.ts';
import { newGame } from './helpers.ts';
import { command, fly, Landed, pick } from './pilot.ts';

/**
 * Scrolls and potions in the Use list are named by what they do (the
 * port's), where the original gave a scroll's letters ("IS") and a
 * potion's colour; the scroll's words are spoken as it is read.
 */
describe('scrolls and potions', () => {
  it("names a scroll by its spell's effect and speaks its syllables in order", () => {
    const { g } = newGame();
    const letters = g.data.table(0x41ac, 8);
    expect(letters[2]).toBe('IS');
    expect(scrollEffect(g, 2)).toBe('Protection');
    expect(scrollWords(g, 2)).toBe('In Sanct');
    expect(scrollEffect(g, 5)).toBe('Summon daemon');
    expect(scrollWords(g, 5)).toBe('Kal Xen Corp');
    for (let n = 0; n < 8; n++) expect(scrollEffect(g, n)).not.toMatch(/^[A-Z]{1,4}$/); // every one has a name
    // The list's row is fifteen wide: the count, the icon and the dash take seven of it, and a row is fourteen.
    for (let n = 0; n < 8; n++) expect(scrollShort(g, n).length).toBeLessThanOrEqual(7);
    expect(POTION_EFFECTS).toHaveLength(8);
    for (const e of POTION_EFFECTS) expect(e.length).toBeLessThanOrEqual(7);
  });

  it('lists them by effect in a menu over the map, and reads the scroll aloud', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.scrolls.fill(0);
    s.potions.fill(0);
    s.scrolls[2] = 1; // In Sanct
    s.potions[1] = 3; // yellow
    s.shards[0] = 0xff;
    s.skullKeys = 5;
    let labels: string[] = [];
    fly(g, p, [
      command('Use item'),
      (game) => {
        if (labels.length) return undefined;
        labels = game.menuShown?.labels ?? [];
        return undefined;
      },
      pick('Items', 'Scroll: Protection'),
      (game) => (game.commandPrompt === '' ? Pad.A : undefined),
    ]);
    try {
      await runGame(g);
    } catch (e) {
      if (!(e instanceof Landed)) throw e;
    }
    expect(labels.slice(0, 2)).toEqual(['Scroll: Protection', 'Potion: Heal x3']);
    // A thing simply had (its count the file's 0xff) is not "x255"; a number of things is counted.
    expect(labels).toContain('Shard of Falsehood');
    expect(labels).toContain('Skull keys x5');
    expect(labels.some((l) => /x255/.test(l))).toBe(false);
    expect(p.log).toMatch(/Scroll: Protection/); // the menu's row, over the map
    expect(p.log).toMatch(/In Sanct/); // spoken as it is read
    expect(p.log).not.toMatch(/\bIS\b/);
    expect(s.scrolls[2]).toBe(0);
  });

  it('names a scroll or a potion picked up the same way', () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    s.scrolls.fill(0);
    s.potions.fill(0);
    getObject(g, 4, 2, 0x20); // an In Sanct scroll
    getObject(g, 3, 1, 0x20); // a yellow potion
    expect(p.log).toMatch(/A scroll:\s+Protection!/); // (the pane wraps the line)
    expect(p.log).toMatch(/A potion:\s+Heal!/);
    expect(p.log).not.toMatch(/\bIS\b|Yellow/);
    expect(s.scrolls[2]).toBe(1);
    expect(s.potions[1]).toBe(1);
  });
});
