/**
 * shops.ts
 *
 * The merchants (u5d shoppes.c, shoppes2.c, shoppes3.c): the arms
 * dealers who buy and sell, pubs (food, drink and lore), stables,
 * shipwrights, apothecaries, the guild (keys, gems, torches), healers and
 * inns (rest, leave or pick up a companion). Their words are in
 * SHOPPE.DAT and DATA.OVL, with # for the shop, $ for the keeper,
 * @ for the time of day, % and ^ for numbers, & and * for names, and
 * bytes of 0x80 up for dictionary words.
 */

import { withFullPanel } from './layout.ts';
import { freeActor } from './actors.ts';
import { borderTitle, clearBorderTitle, clearSpellBar, drawGold, drawVitals, leftArrow, rightArrow, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { getChar, getCharYN, getLetter, getNumber, neediest, type Need, selectMember } from './input.ts';
import { askWord, choose, restoreView } from './menu.ts';
import { K } from './io.ts';
import { earnedLevel, type Member, Status } from './save.ts';
import { firstActive, passTime } from './time.ts';
import { T } from './tiles.ts';
import { callGuards, hourTiles, placeAllNpcs } from './town.ts';
import { setTileAt, setTownTile, tileAt } from './world.ts';
import { saysWord } from './cmds.ts';
import { itemCounts, itemLabel, listBox, listLine, nextHeld, prevHeld, readyPurchase, wornWhere, End, Home, PgDn, PgUp } from './zstats.ts';
import { sleepTicks } from './effects.ts';
import { drawBuyers, drawGuildCard, drawReagentCard, drawWareCard, sortWares, standing } from './shopCard.ts';
import { Colour } from '../ui/colours.ts';
import { actorTileAt } from './actors.ts';
import { poisonKills } from './settings.ts';

const inc = (v: number, n: number, max: number): number => (v + n < max ? v + n : max);
const dec = (v: number, n: number): number => (v > n ? v - n : 0);

/** A shop visit's state (D_b114 which shop of its kind, D_b116 the kind, D_b118/D_b11a numbers, D_aafc/D_aafe names). */
interface Visit {
  g: Game;
  kind: number;
  shop: number;
  price: number;
  count: number;
  shopName: string;
  keeper: string;
  name1: string;
  name2: string;
  /** Who haggles: the cleverest of the party awake (merchant). */
  buyer: number;
  /** Who the merchant speaks to, as sir or milady: the Avatar while alive, else the one haggling (the port's). */
  addressee: number;
}

/** The price after haggling: 3% off for each point of the buyer's intelligence (the original's integer arithmetic). */
function haggle(base: number, int: number): number {
  return base + Math.trunc((base * -(int * 3 - 100)) / 100);
}

/** SHOPPES_0026: print shop text with its substitutions. */
function sayShop(v: Visit, text: number[] | string): void {
  const { g } = v;
  const bytes = typeof text === 'string' ? [...text].map((c) => c.charCodeAt(0)) : text;
  const words = g.data.table(0x24ea, 0x80);
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] !== 0; i++) {
    const b = bytes[i];
    if (b >= 0x80) {
      out += ' ' + (words[b - 0x80] ?? '');
      if (bytes[i + 1] && bytes[i + 1] < 0x80) out += ' ';
      continue;
    }
    switch (b) {
      case 0x23:
        out += v.shopName;
        break;
      case 0x24:
        out += v.keeper;
        break;
      case 0x40:
        out += g.t(g.s.hour < 0xc ? 0x7826 : g.s.hour < 0x12 ? 0x782e : 0x7838); // morning, afternoon, evening
        break;
      case 0x25:
        out += String(v.price);
        break;
      case 0x5e:
        out += String(v.count);
        break;
      case 0x26:
        out += v.name1;
        break;
      case 0x2a:
        out += v.name2;
        break;
      default:
        out += String.fromCharCode(b);
    }
  }
  g.print(out);
}

/** SHOPPES_017a: a message from SHOPPE.DAT at a file offset. */
function sayFile(v: Visit, offset: number): void {
  const file = v.g.data.files.get('SHOPPE.DAT');
  const bytes: number[] = [];
  for (let i = offset; i < file.length && file[i] !== 0 && i < offset + 1500; i++) bytes.push(file[i]);
  sayShop(v, bytes);
}

/** DATA.OVL text with the substitutions. */
const sayOvl = (v: Visit, address: number): void => sayShop(v, v.g.t(address));

/** SHOPPES_019a: under the air of Falsehood, the change goes astray. */
function shortChange(g: Game): void {
  if (g.s.townAir === 0) g.s.gold = dec(g.s.gold, g.random(1, 0x40));
}

/** SHOPPES_01b6: the greeting (one of four for the kind). */
function greet(v: Visit): void {
  const { g } = v;
  g.printChar('"');
  sayFile(v, g.data.words(0x3b2a + v.kind * 8, 4)[g.random(0, 3)]);
  const x = g.text.win.x;
  if (x > 0xb)
    g.say(0x784c); // "\n\n:"
  else if (x === 0)
    g.say(0x7850); // "\n:"
  else g.printChar(' ');
}

/** SHOPPES_0202: the parting word: after a sale (1) or not (0); -1 and others say nothing. */
function part(v: Visit, how: number): void {
  const { g } = v;
  if (how === 0) {
    g.say(0x7854); // "\n\n\""
    sayFile(v, g.data.words(0x3b6a + v.kind * 8, 4)[g.random(0, 3)]);
  } else if (how === 1) {
    g.say(0x7858);
    sayFile(v, g.data.words(0x3baa + v.kind * 8, 4)[g.random(0, 3)]);
  }
  if (how === 0 || how === 1) {
    if (g.text.win.x !== 0) g.printChar('\n');
    sayOvl(v, 0x785c); // "says $.\n"
  }
}

/** SHOPPES_0280: Y or N, echoed. */
async function yesNoEcho(g: Game): Promise<number> {
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x4e) {
      g.say(0x7866); // "No"
      return k;
    }
    if (k === 0x59) {
      g.say(0x786a); // "Yes"
      return k;
    }
  }
}

async function waitYN(g: Game): Promise<number> {
  let k: number;
  do k = await getCharYN(g);
  while (k !== 0x59 && k !== 0x4e);
  return k;
}

const sirOrLady = (g: Game, m: number, lady: number, sir: number): void => g.say(g.s.members[m].gender === 0xc ? lady : sir);

// --- The guild: keys, gems, torches ----------------------------------------------------

/** SHOPPES_02ba. */
async function guildItem(v: Visit, what: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  v.price = haggle(g.data.words(0x3bea + v.shop * 8, 4)[what], s.members[v.buyer].int);
  g.say(0x786e); // "\n\n\""
  sayFile(v, g.data.words(0x3c0a, 3)[what]);
  g.say(0x7872); // "\n\nInterested?\" "
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x4e) {
      g.say(0x7882); // "No\n\n\"What else, then?\n\n"
      return result;
    }
    if (k === 0x59) {
      g.say(0x789a); // "Yes\n"
      if (s.gold < v.price) {
        sayFile(v, 0x21e6);
        return -1;
      }
      s.gold -= v.price;
      shortChange(g);
      drawVitals(g);
      if (what === 0) s.keys = inc(s.keys, GUILD_LOTS[0], 99);
      else if (what === 1) s.gems = inc(s.gems, GUILD_LOTS[1], 99);
      else s.torches = inc(s.torches, GUILD_LOTS[2], 99);
      sayOvl(v, 0x78a0); // "\n\"Sold!\"\nsays $.\n\n\"What else, \n"
      sirOrLady(g, v.addressee, 0x78c0, 0x78c8);
      g.say(0x78d0); // "?\n\n"
      return 1;
    }
  }
}

/** SHOPPES_04a2: the guild. */
async function guild(v: Visit): Promise<void> {
  const { g } = v;
  // While the wares are chosen from a menu (a controller's), the one the bar is on is shown over the party, as the
  // apothecary's are: how many the party holds, what it is for, and a lot's size and price (shopCard.ts drawGuildCard).
  g.choiceWatch = (at, title) => {
    if (title !== 'Choose' || at > 2) return;
    drawGuildCard(g, at, {
      count: GUILD_LOTS[at],
      price: haggle(g.data.words(0x3bea + v.shop * 8, 4)[at], g.s.members[v.buyer].int),
    });
  };
  try {
    await withFullPanel(g, () => guildWares(v));
  } finally {
    g.choiceWatch = null;
    clearBorderTitle(g);
    drawVitals(g);
  }
}

/** How many keys, gems and torches the guild sells at a time (guildItem). */
const GUILD_LOTS = [3, 4, 5];

async function guildWares(v: Visit): Promise<void> {
  const { g } = v;
  let result = 0;
  greet(v);
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x59) {
      g.say(0x7916); // "Yes\n\n\"We sell:\n\n"
      for (let done = false; !done; ) {
        g.say(0x78d4);
        g.say(0x78e4);
        g.say(0x78f4);
        g.say(0x7906); // "Thy concern?\" "
        let key: number;
        do {
          key = await getChar(g, undefined, false, true); // a ware's letter
          if (key >= 0x41 && key <= 0x43) {
            g.printChar(key | 0x20);
            result = await guildItem(v, key - 0x41, result);
            if (result === -1) done = true;
          } else if (key === K.Escape || key === K.Space) {
            done = true;
          } else if (key === 0x44) {
            sayFile(v, 0x2215);
          } else {
            key = 0;
          }
        } while (key === 0 && !done);
      }
      break;
    }
    if (k === K.Space || k === 0x4e) {
      g.say(0x7928); // "No"
      break;
    }
  }
  part(v, result);
}

