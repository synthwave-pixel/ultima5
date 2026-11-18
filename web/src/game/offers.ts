/**
 * offers.ts
 *
 * What the A button offers where the party stands (contextual), and everything there is to do (the command menu's
 * whole list): Ultima V's commands, by where and what is about. Moved out of menu.ts, which keeps the menus' own
 * workings, so that a game on this engine with other commands brings its own offers.
 */

import { talkingHorseBeside } from './cmds.ts';
import { actorTileAt } from './actors.ts';
import { foesAbout } from './bumpAct.ts';
import { drawVitals } from './frame.ts';
import { CF, Game } from './game.ts';
import { besideHarpsichord } from './harpsichord.ts';
import { HARPSICHORD, K, Pad, SOLO, SOLO_OFF } from './io.ts';
import { somethingBeside } from './items.ts';
import { itemCounts, nextHeld, unloaded } from './zstats.ts';
import { fieldWon, turnMember } from './turn.ts';
import { holdFullPanel } from './layout.ts';
import { drawSwitchCard } from './readyCard.ts';
import { lootField, lootOffer } from './loot.ts';
import { Status } from './save.ts';
import { shortcutCasts, SPELL_EFFECTS } from './magic.ts';
import {
  attackOffer,
  fireOffer,
  getOffer,
  campWanted,
  holeUpLabel,
  holeUpOffer,
  jimmyOffer,
  klimbOffer,
  signAhead,
  openOffer,
  stealChestOffer,
  stealOffer,
  pushOffer,
  searchOffer,
  talkOffer,
  onlySide,
  yellOffer,
  type Offer,
} from './targets.ts';
import { saveOptions } from './settings.ts';
import { A, T } from './tiles.ts';
import { tileAt } from './world.ts';
import { TALK_WIDTH } from './speech.ts';
import { shortArmNames } from './armNames.ts';
import { journalScreen } from './journalScreen.ts';
import { type Item, type TalkRows, c, choose, key, restoreView } from './menu.ts';
/** The menu's keys for the spells the moment calls for (shortcutCasts), one each. */
const SHORTCUT = 0x110;
/** Loot and Leave's key in the command menu (loot.ts). */
const LOOT = 0x108;
/** The dungeon's Drink: Look at the fountain, and drink (dungeon.ts lookInDungeon, Game.drinkPreset). */
const DRINK = 0x104;
/** The dungeon's Read sign: the sign on the wall ahead, printed in the log (dungeon.ts readSignAhead). */
const READ_SIGN = 0x105;
/**
 * Steal and Steal from chest (targets.ts stealOffer, stealChestOffer): Get and Open, of what is another's, under keys
 * of their own so that a Get or an Open the menu also offers does not take their place.
 */
const STEAL = 0x10a;
const STEAL_CHEST = 0x10b;
/** Wait in a towne (cmds.ts waitInTown): the hours passed off a bed. */
const WAIT = 0x10c;
/** The Enhanced dungeon's Change View: its first-person view large, the map beside it, or the other way round. */
const DUNGEON_VIEW = 0x10d;

/** The four squares around the party. */
function around(g: Game): [number, number][] {
  const s = g.s;
  return [
    [s.x, s.y - 1],
    [s.x + 1, s.y],
    [s.x, s.y + 1],
    [s.x - 1, s.y],
  ];
}

/**
 * Whether Board is to be had where the party is, `under` the actor there - as Board itself takes it (cmds.ts
 * boardCommand): on foot, a horse, a carpet lying where it was left (0x1b), a skiff or a ship; from a skiff or a
 * carpet, a ship - the skiff stowed aboard, the carpet packed (canBoardShip), a party rowed back to its ship having no
 * other way aboard.
 */
function canBoard(g: Game, under: number): boolean {
  const p = g.s.partyTile;
  const ship = (under & 0xfc) === 0x24;
  if (p === A.Avatar) return (under & 0xfe) === 0x10 || under === 0x1b || (under & 0xfc) === 0x28 || ship;
  return ship && ((p & 0xfe) === 0x14 || (p & 0xfe) === 0x1c || (p & 0xfc) === 0x28);
}

