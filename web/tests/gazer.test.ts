import { describe, expect, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import { attackCombat, damage, report } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

const [GAZER, SWARM] = [0x1c, 0x1f];

/**
 * A gazer slain lets out an insect swarm where it fell, as in 1988 (combat.ts damage). The swarm leaves no body: off
 * the field before its death is told, it was told by the empty slot's kind, the first - "Mage killed!" (1988's own).
 */
describe('a gazer, and the swarm it lets out', () => {
  it('is told killed by its own name, as the swarm after it', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    const foe = freeActor(g);
    Object.assign(s.actors[foe], { tile: 0xb0, anim: 0xb0, x: s.x, y: s.y - 1, z: s.level, b5: 0 });
    // Into the fight, and held at its first key: the field as it stands.
    p.next = () => {
      throw new Error('held');
    };
    await attackCombat(g, foe).catch((e: Error) => {
      if (e.message !== 'held') throw e;
    });
    const gazer = g.combat.findIndex((c) => c.flags & CF.Monster && c.who === GAZER);
    expect(gazer).toBeGreaterThan(-1);
    const from = p.log.length;
    await damage(g, gazer, 99);
    await report(g, gazer, 0);
    const swarm = g.combat.findIndex((c) => c.flags & CF.Monster && !(c.flags & CF.Dead) && c.who === SWARM);
    expect(swarm).toBeGreaterThan(-1); // let out where the gazer fell
    await damage(g, swarm, 99);
    await report(g, swarm, 0);
    const said = p.log.slice(from).replace(/\s+/g, ' ');
    expect(said).toContain('Gazer killed!');
    expect(said).toContain('Insect Swarm killed!');
    expect(said).not.toContain('Mage');
  });
});
