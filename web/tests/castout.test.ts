import { describe, expect, it } from 'vitest';
import { castOut, damage, monsterMagic, newSpawns, shakeCharm } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import type { Rules } from '../src/game/settings.ts';
import { newGame } from './helpers.ts';
import type { MockRandom } from './mockRandom.ts';

/**
 * A daemon beside the Avatar on an open field of grass, its possession of them begun: the charm's target roll set
 * to the Avatar, the roll to resist it set to fail.
 */
async function possessed(rules: Rules, hp = 50, gatedIn = false) {
  const { g, p } = newGame();
  journeyOnward(g);
  g.options.rules = rules;
  const s = g.s;
  s.mapId = 0xff;
  g.combatMap.fill(0x04);
  for (const c of g.combat) c.clear();
  for (const a of s.actors) a.tile = a.anim = 0;
  Object.assign(g.combat[0], { flags: CF.Player, who: 0, x: 5, y: 5, actor: 1 });
  s.actors[1].tile = s.actors[1].anim = 0x1c;
  [s.actors[1].x, s.actors[1].y] = [5, 5];
  Object.assign(g.combat[8], { flags: CF.Monster, who: 0x26, x: 6, y: 5, actor: 9, hp });
  s.actors[9].tile = s.actors[9].anim = 0xd8;
  [s.actors[9].x, s.actors[9].y] = [6, 5];
  newSpawns(g);
  if (gatedIn) g.summoned.add(8); // gated in during the fight (combat.ts spawned)
  const rng = g.rng as MockRandom;
  rng.queue(0, 60); // the Avatar picked; a roll of 30 - no resisting
  s.combatTurn = 8;
  await monsterMagic(g, 8);
  return { g, p, rng };
}
const daemons = (g: ReturnType<typeof newGame>['g']) =>
  g.combat.filter((c) => c.flags & CF.Monster && !(c.flags & CF.Dead) && c.who === 0x26);

describe('a daemon cast out of the one it possessed, with the Modern rules', () => {
  it('goes into them, and is not on the field while it is', async () => {
    const { g } = await possessed('modern');
    expect(g.combat[0].flags & CF.Charmed).toBeTruthy();
    expect(daemons(g)).toHaveLength(0);
    expect(g.possessedBy.get(0)).toEqual({ hp: 50, int: 25, summoned: false });
  });

  it('is thrown off on the roll against its intelligence, as though it still stood there', async () => {
    // The Avatar's 15 against the daemon's 25: under 10 throws it off.
    const { g, rng } = await possessed('modern');
    rng.queue(20); // a roll of 10
    await shakeCharm(g, 0);
    expect(g.combat[0].flags & CF.Charmed).toBeTruthy();
    rng.queue(18); // a roll of 9
    await shakeCharm(g, 0);
    expect(g.combat[0].flags & CF.Charmed).toBeFalsy();
  });

  it('comes out beside them the weaker the further the roll came under its mark, and is no gated-in daemon', async () => {
    // The Avatar's 15 against the daemon's 25: a mark of 10. A roll of 1 is 9 under - 9 times 2.5% of its 50.
    const { g, p, rng } = await possessed('modern');
    const left = g.spawnLeft;
    rng.queue(0);
    await shakeCharm(g, 0);
    await castOut(g);
    const [d] = daemons(g);
    expect(d.hp).toBe(39);
    expect(Math.max(Math.abs(d.x - 5), Math.abs(d.y - 5))).toBe(1);
    expect(p.log).toMatch(/The\s+daemon\s+is\s+cast\s+out\s+of\s+Tester!/);
    expect(g.spawnLeft).toBe(left);
    expect(g.possessedBy.size).toBe(0);
  });

  it('with the Story rules: a daemon the fight began with a fifth the weaker, one gated in with 1 hit point', async () => {
    const original = await possessed('story');
    original.rng.queue(0);
    await shakeCharm(original.g, 0);
    await castOut(original.g);
    expect(daemons(original.g).map((c) => c.hp)).toEqual([39]); // by the roll's margin, as with the Modern rules
    const gated = await possessed('story', 50, true);
    gated.rng.queue(0);
    await shakeCharm(gated.g, 0);
    await castOut(gated.g);
    expect(daemons(gated.g).map((c) => c.hp)).toEqual([1]);
    expect(gated.g.summoned.size).toBe(1); // still a daemon gated in, should it possess again
  });

  it('loses but a little to a roll just under its mark: 2.5% of its hit points, and never less than 1', async () => {
    const { g, rng } = await possessed('modern');
    rng.queue(18); // a roll of 9, 1 under the mark of 10
    await shakeCharm(g, 0);
    await castOut(g);
    expect(daemons(g).map((c) => c.hp)).toEqual([49]);
  });

  it('keeps at least 1 hit point', async () => {
    const { g, rng } = await possessed('modern', 1);
    rng.queue(0);
    await shakeCharm(g, 0);
    await castOut(g);
    expect(daemons(g).map((c) => c.hp)).toEqual([1]);
  });

  it('comes out too when the one it possessed falls', async () => {
    const { g } = await possessed('modern');
    await damage(g, 0, 99);
    await castOut(g);
    expect(daemons(g).map((c) => c.hp)).toEqual([40]);
  });

  it('is gone with the Classic rules, as in 1988: never thrown off, and lost with the one it possessed', async () => {
    const { g } = await possessed('classic');
    await damage(g, 0, 99);
    await castOut(g);
    expect(daemons(g)).toHaveLength(0);
    expect(g.possessedBy.size).toBe(0);
  });
});
