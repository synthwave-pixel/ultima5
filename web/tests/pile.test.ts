import { describe, expect, it } from 'vitest';
import { placeCombatant, thingAt } from '../src/game/combat.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { searchCommand } from '../src/game/items.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame, type FakePlatform } from './helpers.ts';

/**
 * Two fallen on one square, one of them searched to gold: the map shows the gold (a body is drawn only where nothing
 * else lies), so walking into the square is for the gold - and Search still finds the body under it.
 */
describe('a body under gold', () => {
  const field = (): { g: Game; p: FakePlatform } => {
    const { g, p } = newGame(1);
    journeyOnward(g);
    g.s.mapId = 0xff; // a fight
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    const me = placeCombatant(g, 0, 1, 5, 5, 0);
    Object.assign(g.s, { combatTurn: me, x: 5, y: 5 }); // the member's turn, where it stands
    // The body first, in a lower slot; the gold over it.
    Object.assign(g.s.actors[10], { tile: 0x1f, anim: 0x1f, x: 5, y: 6, z: 0 });
    Object.assign(g.s.actors[20], { tile: 2, anim: 2, x: 5, y: 6, z: 0, b5: 3 });
    return { g, p };
  };

  it('is walked into for the gold, as the map shows it', () => {
    const { g } = field();
    expect(thingAt(g, 5, 6)).toBe(2);
    g.s.actors[20].tile = g.s.actors[20].anim = 0; // the gold taken
    expect(thingAt(g, 5, 6)).toBe(0x1f);
  });

  it('is found by Search though gold lies over it', async () => {
    const { g, p } = field();
    p.keys.push(K.Down);
    await searchCommand(g);
    expect(p.log).not.toMatch(/nothing of note/);
    expect(g.s.actors[10].tile).not.toBe(0x1f); // searched: remains gone, or turned to food or gold
  });
});
