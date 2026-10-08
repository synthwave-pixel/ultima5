import { describe, expect, it } from 'vitest';
import { attackCombat, enemy } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { fighter, keys, newGame } from './helpers.ts';

async function outside(seed = 1234) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  await enterTown(g, true);
  p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
  await townLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
  p.log = '';
  return { g, p };
}

describe('combat', () => {
  it('reads the monster table', async () => {
    const { g } = await outside();
    const names = g.data.table(0x18b6, 0x30);
    const rat = names.findIndex((n) => /GIANT RATS/.test(n));
    expect(rat).toBeGreaterThan(0);
    expect(enemy(g, rat).maxHp).toBeGreaterThan(0);
  });

  for (const seed of [1, 2, 3]) {
    it(`fights giant rats to the end and puts the world back (seed ${seed})`, async () => {
      const { g, p } = await outside(seed);
      const s = g.s;
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      const foe = s.actors[1];
      foe.tile = foe.anim = 0x40 + rat * 4;
      foe.x = s.x + 1;
      foe.y = s.y;
      foe.z = 0;
      const [x, y] = [s.x, s.y];
      p.next = fighter(g);
      await attackCombat(g, 1);
      expect(p.log).toContain('CONFLICT');
      expect(p.log).toMatch(/killed!/);
      expect(p.log).toMatch(/VICTORY|BATTLE IS LOST/);
      expect([s.x, s.y, s.mapId]).toEqual([x, y, 0]);
      if (p.log.includes('VICTORY')) expect(s.actors[1].tile).toBe(0);
      expect(g.combat.every((c) => c.flags === 0 || c.flags & CF.Dead || !(c.flags & CF.Player))).toBe(true);
    });
  }

  it('leaves a won field saying "Leave!", as a member walking off it does - not "Escape!"', async () => {
    for (const seed of [1, 2, 3]) {
      const { g, p } = await outside(seed);
      const s = g.s;
      const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
      Object.assign(s.actors[1], { tile: 0x40 + rat * 4, anim: 0x40 + rat * 4, x: s.x + 1, y: s.y, z: 0 });
      p.next = fighter(g); // Escape (the menu's "Leave combat") once no foe stands
      await attackCombat(g, 1);
      if (!p.log.includes('VICTORY')) continue;
      const after = p.log.slice(p.log.lastIndexOf('VICTORY'));
      expect(after, `seed ${seed}`).toMatch(/Leave!/);
      expect(after, `seed ${seed}`).not.toMatch(/Escape/);
      return;
    }
    throw new Error('no seed won its fight');
  });

  it('casts In Flam Hur in a fight, a wave of fire toward the rats', async () => {
    const { g, p } = await outside(7);
    const s = g.s;
    const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + rat * 4;
    foe.x = s.x + 1;
    foe.y = s.y;
    foe.z = 0;
    const spell = 0x2d;
    const words = g.data.table(0x1c30, 0x30)[spell];
    for (const m of s.members.slice(0, s.partySize)) {
      m.level = 8;
      m.mp = 50;
    }
    s.mixtures[spell] = 10;
    const fight = fighter(g);
    let cast = false;
    p.next = () => {
      if (!cast && !s.crosshair) {
        cast = true;
        p.keys.push(...keys(words, K.Enter, K.Up));
        return 'C'.charCodeAt(0);
      }
      return fight();
    };
    await attackCombat(g, 1);
    expect(p.log).toContain('Cast...');
    expect(p.log).toMatch(/Direction-\s*North/);
    expect(s.mixtures[spell]).toBe(9);
    expect(p.log).toMatch(/VICTORY|BATTLE IS LOST/);
  });
});