// --- Reagents -----------------------------------------------------------------------------

/** SHOPPES_0502. */
async function reagent(v: Visit, pick: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  const prices = g.data.bytes(0x3a32 + v.shop * 8, 8);
  let i = 0;
  for (let n = 0; i < 8; i++) {
    if (prices[i] !== 0) {
      if (n === pick) break;
      n++;
    }
  }
  if (i === 8) return -2;
  if (s.reagents[i] === 99) {
    g.say(0x792c); // "\n\n\"Thou canst not carry any more!\"\n\n"
    await getChar(g);
    return result;
  }
  v.price = haggle(prices[i], s.members[v.buyer].int);
  v.count = g.data.bytes(0x3a5a + v.shop * 8, 8)[i];
  g.say(0x7952); // "\n\n\""
  sayFile(v, g.data.words(0x3c10, 8)[i]);
  if (g.options.input === 'controller') return reagentsDialled(v, i, result);
  g.say(0x7956); // " Is this thy need?\" "
  if (g.text.win.x > 0xc) g.say(0x796c); // "\n:"
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x4e) {
      g.say(0x7970); // "No\n\n\"What else?\n\n"
      return result;
    }
    if (k === 0x59) {
      g.say(0x7982); // "Yes\n"
      if (s.gold < v.price) {
        sayFile(v, 0x1a67 + 0x4c4);
        return -1;
      }
      s.gold -= v.price;
      shortChange(g);
      drawVitals(g);
      s.reagents[i] = inc(s.reagents[i], v.count, 99);
      sayOvl(v, 0x7988); // "\n\"I thank thee!\"\nsays $.\n"
      g.say(0x79a2); // "\"Anything else?\n\n"
      return 1;
    }
  }
}

/**
 * Reagents bought by the lot with a controller (the port's, as rations are): how many lots, on a dial that says what
 * a lot is, what the number dialled costs and how many the party will hold, and goes no higher than the party can pay
 * for and carry (99 of each) - but always to one, so a party with too little gold may still ask, and be told so as in
 * 1988. None dialled buys nothing.
 */
async function reagentsDialled(v: Visit, i: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  const { price, count } = v;
  const held = s.reagents[i];
  g.print(' How many?" ');
  const most = Math.min(Math.floor(s.gold / price), Math.ceil((99 - held) / count));
  const n = await getNumber(g, 2, {
    most,
    caption: (k) =>
      `Each: ${count} for ${price}gp\n${k === 0 ? 'None' : `Costs ${k * price} of ${s.gold}gp`}\nHeld: ${held} -> ${Math.min(99, held + k * count)}`,
  });
  if (n === 0) {
    g.print(g.t(0x7970).replace(/^No/, '')); // "\n\n\"What else?\n\n"
    return result;
  }
  if (s.gold < n * price) {
    sayFile(v, 0x1a67 + 0x4c4);
    return -1;
  }
  s.gold -= n * price;
  shortChange(g);
  drawVitals(g);
  s.reagents[i] = inc(held, n * count, 99);
  sayOvl(v, 0x7988); // "\n\"I thank thee!\"\nsays $.\n"
  g.say(0x79a2); // "\"Anything else?\n\n"
  return 1;
}

/** SHOPPES_075e: the apothecary. */
async function apothecary(v: Visit): Promise<void> {
  const { g } = v;
  greet(v);
  // While the wares are chosen from a menu (a controller's), the one the bar is on is shown over the party: how many
  // the party holds, what it goes into, and a lot's size and price to the buyer (shopCard.ts drawReagentCard).
  const prices = g.data.bytes(0x3a32 + v.shop * 8, 8);
  const sold = [...prices.keys()].filter((i) => prices[i] !== 0);
  g.choiceWatch = (at, title) => {
    const i = sold[at];
    if (title !== 'Choose' || i === undefined) return;
    drawReagentCard(g, i, {
      count: g.data.bytes(0x3a5a + v.shop * 8, 8)[i],
      price: haggle(prices[i], g.s.members[v.buyer].int),
    });
  };
  try {
    // At the panel's full height, as the armoury's (the lot on the row under the food and gold).
    await withFullPanel(g, () => apothecaryWares(v));
  } finally {
    g.choiceWatch = null;
    clearBorderTitle(g);
    drawVitals(g);
  }
}

async function apothecaryWares(v: Visit): Promise<void> {
  const { g } = v;
  let result = 0;
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x59) {
      g.say(0x7a2c); // "Yes\n\n\"Fine! We sell:\n\n"
      const names = g.data.table(0x3c20, 8);
      const prices = g.data.bytes(0x3a32 + v.shop * 8, 8);
      for (let done = false; !done; ) {
        let letter = 0x41;
        for (let i = 0; i < 8; i++) {
          if (prices[i] === 0) continue;
          g.printChar(letter++);
          g.say(0x7a16); // "..."
          g.print(names[i]);
          g.printChar('\n');
        }
        g.say(0x7a1a); // "\nThy interest?\" "
        let key: number;
        do {
          key = await getChar(g, undefined, false, true); // a ware's letter
          if (key >= 0x41 && key <= 0x45) {
            const r = await reagent(v, key - 0x41, result);
            if (r === -1) {
              result = -1;
              done = true;
            } else if (r === -2) {
              key = 0;
            } else {
              result = r;
            }
          } else if (key === K.Enter || key === K.Escape || key === K.Space) {
            done = true;
          } else {
            key = 0;
          }
        } while (key === 0 && !done);
      }
      break;
    }
    if (k === K.Space || k === 0x4e) {
      g.say(0x7a44); // "No"
      break;
    }
  }
  part(v, result);
}

// --- Stables ----------------------------------------------------------------------------------

/** SHOPPES_07be. */
async function stables(v: Visit): Promise<void> {
  const { g } = v;
  const s = g.s;
  let slot = 0;
  for (; slot < 32; slot++) if (s.actors[slot].tile === 0) break;
  const dxs = g.data.sbytes(0x3c38, 8);
  let x = 0;
  let y = 0;
  let side = 0;
  for (; side < 4; side++) {
    x = g.data.swords(0x3c38, 4)[side] + s.x;
    y = g.data.swords(0x3c40, 4)[side] + s.y;
    const t = tileAt(g, x, y);
    if (actorTileAt(g, x, y, s.level) === 0 && (t === T.T44 || t === T.T45 || t === T.Grass)) break;
  }
  void dxs;
  if (side === 4 || slot === 0x20) {
    g.say(0x7a48); // "The stables are closed.\n"
    return;
  }
  let result = 0;
  v.price = haggle(g.data.words(0x3c30, 4)[v.shop], s.members[v.buyer].int);
  greet(v);
  for (let done = false; !done; ) {
    const k = await getCharYN(g);
    if (k === 0x59) {
      g.say(0x7a62); // "Yes\n\n\""
      sayFile(v, 0x1643);
      g.say(0x7a6a); // "\n\nDeal?\" "
      if ((await waitYN(g)) === 0x4e) {
        g.say(0x7a74); // "No"
      } else {
        g.say(0x7a78); // "Yes!"
        if (s.gold < v.price) {
          g.say(0x7a7e); // "\n\n\"Thou couldst not afford to "
          sayOvl(v, 0x7a9e); // "feed it!\"\nyells $.\n"
          result = -1;
        } else {
          s.gold -= v.price;
          shortChange(g);
          const a = s.actors[slot];
          a.b6 = a.b7 = a.b5 = 0;
          a.tile = a.anim = 0x10;
          a.x = x;
          a.y = y;
          a.z = s.level;
          updateFrame(g);
          drawVitals(g);
          result = 1;
        }
      }
      done = true;
    } else if (k === K.Space || k === 0x4e) {
      g.say(0x7ab2); // "No"
      done = true;
    }
  }
  part(v, result);
}

// --- Arms: buying ---------------------------------------------------------------------------------

/** SHOPPES_09ac: one item; `forWhom`, the one of the party it is bought for, where a controller's buying named one. */
async function buyArm(v: Visit, item: number, result: number, forWhom = -1): Promise<number> {
  const { g } = v;
  const s = g.s;
  v.price = haggle(g.data.words(0x3a82, 0x30)[item], s.members[v.buyer].int);
  g.say(0x7b5e); // "\n\n\""
  sayFile(v, g.data.words(0x3c48, 0x2f)[item]);
  g.say(0x7b62); // "\n\n"
  g.print(g.data.table(0x3ca6, 4)[g.random(0, 3)]);
  g.say(0x7b66); // "\" "
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x4e) {
      g.say(0x7b6a); // "No\n\n"
      break;
    }
    if (k === 0x59) {
      g.say(0x7b70); // "Yes\n"
      if (s.equipment[item] === 99) {
        g.say(0x7b76); // "\n\"Thou canst not carry any more!\"\n"
        sayOvl(v, 0x7b9a); // "says $.\n\n"
        await getChar(g);
      } else if (s.gold < v.price) {
        g.say(0x7ba4); // "\n\""
        g.print(g.data.table(0x3cae, 4)[g.random(0, 3)]);
        sayOvl(v, 0x7ba8); // "\"\nyells $.\n"
        result = -1;
      } else {
        s.gold -= v.price;
        shortChange(g);
        drawVitals(g);
        if (item === 0x1b || item === 0x1d) s.equipment[item] = 99;
        else s.equipment[item] = inc(s.equipment[item], 1, 99);
        sayOvl(v, 0x7bb4); // "\nSold!\n"
        result = 1;
        await offerReady(v, item, forWhom);
      }
      break;
    }
  }
  if (result !== -1) {
    g.say(0x7bbc); // "\"Anything else,\n"
    if (result !== 0)
      sirOrLady(g, v.addressee, 0x7bce, 0x7bd6); // "milady?" : "sir?"
    else g.say(0x7bdc); // "then?"
  }
  return result;
}

