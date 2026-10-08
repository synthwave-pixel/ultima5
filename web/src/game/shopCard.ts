/**
 * shopCard.ts
 *
 * An armoury's wares weighed for one of the party (the port's, a controller's buying): the wares in the order they
 * can be had - what the buyer can carry and the party afford, then what the party cannot afford, then what the buyer
 * could not carry - and, on the party panel while the bar is on one, what the buyer has where it would go, "vs", the
 * ware, and each of their numbers that matters with the difference: green where the ware is better, red where it is
 * worse, white where it is the same. What an armament does beyond its numbers is said under them (POWERS) - green
 * where the change is a gain, red where it is a cost - with two hands where a shield would have to go ("2 hands"), no
 * arrows or quarrels for a bow or crossbow ("No ammo"), and "Too heavy" where the buyer could not carry it with what
 * they keep on. A glass sword has no numbers: one hit, one kill, one use.
 */

import type { Game } from './game.ts';
import { borderTitle, compactPanel, drawVitals, Win } from './frame.ts';
import { Colour } from '../ui/colours.ts';
import { attackOf, rangeOf } from './readyCard.ts';
import { isShield, placesFor, THROWN } from './zstats.ts';

/** The panel's width in letters. */
const W = 15;
/** The panel's rows above its divider (at its full height), and the row under the food and gold (the date's). */
const ROWS = 6;
const NOTE_ROW = 8;

/** Arrows and quarrels: not held, so weighed against nothing. */
const AMMO = [0x1b, 0x1d];
/** The armaments' kinds that are held (the table at 0x1a7e): one hand, two hands. */
const HAND = 0x20;
const HANDS = 0x30;
/** Weapons of magic: undead take their full harm (combat.ts). */
const MAGIC_FROM = 0x23;
const MAGIC_TO = 0x29;
const BOOMERANG = 0x26;
const CHAOS = 0x23;
const GLASS = 0x27;
const JEWELED = 0x28;
const MYSTIC_ARMOUR = 0x0f;

/** A run of letters in one colour. */
export interface Run {
  text: string;
  colour: number;
}
export type Line = Run[];

/** What the buyer has where `item` would go, put back in the pack for it (zstats.ts placesFor): none where it is free. */
export function replaced(g: Game, m: number, item: number): number[] {
  if (AMMO.includes(item)) return [];
  const e = g.s.members[m].equips;
  return placesFor(g, m, item)
    .filter((k) => e[k] !== 0xff)
    .map((k) => e[k]);
}

/** Whether the buyer could not carry `item`, with what they keep on beside it (as zstats.ts canReady weighs it). */
export function tooHeavy(g: Game, m: number, item: number): boolean {
  if (AMMO.includes(item)) return false;
  const e = g.s.members[m].equips;
  const weight = g.data.bytes(0x1aae, 0x30);
  const out = placesFor(g, m, item).filter((k) => e[k] !== 0xff);
  let carried = weight[item];
  for (let k = 0; k < 6; k++) if (e[k] !== 0xff && !out.includes(k)) carried += weight[e[k]];
  return carried > g.s.members[m].str;
}

/** How a ware stands for the buyer: 0 to be had, 1 not affordable, 2 not to be carried (the menu's order and greys). */
export function standing(g: Game, m: number, item: number, price: number): 0 | 1 | 2 {
  if (tooHeavy(g, m, item)) return 2;
  return g.s.gold < price ? 1 : 0;
}

