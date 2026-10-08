/**
 * targets.ts
 *
 * What the menus offer (the ultima3 port's rule): a command with nothing to act on where the party stands is not
 * offered at all; one with something to act on but not the means - no key, no torch, no grapple, not on foot - is
 * offered greyed. Each test here reads the same squares and conditions the command itself does (items.ts, cmds.ts,
 * town.ts, dungeon.ts, combat.ts, magic.ts), without changing anything.
 */

import { rests, restWanted } from './rest.ts';
import type { Game } from './game.ts';
import { byCompass } from './dungeonMap.ts';
import { A, T } from './tiles.ts';
import { tileAt } from './world.ts';
import { somethingBeside, thingUnderfoot } from './items.ts';
import { Status } from './save.ts';
import { K } from './io.ts';

/** Offered, offered greyed, or left out. */
export type Offer = 'show' | 'grey' | 'hide';

/** The four squares beside the party, as the commands' direction prompts reach: north, east, south, west. */
const SIDES: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const inCombat = (g: Game): boolean => g.s.mapId > 0x7f;
const inDungeon = (g: Game): boolean => g.s.mapId > 0x20 && g.s.mapId < 0x80;
const inTown = (g: Game): boolean => g.s.mapId >= 1 && g.s.mapId <= 0x20;
const outdoors = (g: Game): boolean => g.s.mapId === 0;
const onFoot = (g: Game): boolean => g.s.partyTile === A.Avatar;
const onShip = (g: Game): boolean => (g.s.partyTile & 0xf8) === 0x20;
const night = (g: Game): boolean => g.s.hour < 6 || g.s.hour > 0x12;

/** Every actor's tile on a square (a square may hold more than one), as actorTileAt reads them - without its marks. */
function actorsOn(g: Game, x: number, y: number): number[] {
  const s = g.s;
  const out: number[] = [];
  for (let i = 1; i < 32; i++) {
    const a = s.actors[i];
    if (a.tile !== 0 && a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === s.level)) out.push(a.tile);
  }
  return out;
}

/** Whether any square beside the party holds what `test` looks for: the square's tile, what stands on it, the side. */
function beside(g: Game, test: (tile: number, actors: number[], dx: number, dy: number) => boolean): boolean {
  const s = g.s;
  return SIDES.some(([dx, dy]) => test(tileAt(g, s.x + dx, s.y + dy), actorsOn(g, s.x + dx, s.y + dy), dx, dy));
}

/** A dungeon cell (`dx`, `dy` from the party). */
function cell(g: Game, dx = 0, dy = 0): number {
  const s = g.s;
  return s.dungeon[s.level * 0x40 + ((s.y + dy) & 7) * 8 + ((s.x + dx) & 7)];
}

/**
 * Get's things beside the party, by whose they are: what lies about, and a torch on the wall (borrowed), anyone's to
 * take; crops and a bite from a plate within reach, another's - taking them costs karma (items.ts getCommand).
 */
function getsBeside(g: Game): { free: boolean; owned: boolean } {
  const found = { free: false, owned: false };
  beside(g, (t, actors, dx, dy) => {
    if (actors.some((a) => (a > 1 && a < 0x10) || a === 0x19 || a === 0x1b || (a & 0xfc) === 0xb4)) found.free = true;
    if (t === T.B0 || t === T.B1) found.free = true;
    if (t === T.Crops || (t === T.Table9A && dy === 1) || (t === T.Table9B && dy === -1) || (t === T.Table9C && dx === 0))
      found.owned = true;
    return false;
  });
  return found;
}

/**
 * Get: a loose thing beside the party or where it stands, a torch on the wall; below, an opened chest. (Crops and a
 * plate: Steal.)
 */
export function getOffer(g: Game): Offer {
  if (inDungeon(g)) return (cell(g) & 0xf0) === 0x70 ? 'show' : 'hide';
  return getsBeside(g).free || thingUnderfoot(g) ? 'show' : 'hide';
}

/**
 * Steal (the port's, in the menu alone): Get, of crops or a bite from a plate within reach - the menu's word telling
 * the player, without a word more, that the thing is another's and taking it costs karma. The same command.
 */
export function stealOffer(g: Game): Offer {
  if (inDungeon(g)) return 'hide';
  return getsBeside(g).owned ? 'show' : 'hide';
}

/** A settlement (maps 1-32), where opening a chest costs karma (items.ts openChest). */
const settlement = (g: Game): boolean => g.s.mapId > 0 && g.s.mapId < 0x21;

