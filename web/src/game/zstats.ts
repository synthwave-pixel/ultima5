/**
 * zstats.ts
 *
 * Z-stats and Ready (u5d zstats.c): each member's statistics and arms,
 * the party's equipment, reagents, spells, items and armaments in
 * scrolling lists in the stats window, and readying weapons, armour,
 * rings and amulets by hand, strength and ammunition.
 */

import { withFullPanel } from './layout.ts';
import { borderChar, borderTitle, clearBorderChar, clearBorderTitle, clearSpellBar, drawVitals } from './frame.ts';
import { Game } from './game.ts';
import { cue } from './cues.ts';
import { getChar, selectMember } from './input.ts';
import { POTION_COLOURS, POTION_EFFECTS, POTION_LONG, scrollEffect, scrollShort } from './magic.ts';
import type { Item } from './menu.ts';
import { K } from './io.ts';
import { Ctl } from '../ui/text.ts';
import { usableHere } from './targets.ts';

export const CLASSES = 'AMBFDTPRS';
const STATUSES = 'GPDSC';
/** Page up, page down, home and end in the DOS game's key codes (numpad 9, 3, 7, 1). */
export const PgUp = 0xd5;
export const PgDn = 0xd6;
export const Home = 0xd3;
export const End = 0xd4;

/** ZSTATS_0518: does member `m` wear or wield item `item`. */
export function wears(g: Game, m: number, item: number): boolean {
  return g.s.members[m].equips.includes(item);
}

/** ZSTATS_056c: the previous index before `i` with any held (or, with `m`, worn by member m). */
export function prevHeld(g: Game, i: number, counts: Uint8Array, m = 0xff): number {
  while (--i >= 0) if (counts[i] !== 0 || (m !== 0xff && wears(g, m, i))) return i;
  return -1;
}

/** ZSTATS_05a4: the next index after `i` below `n`. */
export function nextHeld(g: Game, i: number, n: number, counts: Uint8Array, m = 0xff): number {
  while (++i < n) if (counts[i] !== 0 || (m !== 0xff && wears(g, m, i))) return i;
  return -1;
}

/** ZSTATS_05e2: one line of a list: the count (or "--"), a mark, and the name (with the rune prefixes some names use). */
export function listLine(g: Game, i: number, counts: Uint8Array, names: string[], mark: number): void {
  const t = g.text;
  const n = counts[i];
  if (n !== 0xff) {
    if (n !== 0) g.printNumber(n, 2, ' ');
    else g.say(0x9778); // "--"
    if (mark < 0x20) t.font = 1;
    g.printChar(mark);
    t.font = 0;
  }
  const name = names[i] ?? '';
  if (name[0] === '*') {
    // A scroll: its icon, then what it does (the port's; the original gave the letters of its syllables, "IS").
    t.font = 1;
    g.say(0x977c); // "\x1c + "
    t.font = 0;
    g.print(scrollShort(g, i));
  } else if (name[0] === '!') {
    // A potion: its flask in its colour, then what it does (the original gave the colour's name alone).
    const fg = t.win.fg;
    t.win.fg = POTION_COLOURS[i - 8] ?? fg;
    t.font = 1;
    g.say(0x9782); // "\x1d + "
    t.font = 0;
    t.win.fg = fg;
    g.print(POTION_EFFECTS[i - 8] ?? g.data.table(0x1962, 0x38)[40 + i] ?? '');
  } else if (name[0] === '(') {
    g.say(0x9788); // "Moonstone "
    t.font = 1;
    g.printChar(name.charCodeAt(1));
    t.font = 0;
  } else {
    g.print(name);
  }
  let x = t.win.x;
  if (x < 0xe) {
    for (; x < 0xe; x++) g.printChar(' ');
  }
  g.printChar('\n');
}

/** ZSTATS_045e: the list box drawn in the stats window, `rows` high. */
export function listBox(g: Game, rows: number): void {
  const t = g.text;
  t.setWindow(1, 0x18, 1, 0x26, rows + 1);
  g.printChar(0xff);
  t.setWindow(1, 0x18, 1, 0x27, 9);
  g.printChar(0x10);
  for (let i = 0; i < 0xd; i++) g.printChar(0x11);
  g.printChar(0x13);
  for (let i = 1; i !== rows; i++) {
    t.moveTo(0, i);
    g.printChar(0x17);
    t.moveTo(0xe, i);
    g.printChar(0x17);
  }
  g.printChar('\n');
  g.printChar(0x14);
  for (let i = 0; i < 0xd; i++) g.printChar(0x15);
  g.printChar(0x16);
}