/** SHOPPES_0b30: the shop's wares by letter. */
/**
 * Beside an armoury's wares (the port's): what each of the party now has where the ware under the bar would go - a
 * helm against their helms, a sword against what is in their hands - so a player can tell whether it is worth
 * its price without leaving the shop to look.
 */
function showWorn(g: Game, item: number): void {
  const s = g.s;
  const t = g.text;
  const short = g.data.table(0x1962, 0x38);
  borderTitle(g, 'Readied:');
  t.select(1);
  for (let i = 0; i < 6; i++) {
    let line = '';
    if (i < s.partySize) {
      const has = wornWhere(g, i, item);
      const what = has.length ? short[has[0]].trim().slice(0, has.length > 1 ? 8 : 9) + (has.length > 1 ? '+' : '') : '-';
      line = `${s.members[i].name.slice(0, 5).padEnd(5)} ${what}`;
    }
    t.moveTo(0, i);
    g.print(line.padEnd(15).slice(0, 15)); // the party's own lines are fifteen wide, and will be drawn over these
  }
}

/**
 * A purchase readied on the spot, by whoever the player names: each with what they would put away for it - the bar
 * on `forWhom` where the ware was bought for one of them (a controller's buying, shopCard.ts).
 */
async function offerReady(v: Visit, item: number, forWhom = -1): Promise<void> {
  const { g } = v;
  const s = g.s;
  if (item === 0x1b || item === 0x1d) return; // arrows and quarrels are not readied
  const short = g.data.table(0x1962, 0x38);
  const able = Array.from({ length: s.partySize }, (_, i) => i).filter((i) => s.members[i].status !== Status.Dead);
  const items = [
    { label: 'Keep it packed' },
    ...able.map((i) => {
      const has = wornWhere(g, i, item);
      return { label: `${s.members[i].name.slice(0, 8)} (${has.length ? short[has[0]].trim() : 'nothing'})` };
    }),
  ];
  const watch = g.choiceWatch;
  // The member under the bar, their arms against the ware on the panel, as the Buy list shows it (shopCard.ts); on
  // Keep it packed, the party.
  g.choiceWatch = (i, title) => {
    if (title !== 'Ready it?') return;
    if (i > 0 && able[i - 1] !== undefined) drawWareCard(g, able[i - 1], item);
    else {
      clearBorderTitle(g);
      drawVitals(g);
    }
  };
  let at: number;
  try {
    at = await choose(g, 'Ready it?', items, Math.max(0, able.indexOf(forWhom) + 1), true);
  } finally {
    g.choiceWatch = watch;
    clearBorderTitle(g);
    drawVitals(g);
  }
  await restoreView(g);
  g.text.select(2);
  if (at <= 0) return;
  const m = able[at - 1];
  if (await readyPurchase(g, m, item)) g.print(`\n${s.members[m].name} readies it.\n`);
}

async function buyArms(v: Visit): Promise<number> {
  // Who wears what, beside the wares, needs the panel's nine rows (layout.ts).
  return withFullPanel(v.g, () => buyArmsShown(v));
}

async function buyArmsShown(v: Visit): Promise<number> {
  const { g } = v;
  const wares = g.data.bytes(0x3ae2 + v.shop * 8, 8);
  if (g.options.input === 'controller') {
    try {
      // The shop's wares up to the first 0xff (buyArmsList's end of the list).
      const end = wares.indexOf(0xff);
      return await buyArmsFor(v, [...wares.subarray(0, end < 0 ? wares.length : end)]);
    } finally {
      g.choiceWatch = null;
      clearBorderTitle(g);
      drawVitals(g);
      g.text.select(2);
    }
  }
  // While the wares are chosen from a menu, the party's own are shown beside them (showWorn).
  g.choiceWatch = (at, title) => {
    if (title !== 'Choose' || wares[at] === undefined || wares[at] === 0xff) return;
    showWorn(g, wares[at]);
  };
  try {
    return await buyArmsList(v, wares);
  } finally {
    g.choiceWatch = null;
    clearBorderTitle(g);
    drawVitals(g);
    g.text.select(2);
  }
}

async function buyArmsList(v: Visit, wares: Uint8Array): Promise<number> {
  const { g } = v;
  const names = g.data.table(0x17f6, 0x30);
  const short = g.data.table(0x1962, 0x38);
  let result = 0;
  for (let done = false; !done; ) {
    g.say(0x7c44); // "\n\n"
    let n = 0;
    for (; n < 8; n++) {
      const item = wares[n];
      if (item === 0xff) break;
      g.printChar(n + 0x61);
      g.say(0x7c48); // "..."
      g.print(names[item].length < 0xd ? names[item] : short[item]);
      if (g.text.win.x !== 0) g.printChar('\n');
    }
    g.printChar('\n');
    g.print(g.data.table(0x3cb6, 4)[g.random(0, 3)]);
    g.say(0x7c4c); // "\" "
    let key: number;
    do {
      key = await getChar(g, undefined, false, true); // a ware's letter
      const i = key - 0x41;
      if (i < n && i >= 0) {
        g.printChar(i + 0x61);
        result = await buyArm(v, wares[i], result);
        if (result === -1) done = true;
      } else if (key === K.Escape || key === K.Space) {
        done = true;
      } else {
        key = 0;
      }
    } while (key === 0 && !done);
  }
  return result;
}

/**
 * A controller's buying (the port's): who is buying first, then the wares for them - those they can carry and the
 * party afford in white, those the party cannot afford in light grey, those they could not carry in dark grey, each
 * with its price - and on the panel what they have where the ware would go, against it (shopCard.ts). The price is
 * the shop's buyer's (Visit.buyer, the cleverest, haggles); the one chosen is who the ware is for, the first offered
 * it to ready. B goes back to who is buying, and from there out of the shop.
 */
async function buyArmsFor(v: Visit, wares: number[]): Promise<number> {
  const { g } = v;
  const s = g.s;
  const names = g.data.table(0x17f6, 0x30);
  const short = g.data.table(0x1962, 0x38);
  const priceOf = (item: number): number => haggle(g.data.words(0x3a82, 0x30)[item], s.members[v.buyer].int);
  let result = 0;
  let who = 0;
  for (;;) {
    // Who is buying: the dead greyed (Status), their arms on the panel.
    g.choiceWatch = (_at, title) => {
      if (title === 'Who is buying?') drawBuyers(g);
    };
    const members = Array.from({ length: s.partySize }, (_, i) => i);
    const at = await choose(
      g,
      'Who is buying?',
      members.map((i) => ({ label: s.members[i].name, enabled: s.members[i].status !== Status.Dead })),
      who,
      true,
    );
    await restoreView(g);
    g.text.select(2);
    if (at < 0) return result;
    who = at;
    let bar = 0;
    /** The ware the bar was on when chosen: the list sorts again after a purchase, and the bar goes with the ware. */
    let onWare = -1;
    for (;;) {
      const sorted = sortWares(g, who, wares, priceOf);
      if (sorted.includes(onWare)) bar = sorted.indexOf(onWare);
      const items = sorted.map((item) => {
        const name = names[item].length < 0xd ? names[item] : short[item].trim();
        const rank = standing(g, who, item, priceOf(item));
        const price = `${priceOf(item)}g`;
        return {
          label: `${name.padEnd(13).slice(0, 13)} ${price.padStart(5)}`,
          colour: rank === 0 ? Colour.brightWhite : rank === 1 ? Colour.lightGray : Colour.darkGray,
        };
      });
      g.choiceWatch = (i, title) => {
        if (title === 'Buy' && sorted[i] !== undefined) drawWareCard(g, who, sorted[i]);
      };
      // The wares in the log as 1988 lists them (the merchant's "We have:" says them), then the question.
      g.say(0x7c44); // "\n\n"
      wares.forEach((item, n) => {
        g.printChar(n + 0x61);
        g.say(0x7c48); // "..."
        g.print(names[item].length < 0xd ? names[item] : short[item]);
        if (g.text.win.x !== 0) g.printChar('\n');
      });
      g.printChar('\n');
      g.print(g.data.table(0x3cb6, 4)[g.random(0, 3)]);
      g.say(0x7c4c); // "\" "
      const pick = await choose(g, 'Buy', items, Math.min(bar, items.length - 1), true);
      await restoreView(g);
      clearBorderTitle(g); // the buyer's name was the card's: the party's panel again for the purchase
      drawVitals(g);
      g.text.select(2);
      if (pick < 0) {
        g.print('\n');
        break;
      }
      bar = pick;
      const item = sorted[pick];
      onWare = item;
      g.print(names[item].length < 0xd ? names[item] : short[item].trim());
      result = await buyArm(v, item, result, who);
      if (result === -1) return result;
      g.print('\n');
    }
  }
}

