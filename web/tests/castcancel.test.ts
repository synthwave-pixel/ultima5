import { expect, it } from 'vitest';
import { attackCombat, onMonsterSide } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { fighter, keys, newGame } from './helpers.ts';

/**
 * A cast backed out of spends no turn (the port's): the member is asked again, and a blow struck then is a weapon's -
 * not sounded, rolled or reported as a spell, as it was while the cast's mark stayed on.
 */
it('strikes with the weapon, not as a spell, after a cast backed out of in a fight', async () => {
  const { g, p } = newGame(2);
  journeyOnward(g);
  await enterTown(g, true);
  p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
  await townLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
  const s = g.s;
  const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
  const foe = s.actors[1];
  foe.tile = foe.anim = 0x40 + rat * 4;
  [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
  const spellSounds: number[] = [];
  const noise = g.sound.noise.bind(g.sound);
  g.sound.noise = async (rate, duration, limit) => {
    if (rate === 800) spellSounds.push(duration);
    return noise(rate, duration, limit);
  };
  const fight = fighter(g);
  // 0 waiting for a member beside a foe; 1 casting (backed out of at the spell's name); 2 asked again: Attack; 3 done.
  let phase = 0;
  let who = -1;
  let flagWhenAsked = -1;
  let from = 0;
  p.next = () => {
    const me = g.combat[s.combatTurn];
    const mine = (me.flags & CF.Player) !== 0;
    const near = g.combat.some(
      (c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i) && Math.max(Math.abs(c.x - me.x), Math.abs(c.y - me.y)) <= 1,
    );
    if (phase === 0 && mine && near && !s.crosshair && g.commandPrompt === 'combat') {
      phase = 1;
      who = s.combatTurn;
      return 'C'.charCodeAt(0);
    }
    if (phase === 1) {
      if (g.commandPrompt === 'combat' && s.combatTurn === who) {
        phase = 2;
        flagWhenAsked = s.d588f;
        from = p.log.length;
        spellSounds.length = 0;
        return 'A'.charCodeAt(0);
      }
      return K.Escape; // at the spell's name
    }
    if (phase === 2 && !s.crosshair && g.commandPrompt === 'combat' && s.combatTurn !== who) phase = 3;
    if (phase === 3) throw new Error('done');
    return fight();
  };
  await attackCombat(g, 1).catch((e: Error) => {
    if (e.message !== 'done') throw e;
  });
  const blow = p.log.slice(from);
  expect(phase).toBe(3);
  expect(p.log).toContain('None!');
  expect(flagWhenAsked).toBe(0);
  expect(spellSounds).toEqual([]);
  expect(blow).not.toContain('Failed!');
});
