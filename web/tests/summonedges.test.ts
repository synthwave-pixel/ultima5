import { describe, expect, it } from 'vitest';
import { bumpCommand } from '../src/game/bumpAct.ts';
import { attackCombat, charm, placeCombatant, removeCombatant, shakeCharm, stat } from '../src/game/combat.ts';
import { CF } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { castCommand } from '../src/game/magic.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { tileAt } from '../src/game/world.ts';
import { keys, newGame } from './helpers.ts';

/**
 * The edges of a creature on the party's side - summoned, or charmed to it - found in testing it as the player's to
 * command: its skill in a blow, what its walking into a chest or barrel does, a clone of it, Fear, and its Escape once
 * every member has left the field.
 */
describe("a creature on the party's side, at the edges", () => {
  const RAT = 0x14;
  const DAEMON = 0x26;
  const ORC = 0x20;

  /** A fight with the Avatar at (2, 2) and `kind` bound to the party's side at (5, 5), its turn. */
  const field = (kind: number, seed = 3) => {
    const { g, p } = newGame(seed);
    journeyOnward(g);
    g.s.mapId = 0xff;
    for (const c of g.combat) c.flags = 0;
    for (const a of g.s.actors) a.tile = a.anim = 0;
    const avatar = placeCombatant(g, 0, 1, 2, 2, 0);
    const me = placeCombatant(g, kind, 0, 5, 5, 0);
    charm(g, me, 'bound');
    g.s.combatTurn = me;
    g.snapMemory.fill(-1);
    return { g, p, me, avatar };
  };

  it('strikes with its own skill - its strength or dexterity, as on a foe turn - not none at all', () => {
    for (const kind of [RAT, DAEMON, ORC]) {
      const { g, me } = field(kind);
      expect(stat(g, me, 0xff), `kind ${kind.toString(16)}`).toBe(stat(g, me, 0));
      expect(stat(g, me, 0xff)).toBeGreaterThan(0);
    }
  });

  it("leaves a chest it walks into to a member: no search begun for it, so the member's bump searches it first", () => {
    const { g, me, avatar } = field(RAT);
    Object.assign(g.s.actors[20], { tile: 0x01, anim: 0x01, x: 6, y: 5, z: 0 }); // a chest, the field won
    expect(bumpCommand(g, 'combat', 0x01, tileAt(g, 6, 5), 6, 5)).toBe(0);
    expect(g.bumped.size).toBe(0);
    g.s.combatTurn = avatar;
    expect(bumpCommand(g, 'combat', 0x01, tileAt(g, 6, 5), 6, 5)).toBe(0x53); // Search, by a member
    void me;
  });

  it('pushes a barrel it walks into, as Push lets it - never searches it', () => {
    const { g } = field(RAT);
    expect(bumpCommand(g, 'combat', 0, T.Barrel, 6, 5)).toBe(0x50);
    expect(g.bumped.size).toBe(0);
  });

  it('makes a clone of a bound creature bound too: it never shakes the charm off', async () => {
    const { g, p, me, avatar } = field(RAT);
    g.options.rules = 'modern';
    g.s.combatTurn = avatar;
    Object.assign(g.s.members[0], { level: 8, mp: 99, int: 30 });
    g.s.mixtures[0x26] = 1;
    g.castPreset = { caster: 0, spell: 0x26 };
    p.keys.push(K.Enter); // the crosshair, on the nearest friend: the rat
    await castCommand(g);
    const clone = g.combat.findIndex((c, i) => i !== me && c.flags !== 0 && c.who === RAT);
    expect(clone).toBeGreaterThanOrEqual(0);
    expect(g.charmedBy.get(clone)).toBe('bound');
    for (let n = 0; n < 50; n++) await shakeCharm(g, clone);
    expect(g.combat[clone].flags & CF.Charmed).toBe(CF.Charmed);
  });

  it("puts only the foes to flight with Fear (Corp In Quas) under the eased rules; under the Classic, the party's creatures too", async () => {
    const cast = async (rules: 'modern' | 'classic', seed: number) => {
      const { g, me, avatar } = field(RAT, seed);
      g.options.rules = rules;
      g.combat[me].hp = 40;
      g.s.combatTurn = avatar;
      Object.assign(g.s.members[0], { level: 8, mp: 99, int: 30 });
      g.s.mixtures[0x29] = 1;
      g.castPreset = { caster: 0, spell: 0x29 };
      await castCommand(g);
      return g.combat[me].hp;
    };
    for (let seed = 1; seed <= 5; seed++) expect(await cast('modern', seed)).toBe(40);
    const classic = await Promise.all([1, 2, 3, 4, 5].map((seed) => cast('classic', seed)));
    expect(classic).toContain(1); // as 1988's spell had it: every creature not a member
  });

  it('ends the fight as fled, not won, when a creature escapes after every member has left the field', async () => {
    const { g, p } = newGame(2);
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const s = g.s;
    const foe = s.actors[1];
    foe.tile = foe.anim = 0x40 + ORC * 4; // orcs, which must walk to the party to strike it
    [foe.x, foe.y, foe.z] = [s.x + 1, s.y, 0];
    let rat = -1;
    let escaped = false;
    p.next = () => {
      if (g.commandPrompt !== 'combat' || s.crosshair) return K.Escape;
      const me = g.combat[s.combatTurn];
      if (rat < 0) {
        // At the first member's prompt: a rat bound to the party beside the Avatar, the others gone from the field,
        // and the member at the field's west edge, to walk off it.
        for (let i = 0; i < 6; i++) if (i !== s.combatTurn && g.combat[i].flags & CF.Player) removeCombatant(g, -i - 1);
        me.x = s.actors[me.actor].x = 0;
        rat = placeCombatant(g, RAT, 0, 1, me.y, s.level);
        charm(g, rat, 'bound');
        return K.Left;
      }
      if (s.combatTurn === rat) {
        escaped = true;
        return K.Escape;
      }
      if (escaped) throw new Error('fight went on');
      return K.Space;
    };
    await attackCombat(g, 1).catch((e: Error) => {
      if (e.message !== 'ran out of keys') throw e;
    });
    expect(escaped).toBe(true);
    expect(p.log).toContain('BATTLE IS LOST');
    expect(p.log).not.toContain('VICTORY');
  });
});
