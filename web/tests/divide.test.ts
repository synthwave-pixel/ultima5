import { describe, expect, it } from 'vitest';
import { damage, mayBreed, monsterMagic, newSpawns, spawned } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import type { Rules } from '../src/game/settings.ts';
import { newGame } from './helpers.ts';

/** A creature named `name` at (5, 4) of an open arena of grass, at `hp`, the fight begun under `rules`. */
function foe(name: string, hp: number, rules: Rules = 'modern') {
  const { g } = newGame();
  journeyOnward(g);
  g.options.rules = rules;
  const s = g.s;
  g.combatMap.fill(0x04);
  for (const c of g.combat) c.clear();
  const kind = g.data.table(0x18b6, 0x30).indexOf(name);
  Object.assign(g.combat[8], { flags: CF.Monster, who: kind, x: 5, y: 4, actor: 9, hp });
  const a = s.actors[9];
  a.tile = a.anim = 0x40 + kind * 4;
  [a.x, a.y] = [5, 4];
  newSpawns(g);
  return { g, kind };
}
type G = ReturnType<typeof foe>['g'];
const alive = (g: G, kind: number): number[] =>
  g.combat.flatMap((c, i) => (c.flags & CF.Monster && !(c.flags & CF.Dead) && c.who === kind ? [i] : []));

describe('a dividing creature, as in both originals', () => {
  it('splits at every blow that does not kill it, a graze too, the copy as whole as it is - with the Classic rules', async () => {
    const { g, kind } = foe('GARGOYLE', 40, 'classic');
    await damage(g, 8, 8);
    expect(alive(g, kind).map((i) => g.combat[i].hp)).toEqual([32, 32]);
    await damage(g, 8, -3); // the armour took it all
    expect(alive(g, kind)).toHaveLength(3);
  });

  it('with the Story or Modern rules, lets a graze be', async () => {
    for (const rules of ['story', 'modern'] as const) {
      const { g, kind } = foe('GARGOYLE', 40, rules);
      await damage(g, 8, -3);
      expect(alive(g, kind)).toEqual([8]);
      await damage(g, 8, 8);
      expect(alive(g, kind)).toHaveLength(2);
    }
  });
});

describe('the eased rules’ allowance of what a fight breeds', () => {
  it('lets a creature the fight began with divide twice with the Story rules, three times with the Modern', async () => {
    for (const [rules, times] of [
      ['story', 2],
      ['modern', 3],
    ] as const) {
      const { g, kind } = foe('GARGOYLE', 99, rules);
      for (let blow = 0; blow < 6; blow++) await damage(g, 8, 1);
      expect(alive(g, kind)).toHaveLength(1 + times);
    }
  });

  it('lets a copy divide one time fewer than what it split from: with the Modern rules 3, 2, 1, then none', async () => {
    const { g, kind } = foe('GARGOYLE', 99, 'modern');
    let newest = 8;
    const times: number[] = [];
    for (let generation = 0; generation < 6; generation++) {
      const before = alive(g, kind);
      for (let blow = 0; blow < 6; blow++) await damage(g, newest, 1);
      const copies = alive(g, kind).filter((i) => !before.includes(i));
      times.push(copies.length);
      if (!copies.length) break;
      newest = copies[0];
    }
    expect(times).toEqual([3, 2, 1, 0]);
  });

  it('stops all dividing when the allowance is spent: 6 with the Story rules, 12 with the Modern', async () => {
    for (const [rules, allowance] of [
      ['story', 6],
      ['modern', 12],
    ] as const) {
      const { g, kind } = foe('SLIME', 99, rules);
      expect(g.spawnLeft).toBe(allowance);
      // Ten slimes the fight began with, apart along two rows, each struck twice
      for (let k = 1; k < 10; k++) {
        const [x, y] = [k, k % 2 ? 1 : 8];
        Object.assign(g.combat[8 + k], { flags: CF.Monster, who: kind, x, y, actor: 9 + k, hp: 99 });
        const a = g.s.actors[9 + k];
        a.tile = a.anim = 0x40 + kind * 4;
        [a.x, a.y] = [x, y];
      }
      for (let blow = 0; blow < 2; blow++) for (let k = 0; k < 10; k++) await damage(g, 8 + k, 1);
      expect(alive(g, kind)).toHaveLength(10 + allowance);
      expect(mayBreed(g, 8 + 9, true)).toBe(false);
    }
  });

  it('counts both sides together: the party’s summons spend it too, and are never refused for it', () => {
    const { g } = foe('GARGOYLE', 40, 'story');
    for (let n = 10; n < 17; n++) spawned(g, n); // seven creatures the party summoned, past Story's six
    expect(g.spawnLeft).toBe(0);
    expect(mayBreed(g, 8, true)).toBe(false);
    expect(mayBreed(g, 8, false)).toBe(false);
    newSpawns(g); // the next fight
    expect(mayBreed(g, 8, true)).toBe(true);
  });

  it('with the Classic rules sets no bound, as in 1988', async () => {
    const { g, kind } = foe('SLIME', 99, 'classic');
    for (let blow = 0; blow < 6; blow++) await damage(g, 8, 1);
    expect(alive(g, kind)).toHaveLength(7);
  });
});