// --- Arms: selling --------------------------------------------------------------------------------

/** SHOPPES_0c80: the party's armaments in the stats window, the chosen one highlighted; returns its row. */
function showForSale(g: Game, top: { v: number }, sel: { v: number }): number {
  const s = g.s;
  const t = g.text;
  const eq = s.equipment;
  if (eq[sel.v] === 0) {
    if (top.v === sel.v) {
      sel.v = prevHeld(g, sel.v, eq);
      if (sel.v === -1) sel.v = nextHeld(g, -1, 0x30, eq);
      top.v = sel.v;
    } else {
      sel.v = nextHeld(g, sel.v, 0x30, eq);
      if (sel.v === -1) {
        sel.v = prevHeld(g, 0x30, eq);
        if (prevHeld(g, top.v, eq) > -1) top.v = prevHeld(g, top.v, eq);
      }
    }
  }
  t.select(1);
  t.moveTo(1, 1);
  let row = 0;
  let at = top.v;
  const names = g.data.table(0x1962, 0x38);
  while (at !== -1) {
    if (sel.v === at) {
      g.printChar(0xfd);
      row = t.win.y;
    }
    listLine(g, at, eq, names, 0x2d);
    if (sel.v === at) g.printChar(0xfd);
    t.moveTo(1, t.win.y);
    if (t.win.y === 5) break;
    at = nextHeld(g, at, 0x30, eq);
  }
  for (let r = t.win.y; r !== 5; r++) {
    t.moveTo(1, r);
    g.say(0x7c50); // blanks
  }
  let arrows = 0;
  if (prevHeld(g, top.v, eq) !== -1) arrows = 2;
  if (at !== -1 && nextHeld(g, at, 0x30, eq) !== -1) arrows++;
  if (arrows !== 0) {
    t.moveTo(6, 6);
    leftArrow(g);
  }
  if (arrows === 0) clearSpellBar(g);
  else {
    g.printChar([0, 0x19, 0x18, 0x12][arrows]);
    rightArrow(g);
  }
  t.select(2);
  return row;
}

const hasArms = (g: Game): boolean => g.s.equipment.some((n) => n !== 0);

/** SHOPPES_0e76: an offer for one item. */
async function sellOne(v: Visit, item: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  if (item === 0x1b || item === 0x1d) {
    sayOvl(v, 0x7d32); // "\n\n\"We don't deal in used ammunition!\"\ngrowls $.\n"
    return 1;
  }
  g.say(0x7d64); // "\n\n\""
  const price = g.data.words(0x3a82, 0x30)[item];
  if (price !== 0) {
    v.price = Math.trunc((s.members[v.buyer].int * price * 3) / 100) + 1;
    v.name1 = g.data.table(0x3cce, 0x30)[item] || g.data.table(0x17f6, 0x30)[item];
    sayFile(v, g.data.words(0x3cbe, 8)[g.random(0, 7)]);
    g.say(0x7d68); // "\n\nDeal?\" "
    if ((await waitYN(g)) === 0x4e) {
      g.say(0x7d72); // "No"
    } else {
      sayOvl(v, 0x7d76); // "Yes\n\n\"Done!\"\nsays $."
      s.gold = inc(s.gold, v.price, 9999);
      s.equipment[item] = dec(s.equipment[item], 1);
    }
    drawGold(g);
  } else {
    sayOvl(v, 0x7d8c); // "That, I cannot buy from thee.\"\nsays $."
  }
  return 0;
}

/** SHOPPES_0f64: selling: pick from the list with the arrows, Enter to offer. */
async function sellArms(v: Visit): Promise<void> {
  // The party's arms, listed for sale, need the panel's nine rows (layout.ts).
  return withFullPanel(v.g, () => sellArmsShown(v));
}

async function sellArmsShown(v: Visit): Promise<void> {
  const { g } = v;
  const t = g.text;
  const eq = g.s.equipment;
  if (!hasArms(g)) {
    sayOvl(v, 0x7f20); // "Thou hast nothing to sell!\"\ngrowls $.\n"
    return;
  }
  g.print(g.data.table(0x3d2e, 4)[g.random(0, 3)]);
  g.say(0x7ef0); // "\" "
  if (g.options.input === 'controller') {
    // The pack as a menu over the map (the ultima3 port's way), each line offered until B or nothing is left.
    const { choose, restoreView } = await import('./menu.ts');
    let at = 0;
    let result = 0;
    for (;;) {
      const held: number[] = [];
      for (let i = nextHeld(g, -1, 0x30, eq); i !== -1; i = nextHeld(g, i, 0x30, eq)) held.push(i);
      if (held.length === 0) break;
      at = Math.min(at, held.length - 1);
      const pick = await choose(
        g,
        'Sell',
        held.map((i) => itemLabel(g, i, 0x52, 0xff, eq[i])),
        at,
        true,
      );
      await restoreView(g);
      if (pick < 0) break;
      at = pick;
      result = await sellOne(v, held[pick]);
      if (result !== 0 || !hasArms(g)) break;
      g.say(0x7f06); // "\n\n\""
      g.print(g.data.table(0x3d3e, 4)[g.random(0, 3)]);
      g.say(0x7f0a); // "\" "
    }
    drawVitals(g);
    if (result !== 0) return;
    g.say(0x7f0e); // "\n\n\""
    g.print(g.data.table(0x3d36, 4)[g.random(0, 3)]);
    g.say(0x7f12); // "\"\n"
    if (!hasArms(g)) return;
    sayOvl(v, 0x7f16); // "says $.\n"
    return;
  }
  borderTitle(g, g.t(0x7ef4)); // "Arms"
  t.select(1);
  listBox(g, 5);
  const top = { v: nextHeld(g, -1, 0x30, eq) };
  const sel = { v: top.v };
  let row = showForSale(g, top, sel);
  let result = 0;
  for (let done = false; !done; ) {
    const k = await getChar(g);
    switch (k) {
      case K.Left:
      case K.Up:
      case PgUp:
        for (let n = k === PgUp ? 4 : 1; n > 0; n--) {
          const p = prevHeld(g, sel.v, eq);
          if (sel.v === top.v) {
            if (p > -1) top.v = sel.v = p;
          } else {
            sel.v = p;
          }
        }
        row = showForSale(g, top, sel);
        break;
      case K.Right:
      case K.Down:
      case PgDn:
        for (let n = k === PgDn ? 4 : 1; n > 0; n--) {
          const nx = nextHeld(g, sel.v, 0x30, eq);
          if (nx > -1) {
            sel.v = nx;
            if (++row > 4) top.v = nextHeld(g, top.v, 0x30, eq);
          }
        }
        row = showForSale(g, top, sel);
        break;
      case Home:
        top.v = sel.v = nextHeld(g, -1, 0x30, eq);
        row = showForSale(g, top, sel);
        break;
      case End:
        top.v = sel.v = prevHeld(g, 0x30, eq);
        for (let i = 1; i < 4; i++) {
          const p = prevHeld(g, top.v, eq);
          if (p === -1) break;
          top.v = p;
        }
        row = showForSale(g, top, sel);
        break;
      case K.Enter:
      case K.Space:
        result = await sellOne(v, sel.v);
        if (result === 0 && hasArms(g)) {
          row = showForSale(g, top, sel);
          g.say(0x7f06); // "\n\n\""
          g.print(g.data.table(0x3d3e, 4)[g.random(0, 3)]);
          g.say(0x7f0a); // "\" "
        } else {
          done = true;
        }
        break;
      case K.Escape:
        done = true;
        break;
    }
  }
  void row;
  drawVitals(g);
  clearBorderTitle(g);
  if (result !== 0) return;
  g.say(0x7f0e); // "\n\n\""
  g.print(g.data.table(0x3d36, 4)[g.random(0, 3)]);
  g.say(0x7f12); // "\"\n"
  if (!hasArms(g)) return;
  sayOvl(v, 0x7f16); // "says $.\n"
}

/** SHOPPES_12b2: the arms dealer. */
async function armoury(v: Visit): Promise<void> {
  const { g } = v;
  let result = 0;
  sayOvl(v, 0x8018); // "\"Good @, and welcome to #!\"\n"
  await getChar(g);
  sayOvl(v, 0x8036); // "\n$ says,\n\""
  g.print(g.data.table(0x3d46, 2)[g.random(0, 1)]);
  g.say(0x8042); // "\" "
  for (;;) {
    const k = await getLetter(g, [0x42, 0x53], ['Buy', 'Sell']);
    if (k === 0x42) {
      g.say(0x8046); // "Buy\n\n\""
      g.print(g.data.table(0x3d4a, 4)[g.random(0, 3)]);
      g.print(g.data.table(0x3d52, 4)[g.random(0, 3)]);
      result = await buyArms(v);
      break;
    }
    if (k === 0x53) {
      g.say(0x804e); // "Sell\n\n\""
      await sellArms(v);
      result = -1;
      break;
    }
    if (k === K.Space) {
      g.say(0x8056); // "No"
      break;
    }
  }
  part(v, result);
}

