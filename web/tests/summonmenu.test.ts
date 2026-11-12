import { describe, expect, it } from 'vitest';
import { attackCommand, charm, enemy } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { Pad } from '../src/game/io.ts';
import { commandMenu, contextual } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * Issue #21: a creature on the party's side - a daemon summoned from a scroll, or a foe charmed (An Xen Ex) - is the
 * player's to command on its turn, as in 1988 (combat.ts playerTurn): it may attack, move, push, climb, yell, look at
 * the party, or flee, but not cast, use, ready, get, search, open or jimmy ("Can't!"). Its `who` is the creature it is,
 * not a member, yet the command menu named a member's weapon for its Attack - the first healthy member's, for a daemon
 * (who 0x26, no member); member 0's own, for a charmed Mage (who 0) - and offered the members' commands and spells.
 */
const DAEMON = 0x26;
/** Every kind of creature there is (combat.ts creatureName's table): any may be charmed to the party's side by An Xen Ex. */
const KINDS = Array.from({ length: 0x30 }, (_, k) => k);
/** Those the party summons: Kal Xen's rat, spider, bat and snake; In Bet Xen's insects; the daemon of a spell or scroll. */
const SUMMONED = [0x14, 0x15, 0x16, 0x22, 0x1f, 0x26];

/** A fight with the Avatar (halberd in hand, a heal mixed and the mana to cast it, a little hurt) and `kind` on the party's side. */
function fight(kind: number) {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  Object.assign(s, { mapId: 0xff, combatTurn: 0, townAir: 0xff });
  for (const c of g.combat) c.flags = 0;
  const halberd = g.data.table(0x17f6, 0x30).findIndex((n) => /Halberd/i.test(n));
  const m = s.members[0];
  m.equips.fill(0xff);
  m.equips[2] = halberd;
  m.mp = 30;
  m.hp = Math.max(1, m.maxHp - 20);
  s.mixtures.fill(0);
  s.mixtures[4] = 3; // Heal
  Object.assign(g.combat[0], { who: 0, x: 2, y: 5, flags: CF.Player, actor: 1 });
  Object.assign(s.actors[1], { tile: 0x1c, anim: 0x1c, x: 2, y: 5, z: 0 });
  Object.assign(g.combat[1], { who: kind, x: 3, y: 5, flags: CF.Monster, hp: enemy(g, kind).maxHp, actor: 2 });
  Object.assign(s.actors[2], { tile: 0xd8, anim: 0xd8, x: 3, y: 5, z: 0 });
  charm(g, 1, 'bound');
  Object.assign(g.combat[6], { who: 0x14, x: 7, y: 5, flags: CF.Monster, hp: enemy(g, 0x14).maxHp, actor: 7 });
  Object.assign(s.actors[7], { tile: 0x90, anim: 0x90, x: 7, y: 5, z: 0 });
  g.commandPrompt = 'combat';
  return { g, p, halberd: (g.data.table(0x17f6, 0x30)[halberd] ?? '').trim() };
}

/** The command menu's lines as shown, backed out of at once. */
async function menuLines(g: Game): Promise<string[]> {
  let shown: string[] = [];
  (g.p as unknown as { next: () => number }).next = () => {
    shown = [...(g.menuShown?.labels ?? [])];
    return Pad.B;
  };
  await commandMenu(g).catch(() => undefined);
  return shown;
}

const MEMBERS_ONLY = ['Cast', 'Use item', 'Ready', 'Get', 'Search', 'Open', 'Jimmy', 'Switch Weapon'];

describe("a creature on the party's side, on its turn", () => {
  it('covers every kind the party summons', () => expect(SUMMONED.every((k) => KINDS.includes(k))).toBe(true));

  for (const kind of KINDS) {
    it(`names no member's weapon for kind ${kind.toString(16)}'s Attack, and offers none of the members' commands or spells`, async () => {
      const { g } = fight(kind);
      g.s.combatTurn = 1;
      expect(contextual(g)[0].label).toBe('Attack');
      const lines = await menuLines(g);
      expect(lines).toContain('Attack');
      expect(lines.filter((l) => l.startsWith('Attack ('))).toEqual([]);
      for (const name of MEMBERS_ONLY) expect(lines.filter((l) => l === name || l.startsWith(`${name} (`))).toEqual([]);
      expect(lines.filter((l) => l.startsWith('Cast'))).toEqual([]);
      expect(lines).toContain('Journal');
    });
  }

  it("leaves the member's own turn as it was: their weapon, their commands, their spells", async () => {
    const { g, halberd } = fight(DAEMON);
    g.s.combatTurn = 0;
    expect(contextual(g)[0].label).toBe(`Attack (${halberd})`);
    const lines = await menuLines(g);
    for (const name of ['Cast', 'Ready', 'Switch Weapon']) expect(lines.some((l) => l === name || l.startsWith(`${name} (`))).toBe(true);
  });

  for (const kind of KINDS)
    it(`names kind ${kind.toString(16)}'s blow its attack, not bare hands`, async () => {
      const { g, p } = fight(kind);
      g.s.combatTurn = 1;
      p.log = '';
      p.next = () => Pad.B; // the aim backed out of
      await attackCommand(g, 1, 0);
      expect(p.log).toContain('Attack:');
      expect(p.log).not.toMatch(/bare hands/i);
    });
});
