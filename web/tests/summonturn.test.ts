import { expect, it } from 'vitest';
import { arenaFree, attackCombat, charm, placeCombatant } from '../src/game/combat.ts';
import { K } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { keys, newGame } from './helpers.ts';

/**
 * Issue #20: a daemon summoned from a scroll (magic.ts summonDaemon) is a creature bound to the party's side, its
 * `who` the creature it is (0x26), no member's. Its turn came, in the Standard look, and the turn's mark was coloured
 * as a member's bar would be - from member 0x26, who isn't there - and the game crashed.
 */
it("plays a summoned daemon's turn in the Standard look", async () => {
  const { g, p } = newGame(2);
  g.options.tileSet = 'standard';
  p.draw.marker = () => {};
  p.draw.aim = () => {};
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
  let daemon = -1;
  let played = false;
  p.next = () => {
    if (g.commandPrompt !== 'combat' || s.crosshair) return K.Escape;
    // At the first member's prompt, a daemon as the scroll places it, on a free square near them.
    if (daemon < 0) {
      const me = g.combat[s.combatTurn];
      for (let dy = -2; dy <= 2 && daemon < 0; dy++)
        for (let dx = -2; dx <= 2 && daemon < 0; dx++) {
          if (!arenaFree(g, 0xd8, me.x + dx, me.y + dy)) continue;
          daemon = placeCombatant(g, 0x26, 0, me.x + dx, me.y + dy, s.level);
          if (daemon >= 0) charm(g, daemon, 'bound');
        }
      expect(daemon).toBeGreaterThanOrEqual(0);
    } else if (s.combatTurn === daemon) played = true;
    else if (played) throw new Error('done');
    return K.Space; // every turn passed, the daemon's too
  };
  await attackCombat(g, 1).catch((e: Error) => {
    if (e.message !== 'done') throw e;
  });
  expect(played).toBe(true);
});

/**
 * Every command a member alone may give, given on a summoned daemon's turn: each refused as 1988 refuses it ("Can't!",
 * or "W-What?" for the port's Switch Weapon), the turn asked again - and none of them reads a member that isn't
 * there, as the turn's mark did (#20).
 */
it("refuses the members' commands on a summoned daemon's turn, and asks again", async () => {
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
  const commands = ['C', 'G', 'J', 'O', 'R', 'S', 'U', 'W'].map((k) => k.charCodeAt(0));
  let daemon = -1;
  let given = 0;
  p.next = () => {
    if (g.commandPrompt !== 'combat' || s.crosshair) return K.Escape;
    if (daemon < 0) {
      const me = g.combat[s.combatTurn];
      for (let dy = -2; dy <= 2 && daemon < 0; dy++)
        for (let dx = -2; dx <= 2 && daemon < 0; dx++) {
          if (!arenaFree(g, 0xd8, me.x + dx, me.y + dy)) continue;
          daemon = placeCombatant(g, 0x26, 0, me.x + dx, me.y + dy, s.level);
          if (daemon >= 0) charm(g, daemon, 'bound');
        }
    } else if (s.combatTurn === daemon) {
      if (given < commands.length) return commands[given++];
      throw new Error('done');
    }
    return K.Space;
  };
  p.log = '';
  await attackCombat(g, 1).catch((e: Error) => {
    if (e.message !== 'done') throw e;
  });
  expect(given).toBe(commands.length);
  // Seven "Can't!" and Switch Weapon's "W-What?", each its own turn asked again - still the daemon's.
  expect(p.log.match(/Can't!/g)?.length).toBe(7);
  expect(p.log).toContain('W-What?');
});