/** A door, locked or not, or a magically locked one. */
const DOORS = [0xb8, 0xb9, 0xba, 0xbb, 0x97, 0x98];

/** Open: a door or a chest beside the party (a settlement's chest: Steal from chest); below, a closed chest where it stands. */
export function openOffer(g: Game): Offer {
  if (inDungeon(g)) return (cell(g) & 0xf0) === 0x40 ? 'show' : 'hide';
  return beside(g, (t, actors) => DOORS.includes(t) || (actors.includes(1) && !settlement(g))) ? 'show' : 'hide';
}

/**
 * Steal from chest (the port's, in the menu alone): Open, of a chest beside the party in a towne, castle, keep or
 * dwelling - someone's, and opening it costs karma (items.ts openChest). The same command.
 */
export function stealChestOffer(g: Game): Offer {
  return settlement(g) && beside(g, (_, actors) => actors.includes(1)) ? 'show' : 'hide';
}

/** Jimmy: a locked door, a chest, someone in the stocks; greyed without a key. Not a magic lock: no key turns it. */
export function jimmyOffer(g: Game): Offer {
  const s = g.s;
  const target = inDungeon(g)
    ? (cell(g) & 0xf0) === 0x40
    : beside(
        g,
        (t, actors) => t === 0xb9 || t === 0xbb || actors.includes(1) || ((t === 0x84 || t === 0x85) && (inCombat(g) || actors.length > 0)),
      );
  if (!target) return 'hide';
  return s.keys !== 0 ? 'show' : 'grey';
}

/** The furniture that moves (cmds.ts pushable). */
const PUSHABLE = [T.T5B, 0x90, 0x91, 0x92, 0x93, T.Desk, T.Barrel, T.Vanity, T.A9, T.Dresser, T.AE, T.Trunk, 0xb4, 0xb5, 0xb6, 0xb7];

/** Push: something that moves beside the party, nothing on it; in a fight's room, a square that works a secret way. */
export function pushOffer(g: Game): Offer {
  if (inDungeon(g)) return 'hide';
  const s = g.s;
  if (inCombat(g) && SIDES.some(([dx, dy]) => isTrigger(g, s.x + dx, s.y + dy))) return 'show';
  return beside(g, (t, actors) => PUSHABLE.includes(t) && actors.length === 0) ? 'show' : 'hide';
}

/** A combat room's trigger square (combat.ts trigger), read without working it. */
export function isTrigger(g: Game, x: number, y: number): boolean {
  const s = g.s;
  if ((s.combatFlags & 0x80) === 0 && (s.combatFlags & 2) === 0) return false;
  const m = g.combatMap;
  for (let k = 0; k < 8; k++) if (m[8 * 32 + 11 + k] === x && m[8 * 32 + 19 + k] === y) return true;
  return false;
}

/** Klimb: a ladder or grate underfoot, rocks or a fence beside, a mountain with the grapple, a way up or down below. */
export function klimbOffer(g: Game): Offer {
  const s = g.s;
  const here = tileAt(g, s.x, s.y);
  if (inDungeon(g)) {
    const c = cell(g);
    const kind = c & 0xf0;
    // A pit the party can see (a pit trap not yet found is only passage to look at, and not offered).
    if (kind === 0x10 || kind === 0x20 || kind === 0x30 || (kind === 0x60 && (c & 7) === 0)) return 'show';
    if (c & 8) return s.grapple !== 0 ? 'show' : 'grey';
    return 'hide';
  }
  if (outdoors(g)) {
    if (!beside(g, (t) => t === 0x0c)) return 'hide';
    return s.grapple !== 0 && onFoot(g) ? 'show' : 'grey';
  }
  if (inCombat(g)) {
    if (here === T.LadderUp || here === T.LadderDown || (here === 0x86 && (s.combatFlags & 0x80) !== 0)) return 'show';
    return beside(g, (t, actors) => t === 0x4c && actors.length === 0) ? 'show' : 'hide';
  }
  const way = here === T.LadderUp || here === T.LadderDown || here === 0x86 || beside(g, (t) => t === 0x4c || t === 0xca || t === 0xcb);
  if (!way) return 'hide';
  return onFoot(g) ? 'show' : 'grey';
}

