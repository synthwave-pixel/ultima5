import { describe, expect, it } from 'vitest';
import { charm, damage, shakeCharm } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** Sleep and charm in a fight, by the Rules setting (combat.ts): Classic as in 1988, Modern eased. */
describe('sleep and charm by the Rules setting', () => {
  const fight = (effects: 'classic' | 'modern', seed: number) => {
    const { g, p } = newGame(seed);
    journeyOnward(g);
    g.options.rules = effects;
    g.s.mapId = 0xff;
    Object.assign(g.combat[0], { who: 0, x: 5, y: 5, flags: CF.Player, actor: 1 });
    Object.assign(g.combat[1], { who: 0x30, x: 6, y: 5, flags: CF.Monster, hp: 200, actor: 2 });
    return { g, p };
  };

  it('wakes a sleeper hurt about half the time with Modern, never with Classic', async () => {
    let woke = { modern: 0, classic: 0 };
    for (let seed = 1; seed <= 200; seed++)
      for (const effects of ['modern', 'classic'] as const) {
        const { g } = fight(effects, seed);
        g.combat[1].flags |= CF.Asleep;
        await damage(g, 1, 3);
        if (!(g.combat[1].flags & CF.Asleep)) woke = { ...woke, [effects]: woke[effects] + 1 };
      }
    expect(woke.classic).toBe(0);
    expect(woke.modern).toBeGreaterThan(70);
    expect(woke.modern).toBeLessThan(130);
  });

  it('lets the charmed shake off the charm now and then with Modern, saying so', async () => {
    let shaken = 0;
    let said = false;
    for (let seed = 1; seed <= 100; seed++) {
      const { g, p } = fight('modern', seed);
      charm(g, 0, 1); // the member, charmed by the creature beside
      await shakeCharm(g, 0);
      if (!(g.combat[0].flags & CF.Charmed)) {
        shaken++;
        said ||= /shakes off the charm!/.test(p.log.replace(/\s+/g, ' '));
      }
    }
    expect(shaken).toBeGreaterThan(5);
    expect(shaken).toBeLessThan(95);
    expect(said).toBe(true);
  });

  it("never frees a summoned creature or the Chaos Sword's wielder from the charm, even with Modern", async () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { g, p } = fight('modern', seed);
      charm(g, 0, 'bound'); // the wielder, the sword the charmer
      charm(g, 1, 'bound'); // a creature summoned to the party's side
      await shakeCharm(g, 0);
      await shakeCharm(g, 1);
      expect(g.combat[0].flags & CF.Charmed).toBe(CF.Charmed);
      expect(g.combat[1].flags & CF.Charmed).toBe(CF.Charmed);
      expect(p.log).not.toMatch(/shakes off/);
    }
  });
});