// --- Healers ------------------------------------------------------------------------------------------

/** SHOPPES_137c: who needs aid - the bar on whoever needs the art asked for most (input.ts neediest). */
async function patient(v: Visit, need: Need): Promise<number> {
  const { g } = v;
  if (g.s.partySize === 1) return 0;
  g.say(0x805a); // "\n\n\"Who needs my aid?\" "
  const m = await selectMember(g, false, undefined, undefined, neediest(g, need));
  if (m === -1) g.say(0x8072); // "No one"
  return m;
}

/** SHOPPES_13b0: the healing light. */
async function healingLight(g: Game): Promise<void> {
  const d = g.draw;
  const snd = g.soundOff ? null : g.sound;
  d.invert(8, 8, 0xb7, 0xb7);
  await snd?.pulse(0x100e, 1, 0x57e4, 5000, 1);
  await snd?.pulse(0x100e, 1, 0x57e4, 0x6b6c, -1);
  d.invert(8, 8, 0xb7, 0xb7);
  await snd?.pulse(0x11b2, 1, 40000, 1, 1);
  await snd?.pulse(0x11b2, 1, 40000, 40000, -1);
  d.invert(8, 8, 0xb7, 0xb7);
  await snd?.pulse(0x8fc, 1, 18000, 1, 2);
  await snd?.pulse(0x8fc, 1, 18000, 36000, -2);
  if (!snd) await g.p.sleep(600);
  d.invert(8, 8, 0xb7, 0xb7);
}

/** SHOPPES_146a: the fee (the Abbey heals the poor for small sums); true if not paid. */
async function fee(v: Visit): Promise<boolean> {
  const { g } = v;
  const s = g.s;
  sayOvl(v, 0x807a); // "for % gold.\n\nWilt thou\npay?\" "
  let k: number;
  do {
    k = await getCharYN(g);
    if (k === 0x59) g.say(0x8098);
    else if (k === 0x4e) g.say(0x809c);
  } while (k !== 0x59 && k !== 0x4e);
  let refused = k === 0x4e;
  if (!refused && s.gold < v.price && (v.price > 100 || s.mapId !== 7)) {
    sayFile(v, 0x23ab);
    refused = true;
  }
  if (!refused && s.gold >= v.price) {
    s.gold -= v.price;
    shortChange(g);
  }
  return refused;
}

/** CAST2_05e0_Resurrect: raised with 1 hit point, experience cut by karma, level and max hit points from it. */
export function resurrect(g: Game, m: number, verbose: boolean): number {
  const s = g.s;
  if (m < 0) return -1;
  const p = s.members[m];
  if (p.status !== Status.Dead) {
    if (verbose) g.say(0x953c); // "Not dead!\n"
    return 0;
  }
  p.status = Status.Good;
  p.hp = 1;
  if (p.cls === 0x41 || p.cls === 0x4d) p.mp = p.int;
  else if (p.cls === 0x42) p.mp = p.int >> 1;
  if (s.karma < 0x62) p.exp = Math.trunc((p.exp * s.karma) / 100);
  const level = earnedLevel(p.exp);
  p.level = level;
  p.maxHp = level * 0x1e;
  g.vitalsDirty = 1;
  return 1;
}

/** SHOPPES_14f8: the healer: cure, heal, resurrect (cure and heal free with the Light at Minoc's, map 5). */
async function healer(v: Visit): Promise<void> {
  const { g } = v;
  const s = g.s;
  const cure = g.data.bytes(0x3d8e, 8);
  const heal = g.data.bytes(0x3d86, 8);
  const raise = g.data.words(0x3d96, 8);
  greet(v);
  for (let done = false; !done; ) {
    let k: number;
    do {
      k = await getCharYN(g);
      if (k === 0x4e) g.say(0x80a0);
      else if (k === 0x59) g.say(0x80a4);
    } while (k !== 0x4e && k !== 0x59);
    if (k === 0x4e) break;
    g.say(0x80aa); // "\"We have powers to Cure, Heal, or Resurrect.\"\n"
    sayOvl(v, 0x80da); // "says $.\n\n\"What is the nature of thy need?\" "
    // Each with its price on a controller's list (the port's): free with the Light at Minoc's.
    const price = (gp: number, light: boolean): string => (light && s.mapId === 5 ? 'free' : `${gp}gp`);
    do
      k = await getLetter(
        g,
        [0x43, 0x48, 0x52],
        [`Cure poison (${price(cure[v.shop], true)})`, `Heal (${price(heal[v.shop], true)})`, `Resurrect (${price(raise[v.shop], false)})`],
      );
    while (k !== 0x43 && k !== 0x48 && k !== 0x52 && k !== K.Space && k !== K.Enter);
    const nothing = (): void => sayShop(v, g.t(0x3d5a)); // "Thou hast no need of this art!" says $.
    switch (k) {
      case 0x43: {
        g.say(0x8106); // "Curing"
        const m = await patient(v, 'poisoned');
        if (m === -1) break;
        if (s.members[m].status !== Status.Poisoned) {
          nothing();
        } else {
          g.say(0x810e);
          if (s.mapId === 5) {
            g.say(0x8112); // "Receive now the Light!\""
            await healingLight(g);
            s.members[m].status = Status.Good;
          } else {
            g.say(0x812a); // "I can cure thy poisoned body "
            v.price = cure[v.shop];
            if (!(await fee(v))) {
              await healingLight(g);
              s.members[m].status = Status.Good;
            }
          }
        }
        break;
      }
      case 0x48: {
        g.say(0x8148); // "Healing"
        const m = await patient(v, 'hurt');
        if (m === -1) break;
        const p = s.members[m];
        if (p.status !== Status.Dead && p.hp !== p.maxHp) {
          g.say(0x8150);
          if (s.mapId === 5) {
            g.say(0x8154);
            await healingLight(g);
            p.hp = p.maxHp;
          } else {
            g.say(0x816c); // "I can heal thee "
            v.price = heal[v.shop];
            if (!(await fee(v))) {
              await healingLight(g);
              p.hp = p.maxHp;
            }
          }
        } else {
          nothing();
        }
        break;
      }
      case 0x52: {
        g.say(0x817e); // "Resurrect"
        const m = await patient(v, 'dead');
        if (m === -1) break;
        if (s.members[m].status === Status.Dead) {
          g.say(0x8188);
          g.say(0x818c); // "I can raise this unfortunate person from "
          g.say(0x81b6); // "the dead "
          v.price = raise[v.shop];
          if (!(await fee(v))) {
            await healingLight(g);
            resurrect(g, m, false);
            s.members[m].hp = s.members[m].maxHp;
            drawVitals(g);
          }
        } else {
          nothing();
        }
        break;
      }
      default:
        g.say(0x81c0); // "Nothing"
        done = true;
    }
    if (!done) {
      drawVitals(g);
      g.say(0x81c8); // "\n\n\"Is there any other way in which I may\n"
      g.say(0x81f2); // "aid thee?\" "
    }
  }
  part(v, 1);
}

// --- Pubs ---------------------------------------------------------------------------------------------

interface Pub {
  v: Visit;
  /** D_bd16: which of the pub menus. */
  menu: number;
  /** D_bd1a, D_bd1c: those who eat, and how many are served. */
  eaters: number;
  served: number;
  /** D_bd18: something was bought. */
  bought: number;
  /** D_bd20: drinks had. */
  drinks: number;
}

/** SHOPPES2_0000: the price for everyone standing. */
function forAll(p: Pub, each: number): void {
  const { g } = p.v;
  p.eaters = p.served = p.v.price = 0;
  for (let i = 0; i !== g.s.partySize; i++) {
    if (g.s.members[i].status !== Status.Dead) {
      p.served++;
      p.eaters++;
      p.v.price += each;
    }
  }
  g.printChar('\n');
  g.printChar('\n');
}

/** SHOPPES2_00ac: "sir" or "milady" by the Avatar. */
function sir(g: Game): void {
  g.s.activeMember = 0xff;
  g.say(g.s.members[0].gender === 0xb ? 0x9ac2 : 0x9ac6);
}

/** SHOPPES2_00dc: pay for the round; food served lands on the table. */
function payRound(p: Pub): number {
  const { g } = p.v;
  const s = g.s;
  g.printChar('"');
  g.say(0x9ace); // "That will be "
  g.printNumber(p.v.price);
  g.say(0x9adc); // " gold for the "
  g.say([0, 0, 0x9aa8, 0x9aac, 0x9ab2, 0x9ab8, 0x9abe][p.served] ?? 0x9aa8);
  g.say(0x9aec); // " of ye,\n"
  sir(g);
  g.printChar('.');
  if (p.v.price > s.gold) {
    g.say(0x9af6); // "\"\n\n\"CAN'T PAY?\nBeat it!\"\nyells "
    g.print(p.v.keeper);
    g.printChar('.');
    g.printChar('\n');
    return 1;
  }
  s.gold -= p.v.price;
  shortChange(g);
  if (p.eaters !== 0) {
    s.food = inc(s.food, p.eaters, 9999);
    if (tileAt(g, s.x, s.y - 1) === T.Table95) {
      setTileAt(g, s.x, s.y - 1, T.Table9B);
      updateFrame(g);
    } else if (tileAt(g, s.x, s.y + 1) === T.Table95) {
      setTileAt(g, s.x, s.y + 1, T.Table9A);
      updateFrame(g);
    }
  } else {
    p.drinks++;
  }
  g.say(0x9b16); // "\nEnjoy!\"\n\n"
  return 0;
}