/** Talk: someone in reach in a town (beside, or across a counter). Elsewhere nobody answers. */
export function talkOffer(g: Game): Offer {
  if (!inTown(g)) return 'hide';
  const s = g.s;
  for (const [dx, dy] of SIDES)
    for (let d = 1; d <= 2; d++) if (actorsOn(g, s.x + dx * d, s.y + dy * d).some((t) => t >= 0x40 && t !== 0xfc)) return 'show';
  return 'hide';
}

/** Attack: a creature beside the party, or in a town anyone (or a mirror); in a fight, always. */
export function attackOffer(g: Game): Offer {
  const s = g.s;
  if (inCombat(g)) return 'show';
  if (inDungeon(g)) {
    const ax = (g.data.swords(0x24d6, 4)[s.facing] + s.x) & 7;
    const ay = (g.data.swords(0x24de, 4)[s.facing] + s.y) & 7;
    return s.actors[1].x === ax && s.actors[1].y === ay ? 'show' : 'hide';
  }
  const afloat = tileAt(g, s.x, s.y) < 4 && !onFoot(g) && !onShip(g);
  if (outdoors(g)) {
    const near = [...SIDES, [-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) =>
      actorsOn(g, s.x + dx, s.y + dy).some(
        (t) => (t & 0xfc) === 0x2c || (t >= 0x80 && t !== 0xfc) || (t >= 0x40 && t !== 0xb4 && (t & 0xfc) !== 0xe8),
      ),
    );
    return near ? (afloat ? 'grey' : 'show') : 'hide';
  }
  const target = beside(g, (t, actors) => t === 0x9d || actors.some((a) => a >= 0x40 && (a < 0xe8 || a > 0xef) && (a < 0xb4 || a > 0xb7)));
  return target ? (afloat ? 'grey' : 'show') : 'hide';
}

/** Fire: the ship's broadside; in a town, a cannon beside the party. */
export function fireOffer(g: Game): Offer {
  if (outdoors(g)) return onShip(g) ? 'show' : 'hide';
  if (inTown(g)) return beside(g, (t) => t >= 0xb4 && t <= 0xb7) ? 'show' : 'hide';
  return 'hide';
}

/** Hole up: in a town, in a bed; outdoors or below, camping on foot or mending the ship (its sails furled). */
export function holeUpOffer(g: Game): Offer {
  const s = g.s;
  if (inCombat(g)) return 'hide';
  if (inTown(g)) return tileAt(g, s.x, s.y) === T.Bed ? 'show' : 'hide';
  if (onShip(g)) return s.partyTile >= 0x24 ? 'show' : 'grey';
  return onFoot(g) ? 'show' : 'grey';
}

/**
 * Hole up, named by what it does where the party is (the port's): Sleep in a bed in a towne, Repair hull on a ship,
 * and elsewhere Camp - "Camp (on foot)" where it is greyed for a horse or a carpet under the party.
 */
export function holeUpLabel(g: Game): string {
  if (inTown(g)) return 'Sleep';
  if (onShip(g)) return 'Repair hull';
  return onFoot(g) || inDungeon(g) ? 'Camp' : 'Camp (on foot)';
}

/**
 * Camp at the head of the menu: where the party may camp, a camp of the hours the spinner starts at (nine) would be a
 * rest, and someone it would heal is short of hit points or mana.
 */
export function campWanted(g: Game): boolean {
  if (inTown(g) || onShip(g) || holeUpOffer(g) !== 'show') return false;
  return rests(g, 9) && restWanted(g);
}

/** New order: two members besides the Avatar, who must lead. */
export function newOrderOffer(g: Game): Offer {
  return !inCombat(g) && g.s.partySize >= 3 ? 'show' : 'hide';
}

/** The sign `n` (a wall's low nibble) of this dungeon: its place in the signs' tables, or -1 if it has none. */
export function signIndex(g: Game, n: number): number {
  const d = g.s.mapId - 0x21;
  if (n === 0 || n > g.data.bytes(0x2df0, 8)[d]) return -1;
  return g.data.bytes(0x2de8, 8)[d] + n - 1;
}

/** The sign on the wall ahead, if there is one and the party can see it: its place in the signs' tables, else -1. */
export function signAhead(g: Game): number {
  const s = g.s;
  if (!inDungeon(g) || (s.d58a6 === 0 && s.d58a7 === 0)) return -1;
  const [dx, dy] = SIDES[s.facing & 3];
  const c = cell(g, dx, dy);
  return (c & 0xf0) === 0xb0 ? signIndex(g, c & 0xf) : -1;
}