const ENTRANCES: number[] = [
  T.Hut,
  T.Keep,
  T.Village,
  T.Towne,
  T.Castle,
  T.Lighthouse,
  T.PalaceBlackthorn,
  T.CastleLB,
  T.Shrine,
  T.Codex,
  T.Cave,
  T.Mine,
  T.Dungeon,
  T.Ruins,
];

/**
 * The weapon in the hands of whoever would strike, and whether it
 * reaches: the menu says what is readied, and leads with it when it can
 * be thrown or shot (the port's, from the ultima3 port).
 */
function readied(g: Game): { name: string; ranged: boolean } | null {
  const s = g.s;
  let who = s.activeMember;
  if (s.mapId > 0x7f && s.combatTurn < 0x20) {
    // In a fight, the one whose turn it is - a creature on the party's side holds none of the members' arms.
    who = turnMember(g);
    if (who < 0) return null;
  }
  if (who === 0xff || who >= s.partySize) {
    who = 0xff;
    for (let i = 0; i < s.partySize && who === 0xff; i++) {
      const st = s.members[i].status;
      if (st === Status.Good || st === Status.Poisoned) who = i;
    }
  }
  if (who === 0xff || who >= s.partySize) return null;
  const names = shortArmNames(g);
  const damage = g.data.bytes(0x15fc, 0x38);
  const reach = g.data.bytes(0x1664, 0x38);
  let best: { name: string; ranged: boolean } | null = null;
  for (const slot of [2, 3, 0]) {
    const w = s.members[who].equips[slot];
    if (w === 0xff || !damage[w]) continue;
    const item = { name: (names[w] ?? '').trim(), ranged: reach[w] > 0 };
    if (!item.name) continue;
    if (!best || (item.ranged && !best.ranged)) best = item;
  }
  return best;
}

/** The Attack entry, named for what is in hand - or, a bow with nothing to shoot in a fight, for what it lacks. */
function attackItem(g: Game): Item {
  const s = g.s;
  const empty =
    s.mapId > 0x7f && s.combatTurn < 0x20 && g.combat[s.combatTurn].flags & CF.Player ? unloaded(g, g.combat[s.combatTurn].who) : null;
  const arm = readied(g);
  return { label: empty ? `Attack (${empty.toLowerCase()})` : arm ? `Attack (${arm.name})` : 'Attack', key: c('A') };
}

