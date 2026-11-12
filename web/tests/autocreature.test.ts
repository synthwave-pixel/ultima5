import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { charm, placeCombatant } from '../src/game/combat.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * Auto combat playing a creature on the party's side (autocombat.ts): it strikes where its own attack would reach a
 * foe - a daemon's fire only along a clear line, as Attack and its snap target have it (combat.ts snapTargets) - and
 * looses at that foe, not at the nearest one a rock stands before, its fire spent on the rock turn after turn.
 */
describe('auto combat, a creature on the party side', () => {
  const DAEMON = 0x26;
  const ORC = 0x20;
  const STEP: Record<number, [number, number]> = {
    [K.Left]: [-1, 0],
    [K.Right]: [1, 0],
    [K.Up]: [0, -1],
    [K.Down]: [0, 1],
    0xd3: [-1, -1],
    0xd4: [-1, 1],
    0xd5: [1, -1],
    0xd6: [1, 1],
  };

  /** A daemon on the party's side at (2, 5), a rock at (4, 5), an orc behind it at (5, 5) - and another at (2, 9) if `clear`. */
  const field = (clear: boolean) => {
    const { g } = newGame(7);
    journeyOnward(g);
    Object.assign(g.options, { autoCombat: 'all', rules: 'modern' });
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    placeCombatant(g, 0, 1, 0, 0, 0);
    const me = placeCombatant(g, DAEMON, 0, 2, 5, 0);
    charm(g, me, 'bound');
    g.s.mapId = 0xff;
    g.view[5 * 32 + 4] = 0x4f; // a rock in the way (as heldweapons.test.ts walls a shot)
    const behind = placeCombatant(g, ORC, 0, 5, 5, 0);
    const open = clear ? placeCombatant(g, ORC, 0, 2, 9, 0) : -1;
    Object.assign(g.s, { combatTurn: me, crosshair: 0, battleWon: 0, combatFlags: 0 });
    g.commandPrompt = 'combat';
    g.snapMemory.fill(-1);
    return { g, me, behind, open };
  };

  it('attacks with a foe along a clear line, and looses at it, not at the nearer one behind the rock', async () => {
    const { g, behind, open } = field(true);
    expect(await autoKey(g)).toBe(0x41);
    // The crosshair as Attack's aim starts it: on the nearest foe within reach, the one behind the rock.
    Object.assign(g.s, { crosshair: 1, crossX: g.combat[behind].x, crossY: g.combat[behind].y });
    let key = 0;
    for (let n = 0; n < 12; n++) {
      key = await autoKey(g);
      const step = STEP[key];
      if (!step) break;
      g.s.crossX += step[0];
      g.s.crossY += step[1];
    }
    expect(key).toBe(K.Enter);
    expect([g.s.crossX, g.s.crossY]).toEqual([g.combat[open].x, g.combat[open].y]);
  });

  it('moves, not attacks, where the only foe in reach is behind a rock', async () => {
    const { g } = field(false);
    const key = await autoKey(g);
    expect(key).not.toBe(0x41);
    expect(STEP[key] ?? null).not.toBeNull();
  });
});