/** Search: only where there is something to find (the player's choice, September 2026): greyed below without light. */
export function searchOffer(g: Game): Offer {
  const s = g.s;
  if (inDungeon(g)) {
    // The cells Search can be pointed at - here, ahead and to either hand, and behind where it asks by the compass -
    // with something to find: a chest's trap, a pit trap or a bomb, a hidden door, a skeleton to crumble.
    const f = s.facing & 3;
    const ways = byCompass(g) ? [0, 1, 2, 3] : [f, (f + 1) & 3, (f + 3) & 3];
    const found = [[0, 0] as [number, number], ...ways.map((w) => SIDES[w])].some(([dx, dy]) => {
      const c = cell(g, dx, dy);
      const kind = c & 0xf0;
      const skeleton = kind === 0xc0 && (s.dungeonLook & 0xf) !== 1 && (s.dungeonLook & 0xf) !== 2;
      return kind === 0x40 || (c & 0xf7) === 0x61 || (c & 0xf7) === 0x62 || kind === 0xd0 || skeleton;
    });
    if (!found) return 'hide';
    return s.d58a7 !== 0 || s.d58a6 !== 0 ? 'show' : 'grey';
  }
  // In a fight's room, a wall with a nick too (a trigger raises one: Wrong's trap), where there is no Look to find it.
  const thing = beside(g, (t, actors) => actors.includes(1) || actors.includes(0x1f) || (inCombat(g) && t === T.HiddenDoor));
  return thing || (!inCombat(g) && somethingBeside(g)) ? 'show' : 'hide';
}

/** Yell: the sails aboard ship; a word of power at a dungeon's mouth or a ruined shrine; a Shadowlord's name at his flame. */
export function yellOffer(g: Game): Offer {
  const s = g.s;
  if (inCombat(g)) return 'hide';
  if (onShip(g)) return 'show';
  if (outdoors(g)) {
    const mouths = g.data.bytes(0x4512, 8);
    return beside(g, (t) => mouths.includes(t) || t === T.DF || t === T.Ruins) ? 'show' : 'hide';
  }
  if (s.mapId >= 0x1e && s.mapId <= 0x20 && s.y >= 2) {
    const standing = [0, 1, 2].some((i) => s.shadowlords[i] !== 0xff);
    const here = s.actors.some((a) => a.tile === 0xfc);
    return standing && !here ? 'show' : 'hide';
  }
  return 'hide';
}

// --- Items -------------------------------------------------------------------------------------------------

/**
 * Whether an item (the Use list's number: scrolls 0-7, potions 8-15, then the rest) would do anything used here and
 * now - greyed in the list where not, so a scroll or a skull key is not spent for nothing (magic.ts useCommand).
 */
export function usableHere(g: Game, item: number): boolean {
  return whyNotHere(g, item) === null;
}

/**
 * Why an item would do nothing used here and now, in a few words for the Use list's card (useCard.ts), or null where
 * it would do something: the tests usableHere greys the list by.
 */