/** ZSTATS_0000: whose stats: the combatant whose turn it is, or a choice (0 for the party's equipment when allowed). */
async function whose(g: Game, allowNone: boolean): Promise<number> {
  const s = g.s;
  let who: number;
  if (s.mapId > 0x80 && (g.combat[s.combatTurn].flags & 0x80) !== 0) {
    who = g.combat[s.combatTurn].who;
  } else {
    g.say(0x96b4); // "Player: "
    who = await selectMember(g, allowNone);
    if (who >= 0) {
      g.print(s.members[who].name);
      if (g.text.win.x !== 0) g.printChar('\n');
    }
  }
  if (who === -1)
    g.say(0x96be); // "None!\n"
  else if (who === -2) g.printChar('\n');
  return who;
}

/** ZSTATS_0082: a member's page. */
function memberPage(g: Game, i: number): void {
  const t = g.text;
  const m = g.s.members[i];
  clearBorderChar(g);
  borderTitle(g, m.name);
  t.setWindow(1, 0x18, 1, 0x26, 9);
  g.printChar(0xff);
  t.setWindow(1, 0x18, 1, 0x27, 9);
  const cls = CLASSES.indexOf(String.fromCharCode(m.cls));
  const st = STATUSES.indexOf(String.fromCharCode(m.status));
  const indent = g.data.swords(0x1a58, 9)[cls] ?? 0;
  for (let k = 0; k < indent; k++) g.printChar(' ');
  g.printChar(m.gender);
  g.say(0x96d6); // " Lv-"
  g.printNumber(m.level);
  g.printChar(' ');
  g.print(g.data.table(0x1a44, 10)[cls] ?? '');
  t.setWindow(1, 0x18, 1, 0x26, 9);
  t.moveTo(0, 1);
  g.printChar(0xfc);
  g.print(g.data.table(0x1a6a, 5)[st] ?? '');
  t.setWindow(1, 0x18, 1, 0x27, 9);
  t.moveTo(0, 3);
  g.printChar(0xfb);
  g.say(0x96dc); // "Str="
  g.printNumber(m.str, 2, '0');
  g.say(0x96e2); // "  HP:"
  g.printNumber(m.hp, 4, ' ');
  g.say(0x96e8); // "\nInt="
  g.printNumber(m.int, 2, '0');
  g.say(0x96ee); // "  HM:"
  g.printNumber(m.maxHp, 4, ' ');
  g.say(0x96f4); // "\nDex="
  g.printNumber(m.dex, 2, '0');
  g.say(0x96fa); // "  Ex:"
  g.printNumber(m.exp, 4, ' ');
  g.say(0x9700); // "\n\n    Magic:"
  g.printNumber(m.mp, 2, ' ');
}

/** ZSTATS_02a8: a member's readied arms. */
function armsPage(g: Game, i: number): void {
  const t = g.text;
  const m = g.s.members[i];
  const names = g.data.table(0x1962, 0x38);
  clearBorderChar(g);
  borderTitle(g, m.name);
  t.setWindow(1, 0x18, 1, 0x26, 9);
  g.printChar(0xff);
  g.printChar(0xfc);
  g.printChar(0xfe);
  g.say(0x970e); // "Arms\n\n"
  g.printChar(0xfb);
  g.printChar(0xfe);
  let n = 0;
  for (const e of m.equips) {
    if (e === 0xff) continue;
    g.printChar(' ');
    g.print(names[e] ?? '');
    g.printChar('\n');
    n++;
  }
  if (n === 0) {
    t.moveTo(0, 4);
    g.printChar(0xfc);
    g.say(0x9716); // "(None ready)"
    g.printChar(0xfb);
  }
  t.setWindow(1, 0x18, 1, 0x27, 9);
}

/** ZSTATS_039c: the party's supplies. */
function equipmentPage(g: Game): void {
  const s = g.s;
  const t = g.text;
  clearBorderChar(g);
  borderTitle(g, g.t(0x9724)); // "Equipment"
  t.setWindow(1, 0x18, 1, 0x26, 9);
  g.printChar(0xff);
  t.setWindow(1, 0x18, 1, 0x27, 9);
  g.say(0x972e); // "\n Food: "
  g.printNumber(s.food, 4, ' ');
  g.say(0x9738); // "\n Gold: "
  g.printNumber(s.gold, 4, ' ');
  g.say(0x9742); // "\n\n Keys......."
  g.printNumber(s.keys, 2, ' ');
  g.say(0x9752); // "\n Gems......."
  g.printNumber(s.gems, 2, ' ');
  g.say(0x9760); // "\n Torches...."
  g.printNumber(s.torches, 2, ' ');
  if (s.grapple !== 0) g.say(0x976e); // "\n Grapple"
}

/** ZSTATS_099a: the special items as one list of counts (D_b9ee). */
export function itemCounts(g: Game): Uint8Array {
  const s = g.s;
  const c = new Uint8Array(0x26);
  for (let i = 0; i < 8; i++) {
    c[i] = s.scrolls[i];
    c[8 + i] = s.potions[i];
    c[0x15 + i] = s.moonstoneHeld[i] === 0xff ? 0xff : 0;
  }
  c[0x10] = s.carpets;
  c[0x11] = s.skullKeys;
  c[0x12] = s.amulet;
  c[0x13] = s.crown;
  c[0x14] = s.sceptre;
  for (let i = 0; i < 3; i++) c[0x1d + i] = s.shards[i];
  c[0x20] = s.spyglasses;
  c[0x21] = s.hmsCapePlans !== 0 ? 0xff : 0;
  c[0x22] = s.sextants;
  c[0x23] = s.pocketWatch;
  c[0x24] = s.blackBadge;
  c[0x25] = s.sandalwoodBox;
  return c;
}

