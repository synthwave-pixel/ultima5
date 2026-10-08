import { describe, expect, it } from 'vitest';
import { campOutdoors, removeCombatant } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { newGame } from './helpers.ts';

/**
 * A camp ambushed with no one on watch (combat.ts camp, wakeAfterAmbush): the party wakes into the fight asleep but for
 * one, who beats it and leaves the field (Leave combat). With the Story and Modern rules everyone still asleep wakes as the fight is
 * left; with the Classic, as in 1988, they sleep on.
 */
describe('a camp ambushed', () => {
  const ambushed = async (rules: 'modern' | 'story' | 'classic') => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.rules = rules;
    const s = g.s;
    s.hour = 22;
    s.minute = 0;
    for (let m = 0; m < s.partySize; m++) Object.assign(s.members[m], { hp: 500, maxHp: 500, status: Status.Good });
    s.members[0].status = Status.Poisoned; // the poisoned do not sleep in camp (sleepUnlessPoisoned): the Avatar is up
    const dice = g.random.bind(g);
    g.random = (lo: number, hi: number): number => {
      if (lo === 0 && hi === 0x3f) return 0; // ambushed in the first hour
      // In the fight, no sleeper wakes - not on their turn, not when struck: the leaving does it, or nothing.
      if (lo === 0 && (hi === 9 || hi === 1 || hi === 0xff)) return hi;
      return dice(lo, hi);
    };
    let steps = 0;
    p.next = () => {
      if (++steps > 4000) throw new Error(`the fight went on too long: ${g.commandPrompt} ${p.log.replace(/\s+/g, ' ').slice(-500)}`);
      if (g.commandPrompt !== 'combat') return K.Space;
      if (s.members[0].status === Status.Poisoned) s.members[0].status = Status.Good; // up, and the poison done with
      // The ambush beaten (its creatures fallen, as at the party's first blows), the field is left as a won field is:
      // Leave combat (Escape), the sleepers on it.
      for (const [i, c] of g.combat.entries()) if (c.flags & CF.Monster && !(c.flags & CF.Dead)) removeCombatant(g, -i - 1);
      return s.battleWon !== 0 ? K.Escape : K.Space;
    };
    await campOutdoors(g, -1, 9);
    return { g, log: p.log };
  };

  it('wakes those still asleep when the fight is left, with the Story and Modern rules', async () => {
    for (const rules of ['modern', 'story'] as const) {
      const { g, log } = await ambushed(rules);
      expect(log).toContain('Ambushed!');
      const s = g.s;
      expect(
        [...Array(s.partySize).keys()].map((m) => s.members[m].status),
        rules,
      ).not.toContain(Status.Sleeping);
    }
  });

  it('leaves them asleep with the Classic rules, as 1988 did', async () => {
    const { g, log } = await ambushed('classic');
    expect(log).toContain('Ambushed!');
    const s = g.s;
    expect([...Array(s.partySize).keys()].some((m) => s.members[m].status === Status.Sleeping)).toBe(true);
  });
});
