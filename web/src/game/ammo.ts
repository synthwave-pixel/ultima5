/**
 * ammo.ts
 *
 * The party's arrows (0x1b) and quarrels (0x1d), carried up to 999 under the Modern and Story rules (the port's: an
 * archer's build wants more than 1988's 99) and 99 under Classic. 1988 keeps each count in a byte of the save
 * (Save.equipment), so what lies above 99 is kept beside it (Game.ammoExtra, in the port's save): the byte stays at 99
 * while there is any, and a shot spends from above first - so everything that asks only whether there are arrows (the
 * byte 0 or not) reads as it always has, and only what shows the count, or adds to it, asks here.
 *
 * Switched to Classic with more than 99, none is taken away: nothing more is added while 99 or more are held, and the
 * party shoots its way back down to it.
 */

import type { Game } from './game.ts';

export const ARROWS = 0x1b;
export const QUARRELS = 0x1d;
/** The most carried under the Modern and Story rules, and under Classic (1988's). */
export const MODERN_CAP = 999;
export const CLASSIC_CAP = 99;
/** What the byte holds at most: the rest, under the Modern rules, is Game.ammoExtra. */
const BYTE = 99;

/** Whether `item` (an armament) is the party's ammunition. */
export const isAmmo = (item: number): boolean => item === ARROWS || item === QUARRELS;

/** How many of ammunition `item` may be carried under the rules in play. */
export const ammoCap = (g: Game): number => (g.options.rules === 'classic' ? CLASSIC_CAP : MODERN_CAP);

/** How many of ammunition `item` the party has: the byte and what lies above it. */
export function ammoHeld(g: Game, item: number): number {
  return g.s.equipment[item] + (g.ammoExtra[item] ?? 0);
}

/** The count set: up to 99 in the byte, the rest above it. */
function setHeld(g: Game, item: number, n: number): void {
  g.s.equipment[item] = Math.min(BYTE, n);
  g.ammoExtra[item] = Math.max(0, n - BYTE);
}

/**
 * `n` more of ammunition `item` (found, given, bought), up to what the rules allow - none where as many are held
 * already (Classic, with more than 99 brought from the Modern rules: kept, not added to). How many were added.
 */
export function addAmmo(g: Game, item: number, n: number): number {
  const held = ammoHeld(g, item);
  const to = Math.max(held, Math.min(ammoCap(g), held + n));
  setHeld(g, item, to);
  return to - held;
}

/** Whether no more of ammunition `item` may be carried under the rules in play. */
export const ammoFull = (g: Game, item: number): boolean => ammoHeld(g, item) >= ammoCap(g);

/** One of ammunition `item` gone (shot, stolen): from above the byte first. */
export function spendOne(g: Game, item: number): void {
  const held = ammoHeld(g, item);
  if (held > 0) setHeld(g, item, held - 1);
}

/** The party's armaments' counts as lists show them: the save's, with the ammunition's whole. */
export function armCounts(g: Game): number[] {
  const c = Array.from(g.s.equipment);
  c[ARROWS] = ammoHeld(g, ARROWS);
  c[QUARRELS] = ammoHeld(g, QUARRELS);
  return c;
}