/** ZSTATS_06e8: a scrolling list; returns the key that left it. */
async function listPage(g: Game, title: string, n: number, counts: Uint8Array, names: string[]): Promise<number> {
  const t = g.text;
  borderTitle(g, title);
  listBox(g, 8);
  let top = nextHeld(g, -1, n, counts);
  if (top === -1) {
    listBox(g, 8);
    t.moveTo(1, 4);
    g.say(0x9794); // "(None owned!)"
    clearBorderChar(g);
    t.select(2);
    return getChar(g);
  }
  for (;;) {
    t.select(1);
    t.moveTo(1, 1);
    let last = top;
    for (; last !== -1; last = nextHeld(g, last, n, counts)) {
      listLine(g, last, counts, names, 0x2d);
      t.moveTo(1, t.win.y);
      if (t.win.y === 8) break;
    }
    let arrows = 0;
    if (prevHeld(g, top, counts) !== -1) arrows = 2;
    if (last !== -1 && nextHeld(g, last, n, counts) !== -1) arrows++;
    if (arrows === 0) clearBorderChar(g);
    else borderChar(g, [0, 0x19, 0x18, 0x12][arrows]);
    t.select(2);
    const k = await getChar(g);
    switch (k) {
      case K.Up:
      case PgUp:
        for (let i = 0; i < (k === PgUp ? 7 : 1); i++) if (prevHeld(g, top, counts) !== -1) top = prevHeld(g, top, counts);
        break;
      case K.Down:
      case PgDn:
        for (let i = 0; i < (k === PgDn ? 7 : 1); i++) {
          if (last !== -1 && nextHeld(g, last, n, counts) !== -1) {
            top = nextHeld(g, top, n, counts);
            last = nextHeld(g, last, n, counts);
          }
        }
        break;
      case Home:
        top = nextHeld(g, -1, n, counts);
        break;
      case End:
        top = prevHeld(g, n, counts);
        for (let i = 0; i < 6 && prevHeld(g, top, counts) !== -1; i++) top = last;
        break;
      case K.Left:
      case K.Right:
      case K.Escape:
      case K.Space:
      case 0x30:
      case 0x31:
      case 0x32:
      case 0x33:
      case 0x34:
      case 0x35:
      case 0x36:
        return k;
    }
  }
}

/** ZSTATS_0a3a: Z-stats: a member's page and arms by turns, then equipment, reagents, spells, items and armaments. */
export async function ztatsCommand(g: Game): Promise<number> {
  // Its pages need the panel's nine rows (layout.ts).
  return withFullPanel(g, () => ztats(g));
}

async function ztats(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa28c); // "Z-stats...\n"
  let who = await whose(g, true);
  if (who === -2) who = 6;
  else if (who < 0) return 1;
  g.say(0x97a2); // "\nStatus: "
  const items = itemCounts(g);
  clearSpellBar(g);
  g.draw.pen = 15;
  g.draw.line(0xbf, 0x38, 0xbf, 0x3f);
  g.draw.line(0x138, 0x38, 0x138, 0x3f);
  g.draw.pen = 0;
  g.draw.fill(0xc0, 0x38, 0x137, 0x3f);
  let page = who << 1;
  let k = 0;
  for (;;) {
    if (k === K.Space || k === K.Escape) break;
    switch (k) {
      case K.Up:
      case K.Left:
        if (page === 0xc) page = s.partySize * 2 - 1;
        else if (page > 0) page--;
        else page = 0x10;
        break;
      case K.Enter: // A, on a controller, turns the page, as it does Help's (Classic's Enter is 1988's: nothing)
        if (g.options.input !== 'controller') break;
      // falls through
      case K.Right:
      case K.Down:
        if (s.partySize * 2 - 1 === page) page = 0xc;
        else if (page < 0x10) page++;
        else page = 0;
        break;
      default:
        if (k >= 0x31 && k <= 0x36 && k - 0x31 < s.partySize) page = k * 2 - 0x62;
    }
    g.text.select(1);
    if (page < 0xc) {
      if (page & 1) armsPage(g, page >> 1);
      else memberPage(g, page >> 1);
      g.text.select(2);
      k = await getChar(g);
    } else if (page === 0xc) {
      equipmentPage(g);
      g.text.select(2);
      k = await getChar(g);
    } else if (page === 0xd) {
      k = await listPage(g, g.t(0x97ac), 8, s.reagents, g.data.table(0x19d2, 8));
    } else if (page === 0xe) {
      k = await listPage(g, g.t(0x97b6), 0x30, s.mixtures, g.data.table(0x19e2, 0x31));
    } else if (page === 0xf) {
      k = await listPage(g, g.t(0x97be), 0x26, items, g.data.table(0x1916, 0x26));
    } else {
      k = await listPage(g, g.t(0x97c4), 0x30, s.equipment, g.data.table(0x1962, 0x38));
    }
  }
  clearBorderChar(g);
  clearBorderTitle(g);
  clearSpellBar(g);
  drawVitals(g);
  g.say(0x97ce); // "Done\n"
  return 1;
}