/** SHOPPES2_01f4: drink (the wine list, where there is one); a fourth round makes the party drunk. */
async function drink(p: Pub): Promise<number> {
  const { g } = p.v;
  const s = g.s;
  g.printChar(g.data.bytes(0x4c24, 5)[p.menu]);
  if (p.drinks === 3) {
    g.say(0x9b22); // "\n\n\"I beg thy\npardon, "
    sir(g);
    g.say(0x9b38); // ",\"\nsays "
    g.print(p.v.keeper);
    g.say(0x9b42); // ".\n\"But haven't\nye had enough\nto drink?\" "
    for (;;) {
      const k = await getCharYN(g);
      if (k === 0x59) {
        g.say(0x9b6c);
        return 0;
      }
      if (k === 0x4e) {
        g.say(0x9b72); // "No!"
        s.drunk = 0x19;
        s.karma = dec(s.karma, 1);
        break;
      }
    }
  }
  forAll(p, 1);
  if (g.data.bytes(0x4c24, 5)[p.menu] !== 0x57) {
    p.eaters = 0;
    return payRound(p);
  }
  g.say(0x9b76); // "\"Our wine list,\n"
  sir(g);
  g.say(0x9b88);
  for (const a of [0x9b8c, 0x9b9e, 0x9bb0, 0x9bc2, 0x9bd4, 0x9be6]) g.say(a);
  g.say(0x9bfa); // "Thy choice?\" "
  let k: number;
  do {
    k = await getChar(g, undefined, false, true); // a ware's letter
    if (k === K.Space || k === K.Escape) {
      g.printChar('\n');
      g.printChar('\n');
      sayFile(p.v, 0x1413);
      return 2;
    }
  } while (k < 0x41 || k > 0x46);
  g.printChar(k);
  g.say(0x9c08); // "\n\n\"Ah, a fine\nchoice, "
  sir(g);
  g.printChar('.');
  const price = g.data.swords(0x4c48, 6)[k - 0x41];
  if (s.gold < price) {
    g.say(0x9c20);
    g.print(p.v.keeper);
    g.printChar('.');
    g.printChar('\n');
    return 1;
  }
  s.gold -= price;
  shortChange(g);
  p.drinks++;
  g.say(0x9c40); // "\nEnjoy!\""
  g.printChar('\n');
  g.printChar('\n');
  return 0;
}

/** SHOPPES2_0380: rations to take away, 25 food each. */
async function rations(p: Pub): Promise<number> {
  const { v } = p;
  const { g } = v;
  const s = g.s;
  g.printChar(g.data.bytes(0x4c2a, 5)[p.menu]);
  g.printChar('\n');
  g.printChar('\n');
  v.price = haggle(g.data.words(0x4c54, 9)[v.shop], s.members[v.buyer].int);
  g.printChar('"');
  sayFile(v, g.data.words(0x4c66, 7)[g.random(0, 6)]);
  g.say(0x9c4a); // "\n\nHow many wouldst\nthou like?\" "
  // The port's, with a controller: the dial says what a ration is and what the number dialled costs, and goes no
  // higher than the party can pay for and carry - but always to one, so a party with no gold can still ask, and be
  // pitied if it is starving (below), as in 1988.
  const price = v.price;
  const most = Math.min(Math.floor(s.gold / price), Math.ceil((9999 - s.food) / 0x19));
  let want = await getNumber(g, 2, {
    most,
    caption: (n) => `Each: 25 food, ${price}gp\n${n === 0 ? 'None' : `Costs ${n * price} of ${s.gold}gp`}`,
  });
  let got = want;
  if (want === 0) {
    g.say(0x9c6a); // "\n\n\"Hrumph.\""
    return 2;
  }
  for (; want !== 0; want--) {
    if (s.gold >= v.price) {
      s.gold = dec(s.gold, v.price);
      s.food = inc(s.food, 0x19, 9999);
      if (s.food === 9999) break;
    } else {
      got -= want;
      g.say(0x9c76);
      if (got === 0) {
        if (s.food < 3) {
          s.food = inc(s.food, g.random(0, 1) + 1, 9999);
          sayFile(v, 0x143f);
          return 1;
        }
        g.say(0x9c7a); // "\"Thou hast\nneither gold nor\nneed! Out!\"\n"
        g.say(0x9ca4); // "yells "
        g.print(v.keeper);
        g.say(0x9cac);
        return 1;
      }
      g.say(0x9cb0); // "\"Thou canst\nafford only "
      g.printNumber(got);
      g.say(0x9cca); // "!\"\n\n"
      return 0;
    }
  }
  g.say(0x9cd0);
  shortChange(g);
  return 0;
}

/** SHOPPES2_0508: lore for a price, from the barkeep's list of topics (D_4c74). */
async function lore(p: Pub): Promise<number> {
  const { v } = p;
  const { g } = v;
  const s = g.s;
  g.printChar(g.data.bytes(0x4c30, 5)[p.menu]);
  g.say(0x9efc);
  const topics = g.data.table(0x4c74, 0x1a);
  for (;;) {
    g.say(0x9f00); // "Of what wouldst\nthou hear my\nlore, "
    sir(g);
    g.say(0x9f24); // "?\"\n\nYou respond:\n"
    const typed = await askWord(g, 0xf, 'Lore', topics, true);
    g.say(0x9f36);
    if (typed.length === 0) return 0;
    const i = topics.findIndex((w) => saysWord(w, typed));
    if (i === -1) {
      g.say(0x9f3a); // "\"That, I cannot help thee with.\n\n"
      continue;
    }
    v.price = g.data.words(0x4d10, 0x1a)[i];
    sayFile(v, 0x134e);
    g.say(0x9f5c); // "\n\nFair 'nuff?\" "
    if ((await waitYN(g)) === 0x4e) {
      g.say(0x9f6c);
      return 0;
    }
    g.say(0x9f72);
    if (v.price > s.gold) {
      g.say(0x9f78); // "\"Sorry, "
      sir(g);
      sayFile(v, 0x146a);
      return 1;
    }
    s.gold -= v.price;
    drawVitals(g);
    v.name1 = g.data.table(0x4ca8, 0x1a)[i];
    v.name2 = g.data.table(0x4cf6, 0xd)[g.data.bytes(0x4cdc, 0x1a)[i]];
    sayFile(v, g.data.words(0x4d44, 4)[g.random(0, 3)]);
    g.say(0x9f82); // "\nsays "
    g.print(v.keeper);
    g.say(0x9f8a);
    return 0;
  }
}

/** SHOPPES2_066c: the pub. */
async function pub(v: Visit): Promise<void> {
  const { g } = v;
  const p: Pub = { v, menu: g.data.bytes(0x4d4c, 10)[v.shop], eaters: 0, served: 0, bought: 0, drinks: 0 };
  const keys = [0x4c1e, 0x4c24, 0x4c2a, 0x4c30].map((a) => g.data.bytes(a, 5)[p.menu]);
  greet(v);
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x4e || k === K.Space) {
      g.say(0x9f8e);
      part(v, p.bought);
      return;
    }
    if (k === 0x59) break;
  }
  g.say(0x9f92); // "Yes\n\n\""
  sayFile(v, g.data.words(0x4d56, 4)[p.menu]);
  g.printChar('"');
  g.printChar(' ');
  if (g.text.win.x > 0xe) g.printChar('\n');
  for (;;) {
    let r: number;
    for (;;) {
      const k = await getLetter(
        g,
        keys.filter((key) => key !== 0),
      );
      r = 0;
      if (k === K.Space || k === K.Escape || k === K.Enter) {
        part(v, p.bought);
        return;
      }
      if (keys[0] === k) {
        g.printChar(k);
        forAll(p, g.data.words(0x4c36, 9)[v.shop]);
        if (payRound(p) !== 0) return;
      }
      if (keys[1] === k) {
        r = await drink(p);
        if (r === 1) return;
      }
      if (keys[2] === k) {
        r = await rations(p);
        if (r === 1) return;
      }
      if (keys[3] === k) {
        if (p.bought === 0) continue;
        if ((await lore(p)) !== 0) return;
      }
      if (keys.includes(k)) break;
    }
    if (r !== 2) p.bought = 1;
    drawVitals(g);
    g.say(0x9f9a); // "\"Anything else\nfor thee?\" "
    for (;;) {
      const k = await getCharYN(g);
      if (k === 0x4e) {
        g.say(0x9fb6);
        part(v, p.bought);
        return;
      }
      if (k === 0x59) break;
    }
    g.say(0x9fba);
    sayFile(v, g.data.words(0x4d5e, 4)[p.menu]);
    g.printChar('"');
    g.printChar(' ');
  }
}

// --- Shipwrights ------------------------------------------------------------------------------------

interface Wright {
  v: Visit;
  /** D_bd22: thrown out. */
  out: number;
  /** D_bd24: bought. */
  bought: number;
}

/** SHOPPES2_07e2: can the party pay. */
function canPay(w: Wright, price: number): boolean {
  if (price > w.v.g.s.gold) {
    sayFile(w.v, 0x198e);
    sayOvl(w.v, 0x9fc2); // "yells $.\n"
    w.out = 1;
    return false;
  }
  return true;
}

