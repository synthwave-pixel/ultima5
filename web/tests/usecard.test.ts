import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { useCardLines } from '../src/game/useCard.ts';
import { newGame } from './helpers.ts';

/** The Use list's card (useCard.ts): what a thing does, how many are held, and why it is grey where it is. */
describe("a thing's card in the Use list", () => {
  const game = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    for (const m of g.s.members) m.hp = m.maxHp;
    return { g, p, s: g.s };
  };

  it('says what a potion does, its colour, how many, and why it would do nothing with nobody hurt', () => {
    const { g, s } = game();
    s.potions[1] = 3; // yellow: heal
    const { top, foot } = useCardLines(g, 8 + 1);
    expect(top[0].trim()).toBe('Heal');
    expect(top.join(' ')).toMatch(/Yellow potion/);
    expect(top.at(-1)).toBe('Held: 3');
    expect(foot.join(' ')).toBe('No one is hurt');
    for (const line of [...top, ...foot]) expect(line.length).toBeLessThanOrEqual(15);
  });

  it("says a potion is not always as it seems where it would work, and a sextant's why by day", () => {
    const { g, s } = game();
    s.members[1].hp = 5;
    expect(useCardLines(g, 8 + 1).foot).toEqual(['Not always as', 'it seems.']);
    Object.assign(s, { mapId: 0, level: 0, hour: 12 });
    expect(useCardLines(g, 0x22).foot.join(' ')).toBe('Only at night');
  });

  it('lets the bar rest on a grey line that may rest, where A does nothing', async () => {
    const { g, p } = game();
    p.keys.push(K.Down, Pad.A, K.Up, Pad.A);
    const at = await choose(g, 'Items', [{ label: 'Usable' }, { label: 'Grey', enabled: false, rest: true }]);
    expect(at).toBe(0); // down onto the grey line, A: nothing; up, A: the usable one
  });
});
