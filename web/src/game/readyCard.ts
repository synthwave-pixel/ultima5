/**
 * readyCard.ts
 *
 * An armament's card on the party panel while the controller's Ready list is open (the port's, the Standard look):
 * its name, its attack, defence, range and weight - each marked + or - against what readying it would put back in
 * the pack (zstats.ts placesFor), or against nothing where the place is free - how it is held, and what the game
 * does with it beyond its numbers: thrown and gone, the arrows it wants, a ring's or an amulet's power. Every number
 * is read from the player's own files; the notes are the port's, each saying what the code does.
 */

import type { Game } from './game.ts';
import { drawVitals, Win } from './frame.ts';
import { Colour } from '../ui/colours.ts';
import { hasAmmo, isShield, placesFor, THROWN, THROWN_KEPT, wears } from './zstats.ts';
import { keepsLastThrow } from './settings.ts';
import { handsOf, planSwitch, type SwitchPlan } from './switchWeapon.ts';

/** The panel's width in letters. */
const W = 15;

/** The rows of the panel at its full height the card is written on: above the divider, and the two below it. */
const TOP = [0, 1, 2, 3, 4, 5];
const FOOT = [7, 8];

/** How an armament of each kind (the table at 0x1a7e) is held or worn. */
const HELD: Record<number, string> = { 0x80: 'Helm', 0x40: 'Armour', 0x20: 'One hand', 0x30: 'Two hands', 4: 'Amulet', 2: 'Ring' };

/** What an armament does beyond its numbers (combat.ts, time.ts, zstats.ts equip), two lines at most. */
const POWERS: Record<number, string[]> = {
  0x0f: ['Only it guards', 'in Doom'], // armourClass: in Doom a member's armour counts only with it on
  0x23: ['Always hits', 'Charms wielder'], // the Chaos Sword: hitRoll's sure hit, and its wielder not his own
  0x27: ['Sure kill, then', 'it shatters'], // 99 damage, and "Thy sword hath shattered!"
  0x28: ['Always hits', 'Does no harm'], // a sure hit for no damage
  0x2a: ['Unseen in fight', 'May vanish'], // ringTurn; a ring may vanish as a fight begins
  0x2b: ['Adds defence'],
  0x2c: ['Heals slowly', 'May vanish'], // a point now and then, in a fight and out
  0x2d: ['Turns magic 1/2'], // half of a magic foe's missiles turned back
  0x2e: ['Adds defence'],
  0x2f: ['Holds no power'], // nothing in the game reads it
};

/** A weapon of magic: undead take its full harm, half of any other's (combat.ts attackWith, damage). */
const MAGIC = 0x23;

/** An armament's attack as the game deals it: the jewelled sword's is none, whatever its table says. */
export function attackOf(g: Game, item: number): number {
  return item === 0x28 ? 0 : g.data.bytes(0x15fc, 0x38)[item];
}

/** A weapon's reach in squares: a blade's is the square beside. */
export function rangeOf(g: Game, item: number): number {
  return Math.max(1, g.data.bytes(0x1664, 0x38)[item]);
}

/** A stat's line: its name, its number and the mark against what it would replace (+ better, - worse). */
function stat(name: string, value: number, was: number | null, better: (a: number, b: number) => boolean): string {
  const mark = was === null || value === was ? ' ' : better(value, was) ? '+' : '-';
  return `${name.padEnd(W - 5)}${String(value).padStart(3)} ${mark}`;
}

/**
 * The card's lines for member `m` and armament `item`: those for the rows above the panel's divider (the name, the
 * stats, how it is held) and those for the two below it (the notes). The marks compare with what readying it would
 * pack away - a two-handed axe with the sword and shield both - and there are none on what the member has on.
 */
