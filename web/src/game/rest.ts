/**
 * rest.ts
 *
 * A night's rest, as a camp gives it (combat.ts camp, CMDS_0000) - and, the port's, a bed in a towne, which in 1988
 * only passed the hours. A rest counts where the party sleeps six hours or more and has not rested in the fourteen
 * before (Save d588c, which the hours slept count down themselves): each member not poisoned, and not on watch, is
 * healed 1-63 hit points and has their mana back - the Avatar's and a mage's to their intelligence, a bard's to half.
 * Shorter, or too soon, it is only a wait. The port takes the rest at the hour it is earned, not at the sleep's end
 * (restTimer).
 */

import type { Game } from './game.ts';
import { Status } from './save.ts';

/** The hours between rests, counted down by the hours as they pass (time.ts). */
export const REST_EVERY = 0xe;

/** Whether sleeping `hours` from now will be a rest: six or more, and the last rest far enough back by the end of them. */
export function rests(g: Game, hours: number): boolean {
  return hours > 5 && g.s.d588c <= hours;
}

/** What sleeping `hours` will be, for the hours' spinner (input.ts getHours): a rest, or a wait - and why, if the last was too near. */
export function restOutcome(g: Game, hours: number): string {
  if (rests(g, hours)) return 'Rest';
  return hours > 5 ? 'Wait (Just Rested)' : 'Wait';
}

/**
 * When sleeping, camping or waiting `hours` from now ends, for the hours' spinner (the port's): a bed, a camp and a
 * wait all go on until the clock comes to that hour (cmds.ts holeUpInBed, combat.ts camp), so it is said as the
 * hour alone - "Until 5 PM", "Until midnight", "Until noon".
 */
export function untilLine(g: Game, hours: number): string {
  const h = (g.s.hour + hours) % 24;
  if (h === 0) return 'Until midnight';
  if (h === 12) return 'Until noon';
  return `Until ${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Whether member `m` casts at all: the Avatar, a mage and a bard have mana; a fighter has none. */
export function isCaster(g: Game, m: number): boolean {
  const cls = g.s.members[m].cls;
  return cls === 0x41 || cls === 0x4d || cls === 0x42;
}

/** A member's mana when rested: the Avatar's and a mage's their intelligence, a bard's half; a fighter has none to get back. */
export function restedMp(g: Game, m: number): number {
  const p = g.s.members[m];
  if (p.cls === 0x41 || p.cls === 0x4d) return p.int;
  if (p.cls === 0x42) return p.int >> 1;
  return p.mp;
}

/** The rest itself, once the hours are slept: every member but the dead and `skip` healed and given their mana. */
export function restMembers(g: Game, skip: (m: number) => boolean): void {
  const s = g.s;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead || skip(m)) continue;
    p.hp = Math.min(p.hp + g.random(1, 0x3f), p.maxHp);
    p.mp = restedMp(g, m);
  }
  s.d588c = REST_EVERY;
}

/**
 * A sleep's rests as they are earned (the port's): taken at the hour six hours of the sleep have passed with the last
 * rest fourteen or more behind - not at the sleep's end, as 1988 had it, which gave none to a sleep broken off by an
 * ambush or the bed's owner - the sleep going on after as a wait. A sleep of twenty or more hours may earn a second.
 * `hourPassed` is called at each hour the sleep comes to; true where a rest was taken then.
 */
export function restTimer(g: Game, skip: (m: number) => boolean): { hourPassed: () => boolean; rested: () => boolean } {
  let slept = 0;
  let rests = 0;
  return {
    hourPassed: () => {
      slept++;
      if (slept < 6 || g.s.d588c > 0) return false;
      g.say(0x41ec); // "Party rested!\n"
      restMembers(g, skip);
      slept = 0;
      rests++;
      return true;
    },
    rested: () => rests > 0,
  };
}

/** Whether a rest would do anyone good now: a member who would be healed (alive, not poisoned) short of hit points or mana. */
export function restWanted(g: Game): boolean {
  const s = g.s;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead || p.status === Status.Poisoned) continue;
    if (p.hp < p.maxHp || p.mp < restedMp(g, m)) return true;
  }
  return false;
}