/** SHOPPES2_080e: the sale: the boat waits at the dock (D_4d76, D_4d7a) when the party leaves town. */
async function shipSold(w: Wright, dock: boolean, pay: boolean): Promise<boolean> {
  const { g } = w.v;
  const s = g.s;
  if (dock) {
    sayFile(w.v, 0x19ab);
    s.shipX = g.data.bytes(0x4d76, 4)[w.v.shop];
    s.shipY = g.data.bytes(0x4d7a, 4)[w.v.shop];
  }
  if (pay) {
    s.gold -= w.v.price;
    w.bought = 1;
    shortChange(g);
  }
  drawVitals(g);
  sayFile(w.v, 0x19da);
  // The original compares the gender with 'F', which never holds; so always "sir".
  g.say(0x9fd4); // "sir"
  g.say(0x9fd8); // "?\" "
  if ((await waitYN(g)) === 0x59) {
    g.say(0x9fdc);
    return false;
  }
  g.say(0x9fe0);
  return true;
}

/** SHOPPES2_08a8: a frigate or a skiff (one ship a customer; skiffs go aboard it). */
async function boats(w: Wright): Promise<void> {
  const { v } = w;
  const { g } = v;
  const s = g.s;
  const int = s.members[v.buyer].int;
  for (;;) {
    sayFile(v, 0x18eb);
    const k = await getLetter(g, [0x46, 0x53], ['Frigate', 'Skiff']);
    let leave = false;
    if (k === 0x46) {
      g.say(0x9fe4); // "F\n\n"
      leave = true;
      if ((s.boughtShip & 0xc0) !== 0) {
        sayFile(v, 0x19f2);
        if ((await waitYN(g)) === 0x59) {
          g.say(0x9fe8);
          canPay(w, 10000);
        } else {
          g.say(0x9fec);
          await boats(w);
        }
      } else {
        v.price = haggle(g.data.words(0x4d66, 4)[v.shop], int);
        sayFile(v, 0x183e);
        sayFile(v, 0x1a50);
        if ((await waitYN(g)) === 0x59) {
          g.say(0x9ff0);
          if (!canPay(w, v.price)) return;
          s.boughtShip = 0x82;
          leave = await shipSold(w, true, true);
          if (leave) return;
          continue;
        }
        g.say(0x9ff6);
        return;
      }
    } else if (k === 0x53) {
      g.say(0x9ffa); // "S\n\n"
      v.price = haggle(g.data.words(0x4d6e, 4)[v.shop], int);
      sayFile(v, 0x188c);
      sayFile(v, 0x1a50);
      leave = true;
      if ((await waitYN(g)) === 0x59) {
        g.say(0x9ffe);
        if (!canPay(w, v.price)) return;
        if ((s.boughtShip & 0xc0) === 0) {
          s.boughtShip = 0x40;
          leave = await shipSold(w, true, true);
        } else if ((s.boughtShip & 0x80) !== 0) {
          sayFile(v, 0x193b);
          s.boughtShip++;
          leave = await shipSold(w, false, true);
        } else if ((s.boughtShip & 0x40) !== 0) {
          sayFile(v, 0x195f);
          leave = await shipSold(w, false, false);
        } else {
          if (leave) return;
          continue;
        }
      } else {
        g.say(0xa004);
        return;
      }
    } else if (k === K.Escape || k === K.Space) {
      leave = true;
    }
    if (leave) return;
  }
}

/** SHOPPES2_0abc: the shipwright. */
async function shipwright(v: Visit): Promise<void> {
  const { g } = v;
  const w: Wright = { v, out: 0, bought: 0 };
  greet(v);
  for (;;) {
    const k = await getCharYN(g);
    if (k === 0x59) {
      g.say(0xa008);
      await boats(w);
      break;
    }
    if (k === K.Space || k === 0x4e) {
      g.say(0xa00c);
      break;
    }
  }
  if (w.out === 0) part(v, w.bought);
}

// --- Inns ---------------------------------------------------------------------------------------------

/** SHOPPES3_0000: companions left at this inn. */
const guests = (g: Game): number => g.s.members.filter((m) => m.mapId === g.s.mapId).length;

/** SHOPPES3_002c: a room free (each inn keeps a few, D_4dc4). */
function roomFree(v: Visit, gender: number): boolean {
  const { g } = v;
  g.say(0x4d84);
  if (guests(g) < g.data.bytes(0x4dc4, 6)[v.shop]) return true;
  g.say(0x4d87); // "\"I am sorry,\n"
  g.say(gender === 0xc ? 0x4d95 : 0x4d9c);
  g.say(0x4da0); // ", but we\nhave no room\navailable.\"\n\n"
  return false;
}

/**
 * A member's nights at the inn, slept or waited out there (SHOPPES3_0072, SHOPPES3's collecting of one left):
 * healed to the full and their mana back. Poisoned, they die, as in 1988 - or, with the eased rules (the
 * port's), which promise poison never kills, they wake still poisoned at half their hit points: up from less,
 * down from more, the poison working on them yet. True if they died.
 */
export function innNight(g: Game, m: Member): boolean {
  m.hp = m.maxHp;
  if (m.cls === 0x41 || m.cls === 0x4d) m.mp = m.int;
  else if (m.cls === 0x42) m.mp = m.int >> 1;
  if (m.status !== Status.Poisoned) return false;
  if (!poisonKills(g.options)) {
    m.hp = Math.max(1, m.maxHp >> 1);
    return false;
  }
  m.status = Status.Dead;
  m.hp = 0;
  return true;
}

/** SHOPPES3_0072: rest till morning: healed, magic back; poison kills overnight (innNight). */
async function rest(v: Visit, int: number, gender: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  g.printChar('R');
  if (!roomFree(v, gender)) return -2;
  g.printChar('"');
  v.price = g.data.bytes(0x4d7e, 8)[v.shop] * s.partySize;
  v.price += Math.trunc((v.price * -(int * 3 - 100)) / 100);
  sayFile(v, g.data.words(0x4e6e, 6)[v.shop]);
  g.say(0x4dca); // "\nWilt thou take\nit?\" "
  const k = await yesNoEcho(g);
  g.say(0x4de0);
  if (k !== 0x59) return result;
  if (s.gold < v.price) {
    g.say(0x4de3); // "\"Highwaymen!\nCheap, at that!\nOUT!\" "
    sayOvl(v, 0x4e07); // "screams\n$.\n"
    return result;
  }
  s.gold -= v.price;
  shortChange(g);
  drawVitals(g);
  g.say(0x4e13); // "\"Have a pleasant\nnight, "
  g.say(gender === 0xc ? 0x4e2c : 0x4e33);
  sayOvl(v, 0x4e37); // "!\"\nsays $.\n\n"
  await sleepTicks(g, 10);
  setTownTile(g, s.openDoor, s.doorX, s.doorY);
  s.x = g.data.bytes(0x4e7a, 6)[v.shop];
  s.y = g.data.bytes(0x4e80, 6)[v.shop];
  g.viewDirty = 1;
  const active = s.activeMember;
  for (let i = 0; i < s.partySize; i++) if (s.members[i].status === Status.Good) s.members[i].status = Status.Sleeping;
  drawVitals(g);
  updateFrame(g);
  g.say(0x4e44); // "Zzzzzz....\n\n"
  for (let i = 0; i < 0xc; i++) passTime(g, 5);
  while (s.hour !== 6) {
    await sleepTicks(g, 1);
    for (let i = 0; i < s.partySize; i++) {
      const m = s.members[i];
      if (m.status !== Status.Dead && m.equips[4] === 0x2c && g.random(0, 7) === 7) m.hp = Math.min(m.hp + 1, m.maxHp);
    }
    drawVitals(g);
    passTime(g, 9);
    if (s.hour === 0x14 || s.hour === 5) hourTiles(g);
  }
  g.say(0x4e51); // "Morning!\n"
  placeAllNpcs(g);
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.status === Status.Dead) continue;
    if (innNight(g, m)) {
      g.printChar('\n');
      g.print(m.name);
      g.say(0x4e5b); // " has\npassed away.\n"
    } else if (m.status === Status.Sleeping) {
      m.status = Status.Good;
    }
  }
  s.activeMember = active;
  s.x++;
  g.viewDirty = 1;
  drawVitals(g);
  return -1;
}