export function cardLines(g: Game, m: number, item: number): { top: string[]; foot: string[] } {
  const s = g.s;
  const e = s.members[m].equips;
  const kind = g.data.bytes(0x1a7e, 0x30)[item];
  const def = g.data.bytes(0x1634, 0x30);
  const weight = g.data.bytes(0x1aae, 0x30);
  const long = g.data.table(0x17f6, 0x30)[item] ?? '';
  const name = long.length <= W ? long : (g.data.table(0x1962, 0x38)[item]?.trim() ?? '');
  // Arrows and quarrels are not held at all: drawn by what shoots them.
  if (item === 0x1b || item === 0x1d)
    return { top: [name.padStart((W + name.length) >> 1)], foot: [item === 0x1b ? 'For bows' : 'For crossbows'] };
  const on = wears(g, m, item);
  const out = on ? [] : placesFor(g, m, item).filter((k) => e[k] !== 0xff);
  const gone = out.map((k) => e[k]);
  const sum = (f: (i: number) => number): number => gone.reduce((n, i) => n + f(i), 0);
  const was = (v: number): number | null => (on ? null : v);
  const more = (a: number, b: number): boolean => a > b;
  const weapon = (kind === 0x20 || kind === 0x30) && !isShield(item);
  const top = [name.padStart((W + name.length) >> 1)];
  const attack = attackOf(g, item);
  const lost = sum((i) => attackOf(g, i));
  if (weapon || attack > 0 || lost > 0) top.push(stat('Attack', attack, was(lost), more));
  const guards = sum((i) => def[i]);
  if (!weapon || def[item] > 0 || guards > 0) top.push(stat('Defence', def[item], was(guards), more));
  if (weapon) {
    const shot = gone.filter((i) => attackOf(g, i) > 0 || g.data.bytes(0x1664, 0x38)[i] > 0);
    top.push(stat('Range', rangeOf(g, item), was(shot.length ? Math.max(...shot.map((i) => rangeOf(g, i))) : 0), more));
  }
  top.push(stat('Weight', weight[item], was(sum((i) => weight[i])), (a, b) => a < b));
  top.push(on ? (kind === 0x20 || kind === 0x30 ? 'In hand' : 'Worn') : (HELD[kind] ?? ''));
  const foot: string[] = [];
  // What the game would refuse (zstats.ts canReady): armour on or off in a fight, more than the member can carry.
  const inFight = s.mapId > 0x7f && s.battleWon === 0;
  if (inFight && ((item >= 9 && item <= 0xf) || out.some((k) => k <= 1))) foot.push('Not in a fight');
  if (!on) {
    let carried = weight[item];
    for (let k = 0; k < 6; k++) if (e[k] !== 0xff && !out.includes(k)) carried += weight[e[k]];
    if (carried > s.members[m].str) foot.push('Too heavy');
  }
  if (item === 0x1a || item === 0x24) foot.push(hasAmmo(g, item) ? `Arrows ${s.equipment[0x1b]}` : 'No arrows');
  if (item === 0x1c) foot.push(hasAmmo(g, item) ? `Quarrels ${s.equipment[0x1d]}` : 'No quarrels');
  if (THROWN.includes(item)) {
    foot.push('Thrown, used up');
    if (keepsLastThrow(g.options) && THROWN_KEPT.includes(item)) foot.push('Last one kept');
  }
  if (item === 0x26) foot.push('Thrown, returns');
  foot.push(...(POWERS[item] ?? []));
  if (item >= MAGIC && item <= 0x29 && !POWERS[item]) foot.push('Full vs undead');
  if (g.data.bytes(0x169c, 0x38)[item] === 8) foot.push('Str to hit'); // combat.ts stat: strength, not dexterity
  return { top: top.slice(0, TOP.length), foot: foot.slice(0, FOOT.length) };
}

/** The card drawn over the party (the panel at its full height): the party's lines first, then the card over them. */
export function drawItemCard(g: Game, m: number, item: number): void {
  drawCard(g, cardLines(g, m, item));
}

/** A card's lines drawn over the party: the party's lines first, then the card over them. */
function drawCard(g: Game, { top, foot }: { top: string[]; foot: string[] }): void {
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false); // the border's title and the divider, where the card leaves them
  t.select(Win.stats);
  t.win.fg = Colour.brightWhite;
  const put = (rows: number[], lines: string[]): void =>
    rows.forEach((r, i) => {
      t.moveTo(0, r);
      g.print((lines[i] ?? '').padEnd(W).slice(0, W));
    });
  put(TOP, top);
  put(FOOT, foot);
  t.win.fg = fg;
  t.select(was);
}

/**
 * Switch Weapon's card (switchWeapon.ts planSwitch): the arms it would take up - a name a line, the set's attack,
 * defence, reach and weight marked against what is in hand - and below, why it is not what was remembered ("No
 * arrows") or whether it is melee or ranged, and the arrows or quarrels left; or why it would take up nothing.
 */
export function switchCardLines(g: Game, m: number, plan: SwitchPlan | string): { top: string[]; foot: string[] } {
  const s = g.s;
  if (typeof plan === 'string') return { top: ['Switch Weapon'.padStart((W + 13) >> 1)], foot: [plan] };
  const def = g.data.bytes(0x1634, 0x30);
  const weight = g.data.bytes(0x1aae, 0x30);
  const names = g.data.table(0x17f6, 0x30);
  const now = handsOf(g, m);
  const sum = (set: number[], f: (i: number) => number): number => set.reduce((n, i) => n + f(i), 0);
  const reach = (set: number[]): number => Math.max(0, ...set.filter((i) => attackOf(g, i) > 0).map((i) => rangeOf(g, i)));
  const more = (a: number, b: number): boolean => a > b;
  const top = plan.items.map((i) => {
    const name = (names[i] ?? '').trim();
    const short = name.length <= W ? name : (g.data.table(0x1962, 0x38)[i]?.trim() ?? '');
    return short.padStart((W + short.length) >> 1);
  });
  top.push(
    stat(
      'Attack',
      sum(plan.items, (i) => attackOf(g, i)),
      sum(now, (i) => attackOf(g, i)),
      more,
    ),
  );
  top.push(
    stat(
      'Defence',
      sum(plan.items, (i) => def[i]),
      sum(now, (i) => def[i]),
      more,
    ),
  );
  top.push(stat('Range', reach(plan.items), reach(now), more));
  top.push(
    stat(
      'Weight',
      sum(plan.items, (i) => weight[i]),
      sum(now, (i) => weight[i]),
      (a, b) => a < b,
    ),
  );
  const foot = [plan.missing ?? (plan.to === 'ranged' ? 'Ranged' : 'Melee')];
  if (plan.items.some((i) => i === 0x1a || i === 0x24)) foot.push(`Arrows ${s.equipment[0x1b]}`);
  else if (plan.items.includes(0x1c)) foot.push(`Quarrels ${s.equipment[0x1d]}`);
  else if (plan.items.some((i) => THROWN.includes(i))) foot.push('Thrown, used up');
  return { top: top.slice(0, TOP.length), foot: foot.slice(0, FOOT.length) };
}

/** Switch Weapon's card drawn over the party, as Ready's is (drawItemCard), for the member whose turn it is. */
export function drawSwitchCard(g: Game, m: number): void {
  drawCard(g, switchCardLines(g, m, planSwitch(g, m)));
}
