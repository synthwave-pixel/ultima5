import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { whoActs } from '../src/game/input.ts';
import { castCommand } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Y with a controller (magic.ts castCommand): the caster asked for where some can cast, and why not where none can. */
describe('the caster chosen to cast', () => {
  const game = () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    const s = g.s;
    s.mixtures.fill(0);
    s.activeMember = 0xff;
    return { g, p, s };
  };

  it('starts the choice on the member with the most to cast, not the first', async () => {
    const { g, p } = game();
    const scores = [0, 0, 3];
    p.keys.push(K.Enter);
    expect(
      await whoActs(
        g,
        () => true,
        (m) => scores[m] ?? 0,
      ),
    ).toBe(2);
  });

  it('says there is not the mana, with spells mixed and nobody able to cast them', async () => {
    const { g, p, s } = game();
    s.mixtures.fill(3); // every spell mixed
    for (const m of s.members) m.mp = 0;
    await castCommand(g);
    expect(p.log).toMatch(/Not enough mana!/);
    expect(g.menuShown).toBeNull();
  });

  it('says none is mixed, with nothing mixed', async () => {
    const { g, p } = game();
    await castCommand(g);
    expect(p.log).toMatch(/None mixed!/);
  });

  it('names who cast a spell chosen from the command menu, and the spell, in the log', async () => {
    const { g, p, s } = game();
    s.mixtures[4] = 2; // Heal
    s.members[2].mp = 30;
    s.members[1].hp = 5;
    g.castPreset = { caster: 2, spell: 4, on: 1 };
    await castCommand(g);
    const log = p.log.replace(/\s+/g, ' ');
    expect(log).toContain(`Player: ${s.members[2].name.trim()}`);
    expect(log).toMatch(/Heal/);
  });
});