/** What the surroundings call for, first. */
export function contextual(g: Game): Item[] {
  const s = g.s;
  const out: Item[] = [];
  const where = g.commandPrompt;
  // Beside a harpsichord, on any side: its keyboard (harpsichord.ts), the notes a controller has no number keys for.
  if (where === 'town' && besideHarpsichord(g)) out.push({ label: 'Play', key: HARPSICHORD });
  const near = around(g);
  const foeNear = (): boolean =>
    near
      .concat([
        [s.x - 1, s.y - 1],
        [s.x + 1, s.y - 1],
        [s.x - 1, s.y + 1],
        [s.x + 1, s.y + 1],
      ])
      .some(([x, y]) => {
        const t = actorTileAt(g, x, y, s.level);
        return (t >= 0x80 && t !== 0xfc) || (t & 0xfc) === 0x2c;
      });
  if (where === 'outdoors' && ENTRANCES.includes(tileAt(g, s.x, s.y))) out.push({ label: 'Enter', key: c('E') });
  // A horse is boarded where it is bought, in a towne's stable, and left at a towne's door: Board and X-it
  // are for towne and country both.
  if (where === 'outdoors' || where === 'town') {
    const under = actorTileAt(g, s.x, s.y, s.level);
    // Board also beside Smith, who will not be ridden: "Nay!" (cmds.ts talkingHorseBeside).
    if (canBoard(g, under) || (where === 'town' && talkingHorseBeside(g))) out.push({ label: 'Board', key: c('B') });
    if (s.partyTile !== A.Avatar) out.push({ label: 'X-it', key: c('X') });
  }
  if (where === 'outdoors') {
    if (foeNear()) out.push(attackItem(g));
    if ((s.partyTile & 0xf8) === 0x20) out.push({ label: 'Fire cannons', key: c('F') });
    if (s.grapple !== 0 && near.some(([x, y]) => tileAt(g, x, y) === 0xc)) out.push({ label: 'Klimb', key: c('K') });
  } else if (where === 'town') {
    // Whoever Talk would reach (targets.ts talkOffer): beside the party, or across a counter - as the list below has it.
    if (talkOffer(g) === 'show') out.push({ label: 'Talk', key: c('T') });
    const doors = near.map(([x, y]) => tileAt(g, x, y));
    if (doors.some((t) => t >= 0xb8 && t <= 0xbb)) out.push({ label: 'Open', key: c('O') });
    if (doors.some((t) => t === 0xb9 || t === 0xbb)) out.push({ label: 'Jimmy', key: c('J'), enabled: s.keys !== 0 });
    // Furniture beside the party that moves (targets.ts pushOffer): Push, for what a bump does not reach - a chair, or
    // a barrel a bump only searches.
    if (pushOffer(g) === 'show') out.push({ label: 'Push', key: c('P') });
    const here = tileAt(g, s.x, s.y);
    if (here === T.LadderUp || here === T.LadderDown || here === 0xc8 || here === 0xc9) out.push({ label: 'Klimb', key: c('K') });
    if (here === T.Bed) out.push({ label: 'Sleep', key: c('H') });
  } else if (where === 'dungeon') {
    const cell = s.dungeon[s.level * 0x40 + s.y * 8 + s.x];
    const kind = cell & 0xf0;
    const ax = (g.data.swords(0x24d6, 4)[s.facing] + s.x) & 7;
    const ay = (g.data.swords(0x24de, 4)[s.facing] + s.y) & 7;
    if (s.actors[1].x === ax && s.actors[1].y === ay) out.push(attackItem(g));
    // Klimb: a ladder or a pit, or a hole above - grey without the grapple to go up it.
    const klimb = klimbOffer(g);
    if (klimb !== 'hide') out.push({ label: 'Klimb', key: c('K'), enabled: klimb === 'show' });
    // A sign on the wall ahead, read again in the log (the port's): its runes dissolve there as anywhere.
    if (signAhead(g) >= 0) out.push({ label: 'Read sign', key: READ_SIGN });
    if (kind === 0x40) {
      out.push({ label: 'Open chest', key: c('O') });
      out.push({ label: 'Jimmy chest', key: c('J'), enabled: s.keys !== 0 });
    }
    if (kind === 0x70) out.push({ label: 'Get', key: c('G') });
    // A fountain here or ahead (the port's): Look's drink, its way given - grey in the dark, where Look sees nothing.
    const ahead = s.dungeon[s.level * 0x40 + ay * 8 + ax] & 0xf0;
    const lit = s.d58a6 !== 0 || s.d58a7 !== 0;
    if (kind === 0x50 || ahead === 0x50) out.push({ label: 'Drink', key: DRINK, enabled: lit });
    // In the dark, a torch to light comes first - after a foe ahead to strike - so that A twice is not Klimb and out of
    // the dungeon just entered (the port's); with none to light, grey at the foot.
    if (!lit) {
      const torch = { label: 'Ignite torch', key: c('I'), enabled: s.torches !== 0 };
      if (s.torches !== 0) out.splice(out[0]?.key === attackItem(g).key ? 1 : 0, 0, torch);
      else out.push(torch);
    }
  } else if (where === 'combat') {
    out.push(attackItem(g));
    // Switch Weapon (the port's): the member's melee arms and their ranged, one for the other (switchWeapon.ts).
    if (g.combat[s.combatTurn]?.flags & CF.Player) out.push({ label: 'Switch Weapon', key: c('W') });
    // A room's trigger square beside the member - a wall that opens a secret way - or furniture that moves: Push, at
    // the head of the menu once no foe stands, after the arms while one does (targets.ts pushOffer).
    if (g.combat[s.combatTurn]?.flags & CF.Player && pushOffer(g) === 'show') {
      const push = { label: 'Push', key: c('P') };
      if (foesAbout(g, 'combat')) out.push(push);
      else out.unshift(push);
    }
    // A caster's last spell, ready to cast again (the ultima3 port's): the fight's fire bolt is one press away.
    const who = turnMember(g);
    const last = g.lastSpell.get(who);
    if (last !== undefined && s.mixtures[last] !== 0 && !shortcutCasts(g).some((r) => r.spell === last))
      out.push({ label: `Cast (${SPELL_EFFECTS[last]})`, key: 0x100 + 7 });
    // Solo Mode (solo.ts), a controller's: the member whose turn it is the only one to move; Cancel Solo once it is on.
    if (g.options.input === 'controller' && who >= 0)
      out.push(s.activeMember === 0xff ? { label: 'Solo Mode', key: SOLO } : { label: 'Cancel Solo', key: SOLO_OFF });
  }
  // A camp that would be a rest, with someone it would heal: it leads the rest of the menu (targets.ts campWanted).
  if ((where === 'outdoors' || where === 'dungeon') && campWanted(g)) out.push({ label: 'Camp', key: c('H') });
  // The spells the moment calls for, cast without further asking: a heal, a cure, a light in the dark - each its own
  // line. After what the place itself offers - a towne underfoot is entered, a townsman at hand is spoken to -
  // since those are why the party came here, and the wound will keep.
  shortcutCasts(g).forEach((ready, i) => out.push({ label: ready.label, key: SHORTCUT + i }));
  // A weapon that reaches leads: with a bow in hand, shooting is the first thing offered.
  if (readied(g)?.ranged) {
    const at = out.findIndex((it) => it.key === c('A'));
    if (at > 0) out.unshift(out.splice(at, 1)[0]);
  }
  // Something still to be found beside the party - a hidden thing, a buried moonstone, a reagent at midnight, a wall
  // with a nick - puts Search at the head of the menu: a small hint (the port's), where 1988 left it to searching
  // everything.
  if ((where === 'town' || where === 'outdoors') && somethingBeside(g)) out.unshift({ label: 'Search', key: c('S') });
  // A fight won is left from the head of the menu: the field stays the party's until then, for its chests.
  // Not where the field cannot be left (Doom's last room): there it would only say so.
  if (where === 'combat' && fieldWon(g) && !(s.combatFlags & 0x80)) {
    // Loot and Leave (loot.ts) above it, while there is something on the field to take and someone to take it: the
    // bar starts on what a won field is most often left by. Where no one can (all asleep), it waits greyed under it.
    const loot = lootOffer(g);
    const leave = { label: 'Leave combat', key: K.Escape };
    const take = { label: 'Loot and Leave', key: LOOT, enabled: loot === 'show' };
    out.unshift(...(loot === 'show' ? [take, leave] : loot === 'grey' ? [leave, take] : [leave]));
  }
  return out;
}