export function whyNotHere(g: Game, item: number): string | null {
  const s = g.s;
  const members = Array.from({ length: s.partySize }, (_, i) => s.members[i]);
  // Whom a potion is for: in a fight, the one whose turn it is; else anyone.
  const drinkers = inCombat(g) ? members.filter((_, i) => i === g.combat[s.combatTurn]?.who) : members;
  const any = (test: (m: (typeof members)[number]) => boolean): boolean => drinkers.some(test);
  const fight = inCombat(g);
  const sky = s.mapId < 0x21; // Britannia, the Underworld or a settlement: not a dungeon, nor a fight
  const unless = (ok: boolean, why: string): string | null => (ok ? null : why);
  if (item < 8) {
    switch (item) {
      case 1: // wind change
        return unless(sky, 'Not underground, nor in a fight');
      case 4: // view
        return unless(!fight, 'Not in a fight');
      case 5: // summon daemon
        return unless(fight, 'Only in a fight');
      case 6: // resurrection
        if (fight) return 'Not in a fight';
        return unless(
          members.some((m) => m.status === Status.Dead),
          'No one is dead',
        );
      case 7: // negate time
        return unless(s.mapId !== 0x1d && s.mapId !== 0x28, 'Not here');
      default:
        return null;
    }
  }
  if (item < 0x10) {
    switch (item - 8) {
      case 0: // blue: awaken - no one asleep takes a turn to drink it
        if (fight) return 'Not in a fight';
        return unless(
          members.some((m) => m.status === Status.Sleeping),
          'No one is asleep',
        );
      case 1: // yellow: heal
        return unless(
          any((m) => m.status !== Status.Dead && m.hp < m.maxHp),
          'No one is hurt',
        );
      case 2: // red: cure
        return unless(
          any((m) => m.status === Status.Poisoned),
          'No one is poisoned',
        );
      case 3: // green: poison
      case 4: // orange: sleep
        return unless(
          any((m) => m.status === Status.Good),
          'No one well to drink it',
        );
      case 5: // purple: a rat
      case 6: // black: invisible
        return unless(fight, 'Only in a fight');
      default: // white: see all
        return unless(sky, 'Not underground, nor in a fight');
    }
  }
  if (item > 0x14 && item < 0x1d) {
    if (!sky) return 'Not here';
    const t = tileAt(g, s.x, s.y);
    return unless(t === T.CropsPicked || t === T.Crops || (t > 3 && t < 0xb), 'Only on open ground');
  }
  switch (item) {
    case 0x10: // carpet
      if (!sky) return 'Not here';
      if (tileAt(g, s.x, s.y) === 0xc) return 'Not on a mountain';
      return unless(onFoot(g), 'Only on foot');
    case 0x11: // skull key: a magic lock beside the party
      return unless((sky || fight) && beside(g, (t) => t === 0x97 || t === 0x98), 'No magic lock beside');
    case 0x14: // sceptre: strange walls round the party, or a field
      if (inDungeon(g))
        return unless(
          (cell(g) & 0xf0) === 0x80 || (cell(g, g.data.swords(0x24d6, 4)[s.facing], g.data.swords(0x24de, 4)[s.facing]) & 0xf0) === 0x80,
          'Nothing here to dispel',
        );
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((tileAt(g, s.x + dx, s.y + dy) & 0xf0) === T.T70) return null;
      return unless(fight && s.actors.some((a) => (a.tile & 0xfc) === 0xe8), 'Nothing here to dispel');
    case 0x1d:
    case 0x1e:
    case 0x1f: {
      const n = item - 0x1d;
      return unless(
        g.data.bytes(0x4882, 3)[n] === s.x &&
          g.data.bytes(0x4886, 3)[n] === s.y &&
          g.data.bytes(0x488a, 3)[n] === s.mapId &&
          g.data.bytes(0x488e, 3)[n] === s.level,
        'Only at its flame',
      );
    }
    case 0x20: // spyglass
      if (!(sky && s.level < 0x80)) return 'Only under the sky';
      return unless(night(g), 'Only at night');
    case 0x21: // the HMS Cape's plans
      return unless(onShip(g), 'Only aboard ship');
    case 0x22: // sextant
      if (!(outdoors(g) && s.level < 0x80)) return 'Only outdoors';
      return unless(night(g), 'Only at night');
    case 0x25: // the sandalwood box: nothing to do with it
      return 'Nothing to do with it';
    default: // the amulet, the crown, the watch, the badge
      return null;
  }
}

/**
 * The one way a command from the menu could go, where only one side of the party has what it acts on (the port's,
 * a controller's): Talk with one person in reach, Open with one door or chest beside, Jimmy with one lock - its
 * "Which way?" answered so (input.ts selectDirection, by Game.bumpDir), a press saved. 0 where it is none, or more
 * than one, or the command acts where the party stands (a dungeon's chest): the way is asked, as ever.
 */
export function onlySide(g: Game, command: 'talk' | 'open' | 'jimmy'): number {
  const s = g.s;
  if (inDungeon(g) || inCombat(g)) return 0;
  const keys = [K.Up, K.Right, K.Down, K.Left];
  const ways = SIDES.flatMap(([dx, dy], i) => {
    const at = (d: number): [number, number[]] => [tileAt(g, s.x + dx * d, s.y + dy * d), actorsOn(g, s.x + dx * d, s.y + dy * d)];
    const [t, actors] = at(1);
    const fits =
      command === 'talk'
        ? inTown(g) && [1, 2].some((d) => at(d)[1].some((a) => a >= 0x40 && a !== 0xfc))
        : command === 'open'
          ? DOORS.includes(t) || actors.includes(1)
          : t === 0xb9 || t === 0xbb || actors.includes(1) || ((t === 0x84 || t === 0x85) && actors.length > 0);
    return fits ? [keys[i]] : [];
  });
  return ways.length === 1 ? ways[0] : 0;
}
