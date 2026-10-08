/**
 * tactics.ts (the balance simulation's player, tools/sim/armour.ts)
 *
 * A thrifty player's choices in a fight, where auto combat (game/autocombat.ts) only strikes and shoots: at each
 * member's turn, a spell when one is called for - a heal for the worst hurt, Negate Magic against creatures that
 * possess or gate in daemons, and in a dangerous fight Protection, a fire storm at a crowd, a bolt at a strong foe -
 * each cast as the command menu casts it (Game.castPreset), and auto combat's key the rest of the time. Mana and
 * mixtures are spent only where the fight calls for them (armour.ts reports what each fight burns). Only the member
 * whose turn it is casts, from their own mana.
 */

import { CF, type Game } from '../../src/game/game.ts';
import { EF, enemy, enemyFlags, onMonsterSide } from '../../src/game/combat.ts';
import { K } from '../../src/game/io.ts';
import { canCast } from '../../src/game/magic.ts';
import { Status } from '../../src/game/save.ts';

/** Spells by index (magic.ts SPELL_EFFECTS). */
export const SP = {
  heal: 0x04, // Mani
  missile: 0x01, // Grav Por
  fireBolt: 0x0d, // Flam Por
  protection: 0x13, // In Sanct
  greatHeal: 0x1b, // Vas Mani
  negateMagic: 0x20, // In An
  deathBolt: 0x25, // Corp Por
  fireStorm: 0x2d, // In Flam Hur
} as const;

const NEGATE = 0x4e; // Game.s.icon while In An lasts
const CAST = 0x43; // the Cast command

/** The foes on the field, alive and seen. */
function foes(g: Game) {
  return g.combat
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.flags !== 0 && (c.flags & CF.Dead) === 0 && (c.flags & CF.Invisible) === 0 && onMonsterSide(g, i));
}

/**
 * The key a player presses for the member whose turn it is, at the combat prompt, or 0 to leave the turn to auto
 * combat. A cast that wants a direction has it queued in `queue`. With `negate` off, Negate Magic is never cast
 * (armour.ts negate=off), to weigh what it is worth.
 */
export function tacticKey(g: Game, queue: number[], negate = true): number {
  const s = g.s;
  if (s.crosshair !== 0 && g.casting) return aimSpell(g);
  if (g.commandPrompt !== 'combat' || s.crosshair !== 0 || s.combatTurn > 0x1f) return 0;
  const me = g.combat[s.combatTurn];
  if ((me.flags & (CF.Player | CF.Charmed)) !== CF.Player) return 0;
  const who = me.who;
  const able = (spell: number) => canCast(g, who, spell) && s.icon !== NEGATE;
  const cast = (spell: number, on?: number): number => {
    g.castPreset = { caster: who, spell, on };
    return CAST;
  };
  const enemies = foes(g);
  if (!enemies.length) return 0;
  // A foe beside the caster who struck them last interrupts a cast (combat.ts interferes): the turn to auto combat.
  const o = s.d58a8[s.combatTurn];
  if (o !== 0xff) {
    const f = g.combat[o];
    const beside = Math.max(Math.abs(f.x - me.x), Math.abs(f.y - me.y)) === 1;
    if (f.flags !== 0 && onMonsterSide(g, o) && (f.flags & (CF.Asleep | CF.F4)) === 0 && s.icon !== 0x54 && beside) return 0;
  }

  // A heal for the worst hurt of the party, below 45% of their hit points.
  let worst = -1;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead || p.maxHp === 0) continue;
    if (p.hp / p.maxHp < 0.45 && (worst < 0 || p.hp / p.maxHp < s.members[worst].hp / s.members[worst].maxHp)) worst = m;
  }
  if (worst >= 0) {
    if (able(SP.greatHeal)) return cast(SP.greatHeal, worst);
    if (able(SP.heal)) return cast(SP.heal, worst);
  }

  // Negate Magic against creatures that possess or gate in daemons - its turns spent, and the party's own spells
  // with it, so cast while no one is badly hurt.
  const magical = enemies.some(({ c }) => (c.flags & CF.Player) === 0 && enemyFlags(g, c.who) & (EF.Summon | EF.Charm));
  if (negate && magical && s.icon !== NEGATE && able(SP.negateMagic)) return cast(SP.negateMagic);

  // A dangerous fight: a heavy hitter (attack 20 or more) or a creature of magic against the party, or foes with a
  // third as many hit points as the party has left. Only then is mana spent on more than a heal or Negate Magic.
  const partyHp = Array.from({ length: s.partySize }, (_, m) => s.members[m].hp).reduce((a, b) => a + b, 0);
  const foeHp = enemies.reduce((n, { c }) => n + (c.flags & CF.Player ? s.members[c.who].hp : c.hp), 0);
  const danger = magical || foeHp * 3 >= partyHp || enemies.some(({ c }) => (c.flags & CF.Player) === 0 && enemy(g, c.who).atk >= 20);
  if (!danger) return 0;

  // Protection, while no other lasting spell is up.
  if (s.icon === 0 && able(SP.protection)) return cast(SP.protection);

  // A fire storm at three strong foes or more (20 hit points), toward the most of them - never where it would burn one
  // of the party's own, as the storm burns whoever stands in it.
  const stout = enemies.filter(({ c }) => c.hp >= 20);
  if (stout.length >= 3 && able(SP.fireStorm)) {
    const ways: [number, (dx: number, dy: number) => boolean][] = [
      [K.Up, (dx, dy) => dy < 0 && Math.abs(dx) <= -dy + 1],
      [K.Down, (dx, dy) => dy > 0 && Math.abs(dx) <= dy + 1],
      [K.Left, (dx, dy) => dx < 0 && Math.abs(dy) <= -dx + 1],
      [K.Right, (dx, dy) => dx > 0 && Math.abs(dy) <= dx + 1],
    ];
    const friends = g.combat.filter((c, i) => i !== s.combatTurn && c.flags !== 0 && (c.flags & CF.Dead) === 0 && !onMonsterSide(g, i));
    const best = ways
      .filter(([, f]) => !friends.some((c) => f(c.x - me.x, c.y - me.y)))
      .map(([k, f]) => [k, stout.filter(({ c }) => f(c.x - me.x, c.y - me.y)).length] as const)
      .sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) {
      queue.push(best[0]);
      return cast(SP.fireStorm);
    }
  }

  // A bolt at a foe still strong: of 30 hit points or more, or for a mage, whose blows are weak, 20.
  const mage = s.members[who].cls === 0x4d;
  if (enemies.some(({ c }) => c.hp >= (mage ? 20 : 30))) {
    for (const bolt of [SP.deathBolt, SP.fireBolt, SP.missile]) if (able(bolt)) return cast(bolt);
  }
  return 0;
}

/** A bolt's crosshair brought to the nearest foe, and loosed there (auto combat aims only as far as a weapon reaches). */
function aimSpell(g: Game): number {
  const s = g.s;
  const me = g.combat[s.combatTurn];
  const near = foes(g).sort(
    (a, b) => Math.max(Math.abs(a.c.x - me.x), Math.abs(a.c.y - me.y)) - Math.max(Math.abs(b.c.x - me.x), Math.abs(b.c.y - me.y)),
  )[0];
  if (!near) return K.Escape;
  const dx = Math.sign(near.c.x - s.crossX);
  const dy = Math.sign(near.c.y - s.crossY);
  if (!dx && !dy) return K.Enter;
  if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
  return dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down;
}