/**
 * The rest of the commands, in the order they are most wanted, each as the ultima3 port offers it (targets.ts):
 * left out where it has nothing to act on, greyed where it has but the party has not the means - no mixture to
 * cast, no torch to light, no gem to peer into, no key to jimmy with, no grapple for the mountain.
 */
function everything(g: Game): Item[] {
  const s = g.s;
  const where = g.commandPrompt;
  const combat = where === 'combat';
  const outdoors = where === 'outdoors';
  const offered = (item: Item, o: Offer): Item[] => (o === 'hide' ? [] : [{ ...item, enabled: o === 'show' }]);
  const has = (b: boolean): Offer => (b ? 'show' : 'grey');
  const only = (b: boolean): Offer => (b ? 'show' : 'hide');
  const onFoot = s.partyTile === A.Avatar;
  const under = actorTileAt(g, s.x, s.y, s.level);
  // A creature's turn on the party's side (combat.ts turnMember): what only a member may do is left out - 1988 answers
  // each with "Can't!" (playerTurn).
  const creature = combat && s.combatTurn < 0x20 && turnMember(g) < 0;
  const member = (o: Offer): Offer => (creature ? 'hide' : o);
  const list: Item[] = [
    ...offered({ label: 'Look', key: c('L') }, only(!combat)),
    // The Enhanced dungeon's two layouts, the first-person view large and the map beside it or the other way round.
    ...offered({ label: 'Change View', key: DUNGEON_VIEW }, only(!combat && dungeonViews(g))),
    ...offered({ label: 'Search', key: c('S') }, member(searchOffer(g))),
    ...offered({ label: 'Get', key: c('G') }, member(getOffer(g))),
    ...offered({ label: 'Steal', key: STEAL }, member(stealOffer(g))),
    ...offered({ label: 'Cast', key: c('C') }, member(has(s.mixtures.some((n) => n !== 0)))),
    ...offered({ label: 'Use item', key: c('U') }, member(only(nextHeld(g, -1, 0x26, itemCounts(g), 0xff) !== -1))),
    ...offered({ label: 'Ready', key: c('R') }, member('show')),
    { label: 'Ztats', key: c('Z') },
    ...offered({ label: 'Mix reagents', key: c('M') }, combat ? 'hide' : has(s.reagents.some((r) => r !== 0))),
    ...offered({ label: 'Talk', key: c('T') }, talkOffer(g)),
    ...offered({ label: 'Open', key: c('O') }, member(openOffer(g))),
    ...offered({ label: 'Steal from chest', key: STEAL_CHEST }, member(stealChestOffer(g))),
    ...offered({ label: 'Jimmy', key: c('J') }, member(jimmyOffer(g))),
    ...offered({ label: 'Push', key: c('P') }, pushOffer(g)),
    ...offered({ label: 'Klimb', key: c('K') }, klimbOffer(g)),
    ...offered(attackItem(g), attackOffer(g)),
    ...offered({ label: holeUpLabel(g), key: c('H') }, holeUpOffer(g)),
    // Off a bed in a towne, the hours passed standing (the port's, cmds.ts waitInTown), where Hole up is "Only in bed!".
    ...offered({ label: 'Wait', key: WAIT }, only(where === 'town' && tileAt(g, s.x, s.y) !== T.Bed)),
    ...offered({ label: 'Ignite torch', key: c('I') }, combat ? 'hide' : has(s.torches !== 0)),
    ...offered({ label: 'View a gem', key: c('V') }, combat ? 'hide' : has(s.gems !== 0)),
    ...offered({ label: 'Yell', key: c('Y') }, yellOffer(g)),
    ...offered({ label: 'Enter', key: c('E') }, only(outdoors && ENTRANCES.includes(tileAt(g, s.x, s.y)))),
    ...offered(
      { label: 'Board', key: c('B') },
      only((outdoors || where === 'town') && (canBoard(g, under) || (where === 'town' && talkingHorseBeside(g)))),
    ),
    ...offered({ label: 'X-it', key: c('X') }, only((outdoors || where === 'town') && !onFoot)),
    ...offered({ label: 'Fire', key: c('F') }, fireOffer(g)),
  ];
  // Only what the buttons and the Pause menu do not already do (the ultima3 port's): B passes, Start and Escape open
  // the Pause menu, and saving, quitting, Auto combat and the party's order (New order) are there. The journal and the
  // map are here alone.
  list.push({ label: 'Journal', key: 0x100 + 2 });
  // Map: the maps' page; in the Enhanced dungeon a look at the whole level, while the first-person view is the large
  // one (with the map large already, there is nothing for it to show).
  if (!combat && !(dungeonViews(g) && g.options.dungeonView === 'full')) list.push({ label: 'Map', key: 0x100 + 3 });
  return list;
}

