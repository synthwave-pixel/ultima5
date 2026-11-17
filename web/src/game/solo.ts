/**
 * solo.ts
 *
 * Solo Mode (the port's, for a controller): 1988's active player - the one member who moves in a fight, the others'
 * turns passed (combat.ts playerTurn) - set and ended from the command menu, as the keyboard's 1-6 and 0 set it. It is
 * for a room explored or a field's loot gathered by one member, so it ends as soon as anything lands on anyone in the
 * fight - a blow that hurts (combat.ts damage, time.ts damageMembers), sleep, poison or a charm, the party's own spells
 * on a foe as much as a foe's on the party - and at any change to Auto combat, and with the fight. A won field walked
 * off by the solo member, no foe standing (turn.ts fieldWon), is left by the whole party, by the same way (combat.ts
 * leaveArena).
 */

import { drawVitals } from './frame.ts';
import type { Game } from './game.ts';
import { type AutoCombat, saveOptions } from './settings.ts';
import { turnMember } from './turn.ts';

/** Solo Mode is on: a controller's active player, in a fight. */
export const soloOn = (g: Game): boolean => g.options.input === 'controller' && g.inCombat && g.s.activeMember !== 0xff;

/** Solo Mode: the member whose turn it is becomes the only one who moves. */
export function startSolo(g: Game): void {
  const who = turnMember(g);
  if (who < 0) return;
  g.s.activeMember = who;
  g.print(`Solo: ${g.s.members[who].name}\n`);
  drawVitals(g);
}

/** Cancel Solo, or Solo Mode ended by what befell someone: `name`, who, and `how` ("hit", "asleep"). */
export function endSolo(g: Game, name?: string, how = 'hit'): void {
  g.s.activeMember = 0xff;
  g.print(name !== undefined ? `Solo off: ${name} is ${how}!\n` : 'Solo off\n');
  drawVitals(g);
}

/** Something landed on `name` in the fight - `how`: hit, asleep, poisoned, charmed: Solo Mode, if on, ends. */
export function soloHurt(g: Game, name: string, how = 'hit'): void {
  if (soloOn(g)) endSolo(g, name, how);
}

/** Auto combat set to `mode` (the Pause menu, B twice, auto combat handing the fight back): Solo Mode, if on, ends. */
export function setAutoCombat(g: Game, mode: AutoCombat): void {
  const was = g.options.autoCombat;
  g.options.autoCombat = mode;
  saveOptions(g.options);
  if (mode !== was && soloOn(g)) endSolo(g);
}