describe('a creature gating in daemons', () => {
  /** How many daemons a daemon gates in over `turns` of its turns, the field cleared after each. */
  const gated = async (rules: Rules, spent: boolean, turns = 4000): Promise<number> => {
    const { g, kind } = foe('DAEMONS', 75, rules);
    let n = 0;
    for (let t = 0; t < turns; t++) {
      g.spawnLeft = spent ? 0 : 12;
      g.s.combatTurn = 8;
      await monsterMagic(g, 8);
      for (const i of alive(g, kind))
        if (i !== 8) {
          n++;
          g.combat[i].clear();
        }
      for (const [i, a] of g.s.actors.entries()) if (i !== 9) a.tile = a.anim = 0;
    }
    return n / turns;
  };

  it('1 turn in 8 with the Story and Modern rules, as the DOS game; 1 in 32 with the Classic, as the Apple II', async () => {
    // (Of each, about half the turns fall on a square off the field, and gate in none.)
    const modern = await gated('modern', false);
    const story = await gated('story', false);
    const classic = await gated('classic', false);
    expect(modern / classic).toBeGreaterThan(3);
    expect(modern / classic).toBeLessThan(5.5);
    expect(story / modern).toBeGreaterThan(0.75);
    expect(story / modern).toBeLessThan(1.33);
  });

  it('never, the allowance spent, with the Modern rules; with the Classic, as in 1988, all the same', async () => {
    expect(await gated('modern', true)).toBe(0);
    expect(await gated('classic', true)).toBeGreaterThan(0.01);
  });
});

describe('a pass-out with the Classic rules', () => {
  it('frees every possessed member, as the Apple II does; the Modern only the first, as the DOS game', async () => {
    const { passOut } = await import('../src/game/combat.ts');
    for (const [rules, freed] of [
      ['classic', 3],
      ['modern', 1],
    ] as const) {
      const { g } = foe('DAEMONS', 75, rules);
      for (let m = 0; m < 3; m++) Object.assign(g.combat[m], { flags: CF.Player | CF.Charmed, who: m, x: m, y: 9, actor: m });
      for (let m = 0; m < 3; m++) g.charmedBy.set(m, 6);
      passOut(g);
      expect(g.combat.slice(0, 3).filter((c) => !(c.flags & CF.Charmed))).toHaveLength(freed);
      // Who charmed them is forgotten with the charm: kept only for those still charmed.
      for (let m = 0; m < 3; m++) expect(g.charmedBy.has(m)).toBe((g.combat[m].flags & CF.Charmed) !== 0);
    }
  });
});

describe('the mimic', () => {
  it('has armour 8 with the Classic rules, as the Apple II has it, and 3 with the Modern, as the DOS game', async () => {
    const { enemy } = await import('../src/game/combat.ts');
    for (const [rules, def] of [
      ['classic', 8],
      ['modern', 3],
    ] as const) {
      const { g } = foe('MIMICS', 30, rules);
      expect(enemy(g, g.data.table(0x18b6, 0x30).indexOf('MIMICS')).def).toBe(def);
    }
  });
});