/** Whether the dungeon has two layouts to switch between (the Enhanced interface's): Change View's, and Map's look. */
function dungeonViews(g: Game): boolean {
  return g.inDungeon && g.options.tileSet === 'standard';
}

/**
 * The Enhanced dungeon's Map: the whole level's map, large, as Change View's layout draws it (dungeonMap.ts) - to look
 * at, not to walk by - until A or B (Enter, Escape, Space), then the first-person view large again. Not kept: the
 * layout chosen is Change View's, and is saved again after, in case the settings were saved (the Pause menu's) while
 * the level was looked at.
 */
async function peekAtLevel(g: Game): Promise<void> {
  g.options.dungeonView = 'full';
  try {
    await restoreView(g);
    for (;;) {
      const k = await key(g);
      if (k === Pad.A || k === Pad.B || k === K.Enter || k === K.Escape || k === K.Space) break;
    }
  } finally {
    g.options.dungeonView = 'mini';
    saveOptions(g.options);
    await restoreView(g);
  }
}

/**
 * The Enhanced dungeon's Change View command: the first-person view with the map round the party beside it, or the whole
 * level's map with the first-person view small beside it (dungeonMap.ts), the choice kept.
 */
function switchDungeonView(g: Game): void {
  g.options.dungeonView = g.options.dungeonView === 'full' ? 'mini' : 'full';
  saveOptions(g.options);
}