/** SHOPPES3_02ae: leave a companion, paying by the month when they are picked up. */
async function leave(v: Visit, int: number, gender: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  g.printChar('L');
  if (!roomFree(v, gender)) return result;
  if (s.partySize === 1) {
    sayFile(v, 0x26e8);
    return -1;
  }
  for (;;) {
    sayOvl(v, 0x4e86); // "$ asks,\n\"Who will\nstay?\" "
    const m = await selectMember(g);
    if (m === -1) {
      g.say(0x4ea0); // "Nobody\n\n"
      return -2;
    }
    g.say(0x4ea9);
    if (m === 0) {
      g.say(0x4eac); // "Thy friend"
      if (s.partySize > 2) g.printChar('s');
      g.say(0x4eb7); // " will not leave thee!\n\n"
      continue;
    }
    if (s.members[m].status === Status.Dead) {
      sayFile(v, 0x2723);
      return -1;
    }
    v.price = g.data.bytes(0x4d7e, 8)[v.shop] * 10;
    v.price += Math.trunc((v.price * -(int * 3 - 100)) / 100);
    g.say(0x4ecf); // "\"The rate for\nour most comfortable room will be "
    sayOvl(v, 0x4f00); // "% gold per month, due at check-out."
    g.say(0x4f24); // "\nWilt thou take\nit?\" "
    const k = await yesNoEcho(g);
    g.say(0x4f3a);
    if (k !== 0x59) return result;
    if (s.activeMember === m) s.activeMember = 0xff;
    else if (m < s.activeMember && s.activeMember !== 0xff) s.activeMember--;
    s.members[m].mapId = s.mapId;
    s.members[m].x17 = 0;
    const kept = s.members[m].b.slice();
    for (let i = m; i < 0xf; i++) s.members[i].b.set(s.members[i + 1].b);
    s.members[0xf].b.set(kept);
    s.partySize--;
    drawVitals(g);
    sayOvl(v, 0x4f3d); // "\"I thank thee.\"\nsays $.\n\n"
    return 1;
  }
}

/** SHOPPES3_04e6: pick up a companion left here (choosing from the register if more than one). */
async function pickUp(v: Visit, int: number, result: number): Promise<number> {
  // Who checks out is chosen from a list that needs the panel's nine rows (layout.ts).
  return withFullPanel(v.g, () => pickUpShown(v, int, result));
}

async function pickUpShown(v: Visit, int: number, result: number): Promise<number> {
  const { g } = v;
  const s = g.s;
  const t = g.text;
  const here = guests(g);
  const nextGuest = (i: number): number => {
    while (++i < 0x10) if (s.members[i].mapId === s.mapId) return i;
    return 0;
  };
  const prevGuest = (i: number): number => {
    while (--i) if (s.members[i].mapId === s.mapId) break;
    return i;
  };
  if (s.partySize === 6) {
    g.say(0x4f57); // "\n\nOne must first be left behind!\n\n"
    return result;
  }
  if (here === 0) {
    sayOvl(v, 0x4f7a); // "\n\n\"No one here is from thy party!\"\nsays $.\n\n"
    return result;
  }
  let who: number;
  if (here > 1) {
    g.say(0x4fa7); // "\n\n\"Who will\ncheck out?\" "
    t.select(1);
    g.draw.pen = 15;
    g.draw.line(0xbf, 0x38, 0xbf, 0x3f);
    g.draw.line(0x138, 0x38, 0x138, 0x3f);
    g.draw.pen = 0;
    g.draw.fill(0xc0, 0x38, 0x137, 0x3f);
    listBox(g, 8);
    t.moveTo(1, 1);
    g.say(0x4fc0); // "    GUEST"
    t.moveTo(1, 2);
    g.say(0x4fca); // "  REGISTER:\n\n"
    for (let i = 1; i < 0x10; i++) {
      if (s.members[i].mapId === s.mapId) {
        t.moveTo(4, t.win.y);
        g.print(s.members[i].name);
        g.printChar('\n');
      }
    }
    t.select(2);
    who = nextGuest(0);
    let y = 0x28;
    g.draw.pen = 15;
    for (let done = false; !done; ) {
      g.draw.invert(0xc6, y, 0x131, y + 7);
      let moved: number;
      do {
        const k = await getChar(g);
        switch (k) {
          case K.Left:
          case K.Up:
            moved = prevGuest(who);
            if (moved !== 0) {
              g.draw.invert(0xc6, y, 0x131, y + 7);
              who = moved;
              y -= 8;
            }
            break;
          case K.Right:
          case K.Down:
            moved = nextGuest(who);
            if (moved !== 0) {
              g.draw.invert(0xc6, y, 0x131, y + 7);
              who = moved;
              y += 8;
            }
            break;
          case K.Escape:
            g.say(0x4fd8); // "No one\n\n"
            who = 0;
            moved = 1;
            done = true;
            break;
          case K.Space:
          case K.Enter:
            moved = 1;
            done = true;
            break;
          default:
            moved = 0;
        }
      } while (moved === 0);
    }
    clearSpellBar(g);
    drawVitals(g);
  } else {
    who = nextGuest(0);
  }
  if (who === 0) return result;
  const months = s.members[who].x17 || 1;
  v.price = g.data.bytes(0x4d7e, 8)[v.shop] * 10;
  v.price += Math.trunc((v.price * -(int * 3 - 100)) / 100);
  v.price *= months;
  sayOvl(v, 0x4fe1); // "\n\n\"That will be % gold, please.\"\n\n\""
  if (s.gold < v.price) {
    sayFile(v, 0x275a);
    callGuards(g);
    return -1;
  }
  s.gold -= v.price;
  shortChange(g);
  drawVitals(g);
  const kept = s.members[who].b.slice();
  for (let i = who; i > s.partySize; i--) s.members[i].b.set(s.members[i - 1].b);
  s.members[s.partySize].b.set(kept);
  const m = s.members[s.partySize++];
  m.mapId = 0;
  if (innNight(g, m))
    g.say(0x5005); // "Thy friend has died, by the way.\"\n"
  else g.say(0x5028); // "I hope thou hast found thy stay enjoyable,\"\n"
  sayOvl(v, 0x5055); // "says $.\n\n"
  drawVitals(g);
  return 1;
}

/** SHOPPES3_08b4: the inn (any spell in effect ends). */
async function inn(v: Visit): Promise<void> {
  const { g } = v;
  const s = g.s;
  const int = s.members[v.buyer].int;
  const gender = s.members[v.addressee].gender; // how the innkeeper speaks to the party
  let result = 0;
  s.icon = s.protection = 0;
  drawVitals(g);
  greet(v);
  for (let done = false; !done; ) {
    let k: number;
    do {
      k = await getCharYN(g);
      if (k === K.Space) k = 0x4e;
      if (k === 0x4e) g.say(0x505f);
      else if (k === 0x59) g.say(0x5062);
    } while (k !== 0x4e && k !== 0x59);
    if (k === 0x4e) break;
    sayOvl(v, 0x5066); // "\n\n$ asks,\n\"Art thou here\nto Pick up or\n"
    g.say(0x508e); // "Leave a\ncompanion, or\nto Rest for the\nnight?\" "
    for (;;) {
      k = await getLetter(g, [0x50, 0x4c, 0x52], ['Pick up a companion', 'Leave a companion', 'Rest the night']);
      if (k === 0x52) {
        const r = await rest(v, int, gender, result);
        if (r > -2) {
          result = r;
          done = true;
        }
        break;
      }
      if (k === K.Space) {
        done = true;
        break;
      }
      if (k === 0x4c) {
        const r = await leave(v, int, gender, result);
        if (r > -2) result = r;
        if (result === -1) done = true;
        break;
      }
      if (k === 0x50) {
        result = await pickUp(v, int, result);
        if (result === -1) done = true;
        break;
      }
    }
    if (!done) g.say(0x50bd); // "\"Is there\nanything more\nI can do for\nthee?\" "
  }
  part(v, result);
}

// --- In the door ----------------------------------------------------------------------------------------

/** TALK_00e6_TalkToMerchant: kinds 0x81-0x88 (arms, pub, stables, shipwright, reagents, guild, healer, inn). */
export async function merchant(g: Game, kind: number): Promise<void> {
  const s = g.s;
  if ((s.partyTile & 0xfe) === 0x12 && kind !== 0x83) {
    g.say(0x9072); // "A merchant says:\n\"GET THAT HORSE OUT OF HERE!\"\n"
    return;
  }
  // Who does the business: the cleverest of the party awake (the port's), whose intelligence haggles the prices. 1988
  // had whoever was active, or the first; a player made the cleverest active to buy, then readied it on whoever it
  // was for - the cleverest's prices without the errand.
  let buyer = -1;
  for (let i = 0; i < s.partySize; i++) {
    const st = s.members[i].status;
    if (st !== Status.Good && st !== Status.Poisoned) continue;
    if (buyer < 0 || s.members[i].int > s.members[buyer].int) buyer = i;
  }
  if (buyer < 0) {
    buyer = s.activeMember;
    if (buyer === 0xff) {
      firstActive(g);
      buyer = s.dx;
    }
  }
  const k = kind - 0x81;
  const maps = g.data.bytes(0x23ca + k * 16, 16);
  let shop = 0;
  for (; maps[shop] !== s.mapId && shop < 0x10; shop++);
  const v: Visit = {
    g,
    kind: k,
    shop,
    price: 0,
    count: 0,
    shopName: g.data.table(0x21ca + k * 32, 16)[shop] ?? '',
    keeper: g.data.table(0x22ca + k * 32, 16)[shop] ?? '',
    name1: '',
    name2: '',
    buyer,
    // The Avatar is the one spoken to while alive, whoever does the haggling: the party's face is the Avatar's.
    addressee: s.members[0].status !== Status.Dead ? 0 : buyer,
  };
  switch (k) {
    case 0:
      return armoury(v);
    case 1:
      return pub(v);
    case 2:
      return stables(v);
    case 3:
      return shipwright(v);
    case 4:
      return apothecary(v);
    case 5:
      return guild(v);
    case 6:
      return healer(v);
    case 7:
      return inn(v);
  }
}

export { freeActor, itemCounts };
