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