/** The command menu: the chosen command's key, or 0 (nothing chosen, or a menu of the engine's own was used). */
/** A command's name as a controller has it (commandMenu): 1988's own where it was spelt for its letter, plainly. */
export function plainName(g: Game, label: string): string {
  const aboard = g.s.partyTile >= 0x20 && g.s.partyTile < 0x2c; // a frigate or a skiff, rather than a horse or a carpet
  const plain: Record<string, string> = {
    Klimb: 'Climb',
    Ztats: 'Stats',
    Jimmy: 'Pick lock',
    'Jimmy chest': 'Pick chest lock',
    'X-it': aboard ? 'Disembark' : 'Dismount',
  };
  return plain[label] ?? label;
}

/**
 * How many letters a line of one of those lists has (playRows): the box's width less the two columns its scroll marks
 * take, and two more where the line has its letter (Classic input). Each list fits its lines to it.
 */
export function playWidth(g: Game, lettered: boolean): number {
  return TALK_WIDTH - 2 - (lettered && g.options.input === 'letters' ? 2 : 0);
}

/** Shorter words for a command too long for its list (fitCommand), where its count and brackets are not enough. */
const SHORTER: Record<string, string> = {
  'Pick chest lock': 'Unlock chest',
};

/**
 * A command's line fitted to `width` (playWidth): as it is where it fits; else its count without brackets ("Ignite
 * torch x12"), then the verb's without them ("Cast Great light"), then shorter words; and at the last the thing alone,
 * a weapon or a spell, its line's letter (or the bar's place) saying what is done with it.
 */
export function fitCommand(label: string, width: number): string {
  const steps = [
    (l: string) => l.replace(/ \(x(\d+)\)$/, ' x$1'),
    (l: string) => l.replace(/^(\S+) \((.+)\)$/, '$1 $2'),
    (l: string) => Object.entries(SHORTER).reduce((t, [a, b]) => (t.startsWith(a) ? b + t.slice(a.length) : t), l),
    (l: string) => l.replace(/^(Attack|Cast) /, ''),
  ];
  let l = label;
  for (const step of steps) {
    if (l.length <= width) return l;
    l = step(l);
  }
  return l;
}

/**
 * Where the lists of play go (the port's) - the commands, the spells, the items to use and to ready: as a talk's menu
 * does (TalkRows), framed low in the view and scrolling, the map going on round it - the party in sight above it. In
 * a fight, where the one whose turn it is stands in the field's lower half, at its top instead, so as never to hide
 * them.
 */
export function playRows(g: Game): TalkRows {
  const s = g.s;
  const turn = g.inCombat && s.combatTurn < 0x20 ? g.combat[s.combatTurn] : undefined;
  // (At the top, its frame below the map's top border, as a townsman's box is (speech.ts placement): from row 1 it lay
  // over the border, whose strip about the sky nothing draws again till the game is started anew.)
  return turn && turn.y >= 6 ? { first: 2, last: 9 } : { first: 14, last: 21 };
}

