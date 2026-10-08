import { describe, expect, it } from 'vitest';
import { foesAbout } from '../src/game/bumpAct.ts';
import { arenaFree, attackCombat, combatantAt } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import type { Rules } from '../src/game/settings.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { actorAt, overlayActors, setView } from '../src/game/world.ts';
import { fighter, keys, newGame } from './helpers.ts';

const CHEST = 0x01;
const GOLD = 0x02;
const BODY = 0x1e; // a fallen member
const CORPSE = 0x1f; // a slain foe

/** A fight's field of floor, nobody on it: `put` sets a thing in actor slot `slot` at (x, y). */
function field(rules: Rules = 'modern') {
  const { g } = newGame();
  const s = g.s;
  g.options.rules = rules;
  s.mapId = 0xff;
  g.combatMap.fill(0x44);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) setView(g, x, y, 0x44);
  for (const a of s.actors) a.tile = a.anim = 0;
  for (const c of g.combat) Object.assign(c, { flags: 0, x: 0x63, y: 0x63 });
  const put = (slot: number, tile: number, x: number, y: number): void => {
    Object.assign(s.actors[slot], { tile, anim: tile, x, y, z: 0 });
  };
  return { g, put };
}

describe('loot on a field, with the eased rules', () => {
  it('is walked over with Story and Modern, and in the way with Classic, as in 1988', () => {
    for (const [rules, free] of [
      ['story', true],
      ['modern', true],
      ['classic', false],
    ] as [Rules, boolean][]) {
      const { g, put } = field(rules);
      put(7, CHEST, 3, 3);
      put(8, GOLD, 5, 5);
      expect(arenaFree(g, 0x1c, 3, 3)).toBe(free);
      expect(arenaFree(g, 0x1c, 5, 5)).toBe(free);
      // A body is walked over under any rules.
      put(9, CORPSE, 7, 7);
      expect(arenaFree(g, 0x1c, 7, 7)).toBe(true);
    }
  });

  it('draws a fallen member over the loot it fell on, the loot over a slain foe, and whoever stands over all', () => {
    const { g, put } = field();
    put(3, CORPSE, 2, 2); // a corpse beneath a chest, in either order of slots
    put(9, CHEST, 2, 2);
    put(4, CHEST, 3, 3);
    put(10, CORPSE, 3, 3);
    put(3 + 2, CHEST, 4, 4); // a chest with a fallen member on it, in either order
    put(11, BODY, 4, 4);
    put(12, BODY, 6, 6);
    put(6, GOLD, 6, 6);
    put(13, CHEST, 8, 8); // someone standing on a chest
    put(7, 0x80, 8, 8);
    overlayActors(g);
    expect(actorAt(g, 2, 2)).toBe(CHEST);
    expect(actorAt(g, 3, 3)).toBe(CHEST);
    expect(actorAt(g, 4, 4)).toBe(BODY);
    expect(actorAt(g, 6, 6)).toBe(BODY);
    expect(actorAt(g, 8, 8)).toBe(0x80);
  });
});

/** A fight in a towne against a rat: a chest set north of a member while the rat still stands, walked into. */
async function walkIntoChest(rules: Rules) {
  const { g, p } = newGame(2);
  journeyOnward(g);
  await enterTown(g, true);
  p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
  await townLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out')) throw e;
  });
  const s = g.s;
  g.options.rules = rules;
  const rat = g.data.table(0x18b6, 0x30).findIndex((n) => /GIANT RATS/.test(n));
  const foe = s.actors[1];
  foe.tile = foe.anim = 0x40 + rat * 4;
  [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
  const fight = fighter(g);
  let chest: [number, number] | null = null;
  let mover = -1;
  let from = -1;
  let after: [number, number] | null = null;
  p.next = () => {
    const me = g.combat[s.combatTurn];
    g.options.input = 'letters';
    if (chest && after === null && me.who === mover && me.flags & CF.Player) after = [me.x, me.y];
    const free = (y: number): boolean => y >= 0 && combatantAt(g, me.x, y) < 0;
    if (!chest && me.flags & CF.Player && !s.crosshair && foesAbout(g, 'combat') && free(me.y - 1) && free(me.y - 2)) {
      chest = [me.x, me.y - 1];
      const slot = s.actors.findIndex((v, i) => i > 0 && v.tile === 0);
      Object.assign(s.actors[slot], { tile: CHEST, anim: CHEST, x: me.x, y: me.y - 1, z: 0, b5: 5 });
      mover = me.who;
      from = p.log.length;
      g.options.input = 'controller';
      return K.Up;
    }
    return fight();
  };
  await attackCombat(g, 1);
  return { chest, after, said: p.log.slice(from, from + 120) };
}

describe('a chest walked into while a foe stands', () => {
  it('is stepped onto with the Modern rules', async () => {
    const { chest, after, said } = await walkIntoChest('modern');
    expect(chest).not.toBeNull();
    expect(after).toEqual(chest);
    expect(said).not.toMatch(/Blocked!/);
  });

  it('is in the way with the Classic rules, as in 1988', async () => {
    const { chest, after, said } = await walkIntoChest('classic');
    expect(chest).not.toBeNull();
    expect(after).not.toEqual(chest);
    expect(said).toMatch(/Blocked!/);
  });
});