/** The wares in the menu's order: to be had, then unaffordable, then too heavy - each as the shop lists them. */
export function sortWares(g: Game, m: number, wares: number[], price: (item: number) => number): number[] {
  return wares
    .map((item, i) => ({ item, i, rank: standing(g, m, item, price(item)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((w) => w.item);
}

/** An armament's name as the panel has room for it: the long one where it fits, else the short. */
function nameOf(g: Game, item: number): string {
  const long = g.data.table(0x17f6, 0x30)[item] ?? '';
  return long.length <= W ? long : (g.data.table(0x1962, 0x38)[item]?.trim() ?? '');
}

/** A number's line: its label, the ware's number, and the difference from what it would replace. */
function statLine(label: string, value: number, was: number, lowerIsBetter = false): Line {
  const diff = value - was;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const colour = diff === 0 ? Colour.brightWhite : better ? Colour.brightGreen : Colour.brightRed;
  return [
    { text: `${label.padEnd(4)}${String(value).padStart(3)} `, colour: Colour.brightWhite },
    { text: `(${diff < 0 ? '-' : '+'}${Math.abs(diff)})`, colour },
  ];
}

/**
 * What an armament does beyond its numbers (combat.ts, time.ts), by the word the card says it with, and whether it is
 * a gain to have: thrown and used up, returns, full harm to the undead (a weapon of magic), a sure hit; the rings' and
 * the amulet's powers; the one armour that counts in Doom - and the costs some carry, a sword that shatters, one that
 * takes its wielder over, one that does no harm.
 */
const POWERS: { word: string; good: boolean; has: (item: number) => boolean }[] = [
  { word: 'Thrown', good: true, has: (i) => THROWN.includes(i) },
  { word: 'Returns', good: true, has: (i) => i === BOOMERANG },
  { word: 'Magic', good: true, has: (i) => i >= MAGIC_FROM && i <= MAGIC_TO }, // combat.ts attackWith, damage
  { word: 'Sure hit', good: true, has: (i) => i === CHAOS || i === GLASS || i === JEWELED }, // hitRoll
  { word: 'Shatters', good: false, has: (i) => i === GLASS }, // damageRoll: 99, then gone
  { word: 'Charms you', good: false, has: (i) => i === CHAOS }, // its wielder fights as one charmed
  { word: 'No harm', good: false, has: (i) => i === JEWELED }, // damageRoll: none
  { word: 'Invisible', good: true, has: (i) => i === 0x2a }, // ringTurn
  { word: 'Regenerates', good: true, has: (i) => i === 0x2c }, // ringTurn, time.ts regenerate
  { word: 'Turns magic', good: true, has: (i) => i === 0x2d }, // half a magic foe's missiles turned back
  { word: 'Counts in Doom', good: true, has: (i) => i === MYSTIC_ARMOUR }, // armourClass
];

/** The powers among `items`. */
function powers(items: number[]): Set<string> {
  return new Set(POWERS.filter((p) => items.some((i) => p.has(i))).map((p) => p.word));
}

/**
 * The card's lines for buyer `m` and ware `item`: the rows above the panel's divider, and a line for the row under
 * the food and gold where the rows run out.
 */
export function wareCard(g: Game, m: number, item: number): { rows: Line[]; note: Line } {
  const s = g.s;
  const white = (text: string): Line => [{ text, colour: Colour.brightWhite }];
  const centred = (text: string, colour: number): Line => [{ text: text.padStart((W + text.length) >> 1), colour }];
  const ware = nameOf(g, item);
  if (AMMO.includes(item)) {
    const have = s.equipment[item];
    return { rows: [centred(ware, Colour.brightWhite), white(`${item === 0x1b ? 'Arrows' : 'Quarrels'} had ${have}`)], note: [] };
  }
  if (item === GLASS) {
    // No numbers for the glass sword: one blow, sure to strike and to kill, and then it is gone (combat.ts hitRoll,
    // damageRoll) - its 99 against a sword's 15 would only mislead. Too heavy still said, under it.
    const rows = [centred(ware, Colour.brightWhite), [], centred('1 hit', Colour.brightGreen), centred('1 kill', Colour.brightGreen)];
    rows.push(centred('1 use', Colour.brightRed));
    if (tooHeavy(g, m, item)) rows.push(centred('Too heavy', Colour.brightRed));
    return { rows, note: [] };
  }
  const gone = replaced(g, m, item);
  const short = g.data.table(0x1962, 0x38);
  // A weapon and a shield both put away (a two-handed ware): the shield said short, so both fit the line.
  const had = (gone.length ? gone.map((i) => (gone.length > 1 && isShield(i) ? 'Shld' : short[i].trim())).join('+') : 'Nothing').slice(
    0,
    W,
  );
  const kind = g.data.bytes(0x1a7e, 0x30)[item];
  const def = g.data.bytes(0x1634, 0x30);
  const weight = g.data.bytes(0x1aae, 0x30);
  const sum = (f: (i: number) => number): number => gone.reduce((n, i) => n + f(i), 0);
  const weapon = (kind === HAND || kind === HANDS) && !isShield(item);
  const stats: Line[] = [];
  const attack = attackOf(g, item);
  // A glass sword put away is no blow lost to weigh: its one kill is no attack to set a sword's against.
  const lostAttack = sum((i) => (i === GLASS ? 0 : attackOf(g, i)));
  if (weapon || attack > 0 || lostAttack > 0) stats.push(statLine('Atk', attack, lostAttack));
  const guards = sum((i) => def[i]);
  if (!weapon || def[item] > 0 || guards > 0) stats.push(statLine('Def', def[item], guards));
  // Reach only where it is more than the square beside, the ware's or what it replaces.
  const shot = gone.filter((i) => attackOf(g, i) > 0 || g.data.bytes(0x1664, 0x38)[i] > 0);
  const reachWas = shot.length ? Math.max(...shot.map((i) => rangeOf(g, i))) : 0;
  if (weapon && (rangeOf(g, item) > 1 || reachWas > 1)) stats.push(statLine('Rng', rangeOf(g, item), reachWas));
  stats.push(
    statLine(
      'Wt',
      weight[item],
      sum((i) => weight[i]),
      true,
    ),
  );
  // The notes: too heavy first, then what is gained (green) and lost (red), as many as the row holds.
  const notes: Run[] = [];
  if (tooHeavy(g, m, item)) notes.push({ text: 'Too heavy', colour: Colour.brightRed });
  if (item === 0x1a || item === 0x24) {
    if (s.equipment[0x1b] === 0) notes.push({ text: 'No ammo', colour: Colour.brightRed });
  } else if (item === 0x1c && s.equipment[0x1d] === 0) notes.push({ text: 'No ammo', colour: Colour.brightRed });
  if (kind === HANDS && gone.some((i) => isShield(i))) notes.push({ text: '2 hands', colour: Colour.brightRed });
  const now = powers([item]);
  const before = powers(gone);
  // The costs first - one gained (a sword that shatters) or a gain lost - then what is to the good: so where the rows
  // run out it is never a cost that goes unsaid.
  const good = (word: string): boolean => POWERS.find((p) => p.word === word)?.good ?? true;
  const changes = [
    ...[...now].filter((p) => !before.has(p)).map((p) => ({ text: `+${p}`, gain: good(p) })),
    ...[...before].filter((p) => !now.has(p)).map((p) => ({ text: `-${p}`, gain: !good(p) })),
  ];
  for (const c of [...changes.filter((c) => !c.gain), ...changes.filter((c) => c.gain)])
    notes.push({ text: c.text, colour: c.gain ? Colour.brightGreen : Colour.brightRed });
  // The notes set in lines of the panel's width, a note that will not fit beginning the next.
  const noteLines: Line[] = [];
  let used = W;
  for (const n of notes) {
    if (used + 1 + n.text.length > W) {
      noteLines.push([n]);
      used = n.text.length;
    } else {
      noteLines[noteLines.length - 1].push({ text: ' ', colour: Colour.brightWhite }, n);
      used += 1 + n.text.length;
    }
  }
  // What it replaces, "vs", the ware: "vs" goes on the ware's line where the numbers need its row.
  const head: Line[] =
    3 + stats.length <= ROWS
      ? [
          centred(had, gone.length ? Colour.brightWhite : Colour.darkGray),
          centred('vs', Colour.lightGray),
          centred(ware, Colour.brightWhite),
        ]
      : [centred(had, gone.length ? Colour.brightWhite : Colour.darkGray), centred(`vs ${ware}`.slice(0, W), Colour.brightWhite)];
  const rows = [...head, ...stats];
  // The notes in the stat block's rows left, then the row under the food and gold.
  const free = ROWS - rows.length;
  return { rows: [...rows, ...noteLines.slice(0, free)], note: noteLines[free] ?? [] };
}

/** Print a line at a row of the party's window, cleared to the panel's width. */
function putLine(g: Game, row: number, line: Line): void {
  const t = g.text;
  t.moveTo(0, row);
  let used = 0;
  for (const run of line) {
    const text = run.text.slice(0, W - used);
    t.win.fg = run.colour;
    g.print(text);
    used += text.length;
  }
  t.win.fg = Colour.brightWhite;
  if (used < W) g.print(' '.repeat(W - used));
}

/** The card over the party (the panel at its full height), the buyer named on the border. */
export function drawWareCard(g: Game, m: number, item: number): void {
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false);
  borderTitle(g, `${g.s.members[m].name}:`);
  t.select(Win.stats);
  const { rows, note } = wareCard(g, m, item);
  for (let r = 0; r < ROWS; r++) putLine(g, r, rows[r] ?? []);
  // The row under the food and gold is the card's, blank where it has nothing to say: the date is on the border.
  putLine(g, NOTE_ROW, note);
  t.win.fg = fg;
  t.select(was);
}

/** Who is to buy (the menu before the wares): each of the party with what is in their hands and on their back. */
export function drawBuyers(g: Game): void {
  const s = g.s;
  const t = g.text;
  const was = t.current;
  const short = g.data.table(0x1962, 0x38);
  drawVitals(g, false);
  borderTitle(g, 'Readied:');
  t.select(Win.stats);
  for (let i = 0; i < ROWS; i++) {
    let line: Line = [];
    if (i < s.partySize) {
      const e = s.members[i].equips;
      const held = [2, 3, 1].map((k) => e[k]).filter((v) => v !== 0xff);
      const what = held.length ? held.map((v) => short[v].trim()).join(',') : '-';
      line = [{ text: `${s.members[i].name.slice(0, 5).padEnd(5)} ${what}`, colour: Colour.brightWhite }];
    }
    putLine(g, i, line);
  }
  t.select(was);
}

/**
 * What each reagent goes into, a few words each, in the game's order (Sulfur Ash ... Mandrake): the kinds of spell its
 * recipes are (DATA.OVL 0x1cc0, magicPanel.ts recipe; tests/reagentcard.test.ts holds each to them), in the four
 * rows the card has for them.
 */
export const REAGENT_USES = [
  'Light and fire: bolts, fields, locks, storms.',
  'Healing: heals, cures, waking, food.',
  'Warding: protection, cures, undead turned.',
  'Binding: fields, sleep, charms, healing.',
  'Movement: blink, levels, locks, quickness.',
  'Missiles and fields: bolts that strike.',
  'Poison and the unseen: sleep, charm, sight.',
  'Great power: the strongest of every circle.',
];

/** Words in the card's lines, the panel's width each. */
export function cardLines(text: string): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= W) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** A reagent's use (REAGENT_USES) in the card's lines. */
export const reagentUseLines = (reagent: number): string[] => cardLines(REAGENT_USES[reagent]);

/**
 * What the guild sells, a few words each, in its order (keys, gems, torches): what each is for. Each fits the four rows
 * the card has for it (tests/guildcard.test.ts).
 */
export const GUILD_USES = [
  'Jimmy a locked door or chest. A key may break.',
  'Peer into one: the land about, or the level.',
  'Light in a dungeon or the dark, for a while.',
];

/**
 * A card for a thing sold by the lot, over the party while the bar is on it (shops.ts): its name on the border, how
 * many the party holds (red at none), a lot's size and price to the buyer under that, and what it is for.
 */
function drawStockCard(g: Game, name: string, held: number, use: string, lot: { count: number; price: number }): void {
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false);
  borderTitle(g, `${name}:`);
  t.select(Win.stats);
  const rows: Line[] = [
    [
      { text: 'Held: ', colour: Colour.lightGray },
      { text: `${held}`, colour: held === 0 ? Colour.brightRed : Colour.brightWhite },
    ],
    [{ text: `${lot.count} for ${lot.price}gp`, colour: Colour.lightGray }],
    ...cardLines(use).map((w) => [{ text: w, colour: Colour.brightWhite }]),
  ];
  for (let r = 0; r < ROWS; r++) putLine(g, r, rows[r] ?? []);
  t.win.fg = fg;
  t.select(was);
}

/**
 * The apothecary's card for a reagent, over the party while the bar is on it (shops.ts): how many the party holds, a
 * lot's size and price to the buyer, and what kind of spells it goes into.
 */
export function drawReagentCard(g: Game, reagent: number, lot: { count: number; price: number }): void {
  drawStockCard(g, g.data.table(0x3c20, 8)[reagent].trim(), g.s.reagents[reagent], REAGENT_USES[reagent], lot);
}

/** The guild's card for keys (0), gems (1) or torches (2), as the apothecary's for a reagent. */
export function drawGuildCard(g: Game, what: number, lot: { count: number; price: number }): void {
  const s = g.s;
  drawStockCard(g, ['Keys', 'Gems', 'Torches'][what], [s.keys, s.gems, s.torches][what], GUILD_USES[what], lot);
}

/**
 * A card of words over the party (the journal's: a shrine's state, what a thing is for): `title` on the border, the
 * text in the panel's rows - at the Standard look's own height its seven, at 1988's the eight round its divider.
 */
export function drawTextCard(g: Game, title: string, text: string, foot = ''): void {
  const t = g.text;
  const was = t.current;
  const fg = t.win.fg;
  drawVitals(g, false);
  borderTitle(g, title);
  t.select(Win.stats);
  const rows = compactPanel(g) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 7, 8];
  // The foot (the journal's "Y: Hint") on the last row, grey; the text above it.
  const room = foot ? rows.length - 1 : rows.length;
  // Each sentence on a line of its own ("Found." "Mantra: MU." ...), where that fits; else the words run on.
  const apart = text ? text.split(/(?<=\.)\s+(?=[A-Z])/).flatMap((sentence) => cardLines(sentence)) : [];
  const lines = apart.length <= room ? apart : cardLines(text).slice(0, room);
  rows.forEach((r, i) => {
    if (foot && i === rows.length - 1) putLine(g, r, [{ text: foot, colour: Colour.lightGray }]);
    else putLine(g, r, lines[i] !== undefined ? [{ text: lines[i], colour: Colour.brightWhite }] : []);
  });
  t.win.fg = fg;
  t.select(was);
}
