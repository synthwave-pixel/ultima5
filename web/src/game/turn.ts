// Whose turn it is in a fight, as a member: a module of its own, for the menus' and the spells' use without the
// fight's whole module (combat.ts).
import { CF, type Game } from './game.ts';

/**
 * The member whose turn it is in a fight, or -1: no fight, no turn, or a creature's - one on the party's side
 * (summoned, or charmed to it) is the player's to command, as in 1988 (combat.ts playerTurn), but its `who` is the
 * creature it is, not a member: no member's arms, spells or pack are its own.
 */
export function turnMember(g: Game): number {
  const s = g.s;
  if (s.mapId <= 0x7f || s.combatTurn >= 0x20) return -1;
  const c = g.combat[s.combatTurn];
  return c && (c.flags & CF.Player) !== 0 ? c.who : -1;
}

/** ULTIMA_5646: is combatant `i` on the monsters' side now (a charmed player is, a charmed monster is not). */
export function onMonsterSide(g: Game, i: number): boolean {
  const c = g.combat[i];
  if (c.flags & CF.Dead) return false;
  if (c.flags & CF.Player) {
    if (c.who !== 0 && g.s.members[c.who].name[4] === 'j') return true;
    return (c.flags & CF.Charmed) !== 0;
  }
  return (c.flags & CF.Charmed) === 0;
}

/**
 * The fight is won and no foe stands now (the port's): 1988's mark of the victory, `battleWon`, is not taken back
 * when a foe stands again after it - a charmed creature broken free, the Chaos Sword's wielder turned - and the field
 * is not to be left as won past one (Leave combat, Loot and Leave, Solo Mode's walk-out, B, auto combat).
 */
export function fieldWon(g: Game): boolean {
  if (g.s.battleWon === 0) return false;
  for (let i = 0; i < 0x20; i++) if (g.combat[i].flags !== 0 && onMonsterSide(g, i)) return false;
  return true;
}
