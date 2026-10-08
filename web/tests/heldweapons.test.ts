import { describe, expect, it } from 'vitest';
import { attackCommand, enemy } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { castCommand } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

const RAT = 0x14;
const DAGGER = 0x10;
const CLONE = 38;

/** On the arena: the Avatar at (2, 5), Shamino at (6, 5), and a rat at the place given (combatant 6). */
function fight(seed: number, rat: [number, number], shamino: [number, number] = [6, 5]) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  const s = g.s;
  Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff });
  for (const c of g.combat) c.flags = 0;
  const put = (i: number, at: [number, number], flags: number, who: number, hp: number, tile: number): void => {
    Object.assign(g.combat[i], { who, x: at[0], y: at[1], flags, hp, dex: 10, actor: i + 1 });
    Object.assign(s.actors[i + 1], { tile, anim: tile, x: at[0], y: at[1], z: 0 });
  };
  put(0, [2, 5], CF.Player, 0, 0, 0x1c);
  put(1, shamino, CF.Player, 1, 0, 0x1c);
  put(6, rat, CF.Monster, RAT, enemy(g, RAT).maxHp, 0x40 + RAT * 4);
  return { g, p, s };
}

describe('a dagger at a neighbour', () => {
  it('strikes from the hand: a miss flies on to nobody beside the foe, across a corner too', async () => {
    let hit = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { g, s } = fight(seed, [3, 6], [4, 6]); // the rat a corner off, Shamino beside it
      const e = s.members[0].equips;
      [e[0], e[2], e[3]] = [0xff, DAGGER, 0xff];
      s.equipment[DAGGER] = 1;
      const shamino = s.members[1].hp;
      const rat = g.combat[6].hp;
      g.options.autoAim = true;
      g.autoAim = true;
      await attackCommand(g, 0, 1);
      expect(s.members[1].hp, `seed ${seed}`).toBe(shamino);
      if (g.combat[6].hp < rat || g.combat[6].flags & CF.Dead) hit++;
      expect(s.equipment[DAGGER]).toBe(1); // nothing thrown away
    }
    expect(hit).toBeGreaterThan(10);
  });
});

describe('Y with a dagger', () => {
  it('strikes a foe beside them over a wall - a bat a corner off, a friend on one side of it and a wall on the other', async () => {
    for (const wall of [
      [2, 6],
      [3, 5],
    ]) {
      const other = wall[0] === 2 ? [3, 5] : [2, 6];
      let hit = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { g, s } = fight(seed, [3, 6], other as [number, number]);
        g.view[wall[1] * 32 + wall[0]] = 0x4f; // a wall
        g.view[6 * 32 + 3] = 0x4f; // and the foe over one, as a bat flies
        const e = s.members[0].equips;
        [e[0], e[2], e[3]] = [0xff, DAGGER, 0xff];
        s.equipment[DAGGER] = 1;
        const rat = g.combat[6].hp;
        g.options.autoAim = true;
        g.autoAim = true;
        await attackCommand(g, 0, 1);
        expect(g.cancelled, `wall at ${wall.join(',')}, seed ${seed}`).toBe(false);
        if (g.combat[6].hp < rat || g.combat[6].flags & CF.Dead) hit++;
      }
      expect(hit, `wall at ${wall.join(',')}`).toBeGreaterThan(5);
    }
  });
});

describe('Clone', () => {
  it('starts its crosshair on the nearest friend, not the nearest foe', async () => {
    const { g, p, s } = fight(1, [3, 5], [4, 6]); // the rat beside the caster, Shamino a little further
    Object.assign(s.members[0], { level: 8, mp: 99 });
    s.mixtures[CLONE] = 1;
    let start: [number, number] | null = null;
    p.next = () => {
      if (s.crosshair && !start) start = [s.crossX, s.crossY];
      return K.Escape;
    };
    g.castPreset = { caster: 0, spell: CLONE };
    await castCommand(g);
    expect(start).toEqual([4, 6]);
  });
});