export async function commandMenu(g: Game): Promise<number> {
  // One list: what the moment calls for first, then the rest.
  const first = contextual(g);
  const items = [...first, ...everything(g).filter((it) => !first.some((f) => f.key === it.key))];
  // With a controller the letters are not shown, and 1988's names spelt for them (K for Klimb, Z for Ztats) read as
  // misspellings: the plain word. Classic input keeps both.
  if (g.options.input === 'controller') for (const it of items) it.label = plainName(g, it.label);
  // How many torches, gems and keys the party has, on the lines that spend them: "Ignite torch (x3)", "View a gem
  // (x5)", "Pick lock (x8)" (the port's). A greyed line has none, and says no count. At most "Pick chest lock (x99)",
  // the menu's width.
  const held = new Map<number, number>([
    [c('I'), g.s.torches],
    [c('V'), g.s.gems],
    [c('J'), g.s.keys],
  ]);
  for (const it of items) {
    const n = it.key === undefined ? 0 : (held.get(it.key) ?? 0);
    if (n > 0) it.label += ` (x${n})`;
  }
  // Each line fitted to the list's width, low in the view (playRows): its count, its brackets, its words shortened.
  const width = playWidth(g, true);
  for (const it of items) it.label = fitCommand(it.label, width);
  // With the bar on a spell to cast or on Mix, the party panel shows mana (magicPanel.ts), and hit points again after.
  const magic = (k: number | undefined): boolean =>
    k === c('C') || k === c('M') || k === 0x100 + 7 || (k !== undefined && k >= SHORTCUT && k < SHORTCUT + 8);
  const watch = g.choiceWatch;
  // With the bar on Switch Weapon, in the Standard look, the arms it would take up shown on the panel as their card
  // (readyCard.ts drawSwitchCard), as Ready shows each armament's - the panel held at its full height for it.
  const switchable = g.options.tileSet === 'standard' && g.inCombat && g.s.combatTurn < 0x20;
  let release: (() => void) | null = null;
  const unCard = (): void => {
    if (!release) return;
    release();
    release = null;
    drawVitals(g);
  };
  g.choiceWatch = (at, title) => {
    if (title !== 'Commands') return;
    if (switchable && items[at]?.key === c('W')) {
      release ??= holdFullPanel(g);
      drawSwitchCard(g, g.combat[g.s.combatTurn].who);
      return;
    }
    unCard();
    // And on Ztats, experience toward the next level (frame.ts standardLine).
    const mana = magic(items[at]?.key);
    const xp = items[at]?.key === c('Z');
    if (mana === g.panelMana && xp === g.panelXp) return;
    g.panelMana = mana;
    g.panelXp = xp;
    drawVitals(g);
  };
  let i: number;
  try {
    i = await choose(g, 'Commands', items, 0, false, playRows(g));
  } finally {
    g.choiceWatch = watch;
    unCard();
    if (g.panelMana || g.panelXp) {
      g.panelMana = g.panelXp = false;
      drawVitals(g);
    }
  }
  const k = i < 0 ? 0 : (items[i].key ?? 0);
  // Talk, Open or Jimmy with only one side to act on: its way given, not asked (targets.ts onlySide).
  if (g.options.input === 'controller') {
    const only = k === c('T') ? onlySide(g, 'talk') : k === c('O') ? onlySide(g, 'open') : k === c('J') ? onlySide(g, 'jimmy') : 0;
    if (only) g.bumpDir = only;
  }
  await restoreView(g);
  switch (k) {
    case 0x102:
      return journalScreen(g);
    case DUNGEON_VIEW:
      switchDungeonView(g);
      await restoreView(g);
      return 0;
    case 0x103:
      if (dungeonViews(g)) {
        await peekAtLevel(g);
        return 0;
      }
      await g.hooks.showMap?.(g.s.level === 0xff);
      await restoreView(g);
      return 0;
    case WAIT: {
      const { waitInTown } = await import('./cmds.ts');
      await waitInTown(g);
      return 0;
    }
    case STEAL:
      return c('G');
    case STEAL_CHEST:
      return c('O');
    case READ_SIGN: {
      const { readSignAhead } = await import('./dungeon.ts');
      readSignAhead(g);
      return 0;
    }
    case DRINK: {
      const s = g.s;
      g.drinkPreset = (s.dungeon[s.level * 0x40 + s.y * 8 + s.x] & 0xf0) === 0x50 ? 'here' : 'ahead';
      return c('L');
    }
    case LOOT:
      // Everything taken, the party leaves as Leave combat does; else it stays, told what is left.
      return (await lootField(g)) ? K.Escape : 0;
    case 0x107: {
      // The member's last spell again: the Cast command with the caster and the spell given, the aim still asked.
      const who = turnMember(g);
      const last = g.lastSpell.get(who);
      if (last === undefined) return 0;
      g.castPreset = { caster: who, spell: last };
      return c('C');
    }
  }
  if (k >= SHORTCUT && k < SHORTCUT + 8) {
    // A spell the menu offered, cast as the Cast command with nothing left to ask.
    const ready = shortcutCasts(g)[k - SHORTCUT];
    if (!ready) return 0;
    g.castPreset = { caster: ready.caster, spell: ready.spell, on: ready.on };
    return c('C');
  }
  return k;
}
