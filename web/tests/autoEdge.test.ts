import { describe, expect, it } from 'vitest';
import { autoKey } from '../src/game/autocombat.ts';
import { autoPlaysTurn } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { setAutoCombat } from '../src/game/solo.ts';
import { T } from '../src/game/tiles.ts';
import { setTileAt } from '../src/game/world.ts';
import { newGame } from './helpers.ts';

/** A dungeon room's fight on auto combat (All): the Avatar at (x, y), a foe at (fx, fy). */
const room = (x: number, y: number, fx: number, fy: number) => {
  const { g } = newGame();
  journeyOnward(g);
  g.s.mapId = 0xff;
  g.options.autoCombat = 'all';
  g.commandPrompt = 'combat';
  Object.assign(g.s, { combatTurn: 0, crosshair: 0, combatFlags: 0x80 });
  for (const c of g.combat) c.flags = 0;
  Object.assign(g.combat[0], { who: 0, x, y, flags: CF.Player, actor: 1 });
  if (fx >= 0) Object.assign(g.combat[1], { who: 0x30, x: fx, y: fy, flags: CF.Monster, hp: 50, actor: 2 });
  return g;
};

/**
 * Auto combat never walks one of the party off the field while foes stand (autocombat.ts): a member hemmed in on the
 * field's edge, the foe walled off (issue #49: two of the party walked out of a Shame room as foes waited behind its walls).
 */
describe('auto combat at the edge of the field', () => {
  it('tries the ways on the field, then passes - never the way off it', async () => {
    const g = room(10, 5, 5, 5);
    for (const [x, y] of [
      [9, 5],
      [10, 4],
      [10, 6],
    ])
      setTileAt(g, x, y, T.Wall);
    const keys: number[] = [];
    // Each blocked step costs no turn: the same member is asked again from the same square.
    for (let i = 0; i < 8; i++) keys.push(await autoKey(g));
    expect(keys).not.toContain(K.Right);
    expect(keys).toContain(K.Space);
  });

  it('nor from the top edge, the way up', async () => {
    const g = room(5, 0, 5, 8);
    for (const [x, y] of [
      [4, 0],
      [6, 0],
      [5, 1],
    ])
      setTileAt(g, x, y, T.Wall);
    const keys: number[] = [];
    for (let i = 0; i < 8; i++) keys.push(await autoKey(g));
    expect(keys).not.toContain(K.Up);
    expect(keys).toContain(K.Space);
  });
});

/** Auto combat handing a fight back (All): for the rest of that fight only, the setting kept for the next. */
describe('auto combat handed back for the fight', () => {
  it('keeps All when a dungeon room is cleared, the room left to the player', async () => {
    const g = room(10, 5, -1, -1);
    expect(await autoKey(g)).toBe(0);
    expect(g.options.autoCombat).toBe('all');
    expect(g.autoHeld).toBe(true);
    expect(autoPlaysTurn(g)).toBe(false);
    expect(await autoKey(g)).toBe(0);
  });

  it('plays again once Auto combat is changed in the Pause menu', () => {
    const g = room(10, 5, -1, -1);
    g.autoHeld = true;
    setAutoCombat(g, 'off');
    setAutoCombat(g, 'allies');
    setAutoCombat(g, 'all');
    expect(autoPlaysTurn(g)).toBe(true);
  });
});