// --- Ready ------------------------------------------------------------------------------

/** ZSTATS_0bee: a refusal. */
function refuse(g: Game, address: number): void {
  g.say(0x97d4); // "\n\n"
  g.say(address);
  g.say(0x97d8); // "\n\nItem: "
}

/** ZSTATS_0c0a: which hand is free: 2 both, 0 the right (first), 1 the left, 0xff neither. */
function freeHand(g: Game, m: number): number {
  const e = g.s.members[m].equips;
  if (e[2] === 0xff && e[3] === 0xff) return 2;
  if (e[2] === 0xff) return 0;
  if (e[3] === 0xff && g.data.bytes(0x1a7e, 0x30)[e[2]] !== 0x30) return 1;
  return 0xff;
}

/** ULTIMA_6e60: take off item `item` (the invisibility ring's effect ends with it). */
export function unequip(g: Game, m: number, item: number): boolean {
  const s = g.s;
  const e = s.members[m].equips;
  for (let k = 0; k < 6; k++) {
    if (e[k] === item) {
      e[k] = 0xff;
      if (k === 4 && item === 0x2a && s.mapId > 0x7f && s.combatTurn < 0x20) g.combat[s.combatTurn].flags &= ~0x10;
      return true;
    }
  }
  return false;
}

/** ZSTATS_0c5c_EquipItem: ready or put away an item; true if a ring vanished. */
async function equip(g: Game, m: number, item: number): Promise<boolean> {
  const s = g.s;
  const member = s.members[m];
  const actor = s.mapId > 0x7f ? s.actors[g.combat[s.combatTurn].actor] : null;
  if (item === 0x1b || item === 0x1d) return false;
  if (item >= 9 && item <= 0xf && s.mapId > 0x7f && s.battleWon === 0) {
    refuse(g, 0x97e2); // "Thou canst not change armour in heated battle!"
    return false;
  }
  if (wears(g, m, item)) {
    unequip(g, m, item);
    if (s.equipment[item] < 99) s.equipment[item]++;
    if (s.mapId <= 0x7f || item !== 0x2a || !actor) return false;
    actor.tile = actor.anim = g.data.bytes(0x1ade, 9)[CLASSES.indexOf(String.fromCharCode(member.cls))];
    return false;
  }
  if (((item === 0x1a || item === 0x24) && s.equipment[0x1b] === 0) || (item === 0x1c && s.equipment[0x1d] === 0)) {
    refuse(g, 0x981c); // "Thou hast no ammunition for that weapon!"
    return false;
  }
  const weight = g.data.bytes(0x1aae, 0x30);
  let carried = 0;
  for (const e of member.equips) if (e !== 0xff) carried += weight[e];
  const strong = weight[item] + carried <= member.str;
  let slot: number;
  switch (g.data.bytes(0x1a7e, 0x30)[item]) {
    case 0x80:
      if (member.equips[0] !== 0xff) {
        refuse(g, 0x9846); // "Remove first thy present helm!"
        return false;
      }
      slot = 0;
      break;
    case 0x40:
      if (member.equips[1] !== 0xff) {
        refuse(g, 0x9866); // "Thou must first remove thine other armour!"
        return false;
      }
      slot = 1;
      break;
    case 0x20: {
      let hand = freeHand(g, m);
      if (hand === 0xff) {
        refuse(g, 0x9892); // "Thou must free one of thy hands first!"
        return false;
      }
      if (hand === 2) hand = 0;
      slot = 2 + hand;
      break;
    }
    case 0x30:
      if (freeHand(g, m) !== 2) {
        refuse(g, 0x98ba); // "Both hands must be free before thou canst wield that!"
        return false;
      }
      slot = 2;
      break;
    case 4:
      if (member.equips[5] !== 0xff) {
        refuse(g, 0x98f0); // "Thou must remove thine other amulet!"
        return false;
      }
      slot = 5;
      break;
    case 2:
      if (member.equips[4] !== 0xff) {
        refuse(g, 0x9916); // "Only one magic ring may be worn at a time!"
        return false;
      }
      slot = 4;
      break;
    default:
      slot = 0;
  }
  if (!strong) {
    refuse(g, 0x9942); // "Thou art not strong enough!"
    return false;
  }
  member.equips[slot] = item;
  --s.equipment[item];
  // The original tests the count left against the rings' numbers (0x2a, 0x2c), so a ring seldom vanishes.
  if ((s.equipment[item] === 0x2a || s.equipment[item] === 0x2c) && g.random(0, 0xf) === 0) {
    g.say(0x995e); // "\n\nRing vanishes!\n"
    member.equips[4] = 0xff;
    await cue(g, 'Dissolve', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
    return true;
  }
  if (item === 0x2a && s.mapId > 0x7f && actor) actor.tile = actor.anim = 0x1d;
  return false;
}

/** The armaments' kinds (the table at 0x1a7e): where each is worn. */
const KIND = { helm: 0x80, armour: 0x40, hand: 0x20, hands: 0x30, amulet: 4, ring: 2 } as const;
export const isShield = (item: number): boolean => item >= 4 && item <= 8;

/** Which of a member's six places an armament would go to, displacing what: the places to be emptied for it. */
export function placesFor(g: Game, m: number, item: number): number[] {
  const e = g.s.members[m].equips;
  const kind = g.data.bytes(0x1a7e, 0x30)[item];
  switch (kind) {
    case KIND.helm:
      return [0];
    case KIND.armour:
      return [1];
    case KIND.amulet:
      return [5];
    case KIND.ring:
      return [4];
    case KIND.hands:
      return [2, 3];
    case KIND.hand: {
      if (freeHand(g, m) !== 0xff) return [];
      // No hand free: a shield takes a shield's place, a weapon a weapon's, the first hand's before the second's.
      const like = [2, 3].find((k) => e[k] !== 0xff && isShield(e[k]) === isShield(item));
      return [like ?? (isShield(item) ? 3 : 2)];
    }
  }
  return [];
}

/** What a member now has where an armament of this kind would go (for a shop to show), first hand first. */
export function wornWhere(g: Game, m: number, item: number): number[] {
  const e = g.s.members[m].equips;
  const kind = g.data.bytes(0x1a7e, 0x30)[item];
  const places =
    kind === KIND.hand || kind === KIND.hands
      ? [2, 3].filter((k) => e[k] !== 0xff && isShield(e[k]) === isShield(item))
      : placesFor(g, m, item);
  return places.map((k) => e[k]).filter((v) => v !== 0xff);
}

/**
 * Ready an armament out of the pack, putting back whatever is in its way first (the port's; the original
 * refused - "Both hands must be free" - until the player had taken each piece off himself, which on a
 * controller is a walk through the list for every one of them). Nothing is moved where the game itself says
 * no: armour in a fight, a weapon without its ammunition, more than the member can carry. False, and nothing
 * changed, in that case; `tell` prints the refusal as a list's row would, or as a shop's line does.
 */
export async function readyFromPack(g: Game, m: number, item: number, tell: (at: number) => void): Promise<boolean> {
  const s = g.s;
  const member = s.members[m];
  const e = member.equips;
  if (s.equipment[item] === 0 || wears(g, m, item)) return false;
  const inFight = s.mapId > 0x7f && s.battleWon === 0;
  if (item >= 9 && item <= 0xf && inFight) {
    tell(0x97e2); // "Thou canst not change armour in heated battle!"
    return false;
  }
  if (((item === 0x1a || item === 0x24) && s.equipment[0x1b] === 0) || (item === 0x1c && s.equipment[0x1d] === 0)) {
    tell(0x981c); // "Thou hast no ammunition for that weapon!"
    return false;
  }
  const out = placesFor(g, m, item).filter((k) => e[k] !== 0xff);
  // What is worn cannot be taken off in a fight either, so it is not put back to make room in one.
  if (inFight && out.some((k) => k <= 1)) {
    tell(0x97e2); // "Thou canst not change armour in heated battle!"
    return false;
  }
  const weight = g.data.bytes(0x1aae, 0x30);
  let carried = weight[item];
  for (let k = 0; k < 6; k++) if (e[k] !== 0xff && !out.includes(k)) carried += weight[e[k]];
  if (carried > member.str) {
    tell(0x9942); // "Thou art not strong enough!"
    return false;
  }
  for (const k of out) {
    const old = e[k];
    unequip(g, m, old);
    if (s.equipment[old] < 99) s.equipment[old]++;
  }
  await equip(g, m, item);
  return wears(g, m, item);
}

// --- Switch: the best arms at hand -------------------------------------------------------------------

/** Thrown and gone: a dagger, a flask of oil, a spear, an axe - what has the reach is thrown at a foe out of it. */
export const THROWN = [0x10, 0x13, 0x15, 0x16];
/** Of those, the ones that strike as well as they fly, and that the eased rules keep back: dagger, spear. */
export const THROWN_KEPT = [0x10, 0x15];
/** A bow is no use without its arrows, a crossbow without its quarrels: ZSTATS_0c5c refuses them both. */
export function hasAmmo(g: Game, item: number): boolean {
  if (item === 0x1a || item === 0x24) return g.s.equipment[0x1b] !== 0;
  if (item === 0x1c) return g.s.equipment[0x1d] !== 0;
  return true;
}

/**
 * Whether the game would let this member ready an armament from the pack now, or put away one they have on (as
 * readyFromPack and equip decide): not arrows or quarrels, nor a bow without them, nor armour on or off in a fight,
 * nor more than the member can carry once what is in its way is packed.
 */
export function canReady(g: Game, m: number, item: number): boolean {
  const s = g.s;
  const e = s.members[m].equips;
  const inFight = s.mapId > 0x7f && s.battleWon === 0;
  if (item >= 9 && item <= 0xf && inFight) return false;
  if (wears(g, m, item)) return true;
  if (item === 0x1b || item === 0x1d || !hasAmmo(g, item)) return false;
  const out = placesFor(g, m, item).filter((k) => e[k] !== 0xff);
  if (inFight && out.some((k) => k <= 1)) return false;
  const weight = g.data.bytes(0x1aae, 0x30);
  let carried = weight[item];
  for (let k = 0; k < 6; k++) if (e[k] !== 0xff && !out.includes(k)) carried += weight[e[k]];
  return carried <= s.members[m].str;
}

/** An armament just bought, readied at once (the port's): what is in its way goes back to the pack first. */
export async function readyPurchase(g: Game, m: number, item: number): Promise<boolean> {
  const done = await readyFromPack(g, m, item, (at) => {
    g.printChar('\n');
    g.say(at);
    g.printChar('\n');
  });
  const { rememberArms } = await import('./switchWeapon.ts');
  rememberArms(g, m, true); // Switch Weapon's memory, and the member's style (switchWeapon.ts)
  return done;
}

/**
 * ZSTATS_0f2e: pick from a list in the stats window with a highlighted
 * row: armaments for Ready (`mode` 'R', worn ones marked, Enter readies)
 * or items for Use. Returns the item, or -1.
 */
export async function pickItem(g: Game, first: number, m: number, mode: number): Promise<number> {
  const t = g.text;
  const s = g.s;
  if (g.options.input === 'controller') return pickFromMenu(g, m, mode);
  const counts = mode === 0x52 ? s.equipment : itemCounts(g);
  const n = mode === 0x52 ? 0x30 : 0x26;
  const armNames = g.data.table(0x1962, 0x38);
  const itemNames = g.data.table(0x1916, 0x26);
  const marks = g.data.bytes(0x1ae8, 0x30);
  const before = readied(g, m, mode);
  let done = false;
  let row = 1;
  let picked = 0;
  while (!done) {
    t.select(1);
    t.moveTo(1, 1);
    let rows = 0;
    let at = first;
    while (at !== -1) {
      rows++;
      if (t.win.y === row) {
        g.print(Ctl.inverse);
        picked = at;
      }
      if (mode === 0x52) listLine(g, at, counts, armNames, wears(g, m, at) ? marks[at] : 0x20);
      else listLine(g, at, counts, itemNames, 0x20);
      t.moveTo(1, t.win.y);
      if (t.win.y - 1 === row) g.print(Ctl.inverse);
      if (t.win.y === 8) break;
      at = nextHeld(g, at, n, counts, m);
    }
    let arrows = 0;
    if (prevHeld(g, first, counts, m) !== -1) arrows = 2;
    if (at !== -1 && nextHeld(g, at, n, counts, m) !== -1) arrows++;
    if (arrows === 0) clearBorderChar(g);
    else borderChar(g, [0, 0x19, 0x18, 0x12][arrows]);
    // What is shown, for whoever looks at the game from outside (the tests' controller player): the whole list.
    const held: number[] = [];
    for (let i = nextHeld(g, -1, n, counts, m); i !== -1; i = nextHeld(g, i, n, counts, m)) held.push(i);
    const names = mode === 0x52 ? armNames : itemNames;
    const label = (i: number): string =>
      mode === 0x52 ? names[i].trim() : i < 8 ? scrollShort(g, i) : i < 0x10 ? POTION_EFFECTS[i - 8] : names[i].trim();
    g.menuShown = {
      title: mode === 0x52 ? 'Ready' : 'Items',
      labels: held.map(label),
      enabled: held.map(() => true),
      dim: held.map(() => false),
      at: held.indexOf(picked),
    };
    t.select(2);
    const k = await getChar(g);
    g.menuShown = null;
    switch (k) {
      case K.Left:
      case K.Up:
      case PgUp:
        for (let i = 0; i < (k === PgUp ? 7 : 1); i++) {
          if (row === 4 || row === 1) {
            if (prevHeld(g, first, counts, m) !== -1) first = prevHeld(g, first, counts, m);
            else if (row === 4) row--;
          } else {
            row--;
          }
        }
        break;
      case K.Right:
      case K.Down:
      case PgDn:
        for (let i = 0; i < (k === PgDn ? 7 : 1); i++) {
          if (row === 4 || row === 7 || row >= rows) {
            if (at !== -1 && nextHeld(g, at, n, counts, m) !== -1) {
              first = nextHeld(g, first, n, counts, m);
              at = nextHeld(g, at, n, counts, m);
            } else if (row === 4 && rows > 4) {
              row++;
            }
          } else {
            row++;
          }
        }
        break;
      case K.Enter:
      case K.Space: {
        if (mode !== 0x52) {
          done = true;
          break;
        }
        // Ready: what is worn comes off; what is packed goes on, over whatever is in its way, which is packed for it.
        if (wears(g, m, picked)) done = await equip(g, m, picked);
        else await readyFromPack(g, m, picked, (at) => refuse(g, at));
        break;
      }
      case K.Escape:
        g.say(mode === 0x52 ? 0x9970 : 0x9976); // "Done\n" : "None!\n"
        done = true;
        picked = -1;
        break;
      case Home:
        first = nextHeld(g, -1, n, counts, m);
        row = 1;
        break;
      case End:
        first = prevHeld(g, n, counts, m);
        for (row = 1; row < 7; row++) {
          picked = prevHeld(g, first, counts, m);
          if (picked === -1) break;
          first = picked;
        }
        break;
    }
  }
  if (picked < 0) g.cancelled = readied(g, m, mode) === before;
  return picked;
}

/**
 * The name an item goes by in a menu over the map (the port's, as the
 * ultima3 port lists gear): the long name where it fits, else the short;
 * a scroll and a potion by what they do, a moonstone by its phase, and
 * the file's abbreviations written out.
 */
export function itemLabel(g: Game, i: number, mode: number, m: number, count: number): Item {
  if (mode === 0x52) {
    const long = g.data.table(0x17f6, 0x30)[i] ?? '';
    const short = g.data.table(0x1962, 0x38)[i]?.trim() ?? '';
    const where = m === 0xff ? -1 : g.s.members[m].equips.indexOf(i);
    const tail = `${count ? ` x${count}` : ''}${where < 0 ? '' : where === 2 || where === 3 ? ' (hand)' : ' (worn)'}`;
    // The long name where the line fits the menu's width (21), else the short.
    return { label: `${long.length + tail.length <= 21 ? long : short}${tail}` };
  }
  // How many, as every other thing held shows it.
  const many = count > 1 && count !== 0xff ? ` x${count}` : '';
  // The long name where the line fits the menu's width (21) with its count, else the short (Ztats's), as Ready does.
  const fit = (long: string, short: string): string => (long.length + many.length <= 21 ? long : short) + many;
  if (i < 8) return { label: fit(`Scroll: ${scrollEffect(g, i)}`, `Scroll: ${scrollShort(g, i)}`) };
  // (plain: colour is kept for a member's state)
  if (i < 0x10) return { label: fit(`Potion: ${POTION_LONG[i - 8]}`, `Potion: ${POTION_EFFECTS[i - 8]}`) };
  if (i > 0x14 && i < 0x1d) return { label: `Moonstone ${i - 0x15}` };
  const table = g.data.table(0x1916, 0x26)[i]?.trim() ?? '';
  const name = LONG_ITEM_NAMES[table] ?? table;
  // A count of 0xff is the file's mark for a thing simply had (a shard, the spyglass), not a number of them.
  return { label: `${name}${many}` };
}

/** The file's abbreviated names written out, for the menu's width. */
const LONG_ITEM_NAMES: Record<string, string> = {
  'Magic Crpt': 'Magic carpet',
  'Skull Keys': 'Skull keys',
  'HMS Cape Plan': 'HMS Cape plans',
  'Shard/Falsehd': 'Shard of Falsehood',
  'Shard/Hatred': 'Shard of Hatred',
  'Shard/Cowrdce': 'Shard of Cowardice',
  'Wooden Box': 'Sandalwood box',
};

/**
 * The list of a member's armaments (Ready) or the party's items (Use) as
 * a menu over the map, where the keyboard is read as a controller (the
 * ultima3 port's way; the stats pane is kept for choosing members). Ready
 * stays open, readying and unreadying as each line is chosen, until B;
 * Use returns the item chosen, or -1.
 */
async function pickFromMenu(g: Game, m: number, mode: number): Promise<number> {
  const s = g.s;
  const { choose, restoreView } = await import('./menu.ts');
  const counts = mode === 0x52 ? s.equipment : itemCounts(g);
  const n = mode === 0x52 ? 0x30 : 0x26;
  const before = readied(g, m, mode);
  let at = 0;
  let picked = -1;
  let held: number[] = [];
  let onItem = -1; // the armament the bar was on when chosen
  // Ready in the Standard look: the member named on the party box's border, and the armament under the bar shown on
  // the panel as its card (readyCard.ts), marked against what readying it would pack away.
  const card = mode === 0x52 && g.options.tileSet === 'standard';
  // Use in the Standard look: the thing under the bar shown on the panel as its card too (useCard.ts) - what it does,
  // and, where it is grey, why.
  const useCard = mode !== 0x52 && g.options.tileSet === 'standard';
  const watch = g.choiceWatch;
  if (card) {
    const { drawItemCard } = await import('./readyCard.ts');
    g.panelTitle = s.members[m].name;
    g.choiceWatch = (i, title) => {
      if (title === 'Ready' && held[i] !== undefined) drawItemCard(g, m, held[i]);
    };
  } else if (useCard) {
    const { drawUseCard } = await import('./useCard.ts');
    g.choiceWatch = (i, title) => {
      if (title === 'Items' && held[i] !== undefined) drawUseCard(g, held[i]);
    };
  }
  try {
    for (;;) {
      held = [];
      for (let i = nextHeld(g, -1, n, counts, m); i !== -1; i = nextHeld(g, i, n, counts, m)) held.push(i);
      if (held.length === 0) break;
      // Ready in the Standard look: what cannot be readied now greyed, below the rest, the bar still resting on it
      // for its card to say why; the bar kept on the armament it was on, wherever the list moved it.
      if (card) held = [...held.filter((i) => canReady(g, m, i)), ...held.filter((i) => !canReady(g, m, i))];
      at = held.includes(onItem) ? held.indexOf(onItem) : Math.min(at, held.length - 1);
      // Used, an item that would do nothing here is greyed (targets.ts): a scroll or a skull key is not spent for it.
      const items = held.map((i) => ({
        ...itemLabel(g, i, mode, m, counts[i]),
        enabled: mode === 0x52 || usableHere(g, i),
        // (where its card says why it is grey, the bar may rest on it)
        rest: useCard,
        dim: card && !canReady(g, m, i),
      }));
      if (mode !== 0x52 && items[at]?.enabled === false)
        at = Math.max(
          0,
          items.findIndex((it) => it.enabled),
        );
      // The whole view, as the spell list has it: a long pack scrolls less.
      const pick = await choose(g, mode === 0x52 ? 'Ready' : 'Items', items, at);
      if (pick < 0) break;
      at = pick;
      picked = onItem = held[pick];
      if (mode !== 0x52) break;
      // Readied or put away, and the list again with its marks moved; a ring that vanished ends it. What is packed goes
      // on over whatever is in its way, which is packed for it (as the letters' list has it).
      let done = false;
      if (wears(g, m, picked)) done = await equip(g, m, picked);
      else await readyFromPack(g, m, picked, (a) => refuse(g, a));
      drawVitals(g);
      if (done) break;
      picked = -1;
    }
  } finally {
    if (card || useCard) {
      g.choiceWatch = watch;
      g.panelTitle = '';
      drawVitals(g);
    }
  }
  await restoreView(g);
  if (picked < 0) {
    g.say(mode === 0x52 ? 0x9970 : 0x9976); // "Done\n" : "None!\n"
    g.cancelled = readied(g, m, mode) === before;
  }
  return picked;
}

/**
 * What member `m` has on, where the list is Ready's (`mode` 'R'): Ready spends the turn, as in 1988, when something
 * was readied or taken off, and none when the list is closed with nothing changed (the port's, as a command backed
 * out of spends none) - where "Done" was taken for a backing out, and Ready never cost a turn at all.
 */
function readied(g: Game, m: number, mode: number): string {
  return mode === 0x52 ? (g.s.members[m]?.equips.join(',') ?? '') : '';
}

/** ZSTATS_1296: Ready. `said`: its name already printed (a fight prints its own, COMBAT's "Ready..."). */
export async function readyCommand(g: Game, said = false): Promise<number> {
  // Its lists need the panel's nine rows (layout.ts).
  return withFullPanel(g, () => ready(g, said));
}

async function ready(g: Game, said: boolean): Promise<number> {
  const s = g.s;
  if (!said) g.say(0xa1f0); // "Ready...\n\n"
  const m = await whose(g, false);
  if (m < 0) return 1;
  const first = nextHeld(g, -1, 0x30, s.equipment, m);
  if (first === -1) {
    g.say(0x997e); // "Thou art empty-\nhanded!\n"
    return 1;
  }
  g.say(0x9998); // "Item: "
  // Switch Weapon's memory (switchWeapon.ts): the arms held before, and those readied after - and their style.
  const { rememberArms } = await import('./switchWeapon.ts');
  rememberArms(g, m);
  if (g.options.input === 'controller') {
    await pickFromMenu(g, m, 0x52);
    rememberArms(g, m, true);
    drawVitals(g);
    return 1;
  }
  g.draw.pen = 15;
  g.draw.line(0xbf, 0x38, 0xbf, 0x3f);
  g.draw.line(0x138, 0x38, 0x138, 0x3f);
  g.draw.pen = 0;
  g.draw.fill(0xc0, 0x38, 0x137, 0x3f);
  g.text.select(1);
  borderTitle(g, s.members[m].name);
  listBox(g, 8);
  await pickItem(g, first, m, 0x52);
  rememberArms(g, m, true);
  clearBorderChar(g);
  clearBorderTitle(g);
  clearSpellBar(g);
  drawVitals(g);
  return 1;
}
