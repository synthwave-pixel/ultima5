/**
 * bumpAct.ts
 *
 * Bump to act (the port's, from the ultima3 port), for what is not a
 * person, a creature or a door: walking into a thing does what a player
 * would do with it, and "Blocked!" is left for walls, water and the like.
 *
 *   dropped things (gold, potions, arms, keys...)       Get
 *   a chest                                             Search, then by what it
 *                                                       found: Open; or, a trap,
 *                                                       An Sanct, else Jimmy, then
 *                                                       Open (Look in a settlement,
 *                                                       where opening costs karma)
 *   a corpse                                            Search
 *   a wall with a nick                                  Look, then Search (a
 *                                                       hidden door: then a
 *                                                       locked door's bump)
 *   strange walls, in a fight, with the Sceptre         the Sceptre (combat.ts)
 *   a barrel, footlocker, chest of drawers, vanity      Search, then Push
 *   a bookshelf, window shelf, stump, fruit tree,
 *   brazier (where things are hidden)                   Search
 *   a potted plant, desk, pitcher, end table, cannon    Push (never Fire)
 *   a wall torch                                        Get (borrowed)
 *   an odd door, a portcullis, a locked door            Open (it says why not)
 *   a door in a fight's room                            Open; locked, Jimmy (with a key)
 *   a wall with a nick, in a fight's room               Search
 *   the second square of a shop's sign                  Look, as the sign
 *   rocks, a fence                                      Klimb
 *   a trigger square in a fight's room                  Push (a secret way)
 *   a table with food                                   Look (eating costs karma)
 *   a well, fountain, clock, sign, mirror, and the
 *   rest of the furniture                               Look
 *
 * "Then" is the next bump at the same thing, by anyone in the party and
 * from any side: the first, remembered here for the party, does the first
 * command. A chest keeps what its search said (right or wrong: Search reads
 * by intelligence). Read as trapped, it is unlocked with An Sanct where
 * someone can cast it (no roll, no key), else jimmied (a key, and the
 * dexterity to disarm it); a key that breaks sends the chest back to be
 * searched again, since jimmying one that was never trapped always breaks
 * the key. With neither, it is opened as it stands. While foes are about (a
 * foe standing in a fight, a monster in view elsewhere), nothing that lies
 * about is taken, searched, opened or pushed at a bump (foesAbout).
 *
 * Who searches, out of a fight (in one it is whoever's turn it is): a chest
 * by the cleverest (Search reads traps by intelligence, and a poor roll
 * reads them wrongly); a corpse by the hardiest, since its only harm is
 * plague - one already poisoned, if there is one, who has nothing to lose
 * by it; anything else by the active member, or the first able. A
 * locked door or trapped chest is jimmied by the most dexterous; a chest
 * is opened by the hardiest (or one already poisoned), since a reading of
 * no trap may be wrong. The
 * menu's commands ask, for another choice.
 */

import { CF, type Game, thingKey } from './game.ts';
import { AN_SANCT, unlockCaster } from './magic.ts';
import { Status } from './save.ts';
import { isTrigger } from './targets.ts';
import { T } from './tiles.ts';
import { tileAt } from './world.ts';

const C = 0x43; // Cast
const G = 0x47; // Get
const J = 0x4a; // Jimmy
const K_ = 0x4b; // Klimb
const L = 0x4c; // Look
const O = 0x4f; // Open
const P = 0x50; // Push
const S = 0x53; // Search

/** Where the bump is: a command there is only offered where the game has it. */
export type BumpPlace = 'town' | 'outdoors' | 'combat';

const CHEST = 0x01;
const CORPSE = 0x1f;
/** Things lying about to be taken: gold to the amulet (the chest is 1), a moonstone. */
const TAKEN = (a: number): boolean => (a >= 0x02 && a <= 0x0f) || a === 0x19;

/** Where things are hidden, and which can be pushed as well. */
const SEARCH_PUSH = new Set<number>([T.Barrel, T.Trunk, T.Dresser, T.Vanity]);
const SEARCH = new Set<number>([0x2b, 0x2e, 0x5a, 0x5c, 0x5d, T.Brazier]); // stump, fruit tree, window shelf, bookshelves, brazier
/** What is pushed and hides nothing: a potted plant, a desk, a pitcher, an end table, the cannons. */
const PUSH = new Set<number>([0x5b, T.Desk, 0xa9, 0xae, 0xb4, 0xb5, 0xb6, 0xb7]);
/** Doors a bump cannot open, where Open says why: odd doors, a portcullis, locked doors (without keys). */
const OPEN_SAYS = new Set<number>([0x97, 0x98, 0x99, T.DoorB9, T.DoorBB]);
const KLIMB = new Set([0x4c, 0xca, 0xcb]); // rocks, fences
/**
 * Furniture and the like, looked at: the crystal sphere, a bright light, a gargoyle, the Codex, a mast, a rail,
 * an anvil, the telescope, the Guardians, the strange walls, pendulums, stocks and manacles, cannonballs, signs, a
 * rack, the harpsichord, a guillotine, tables (and tables with food), mirrors, a well, a hitching post, logs, a wine
 * cask, a spit, a street lamp, a candelabrum, a stove, fountains, the Flame, the collapsed entrance, a flagpole,
 * hourglasses, the standards, the shop signs, clocks, bellows.
 */
const LOOK = new Set([
  0x29, 0x2a, 0x38, 0x41, 0x42, 0x43, 0x58, 0x59, 0x5e, 0x5f, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7c,
  0x7d, 0x7e, 0x7f, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x88, 0x89, 0x8a, 0x8b, 0x8d, 0x8e, 0x94, 0x95, 0x96, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e,
  0x9f, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa7, 0xb3, 0xbd, 0xbe, 0xbf, 0xd8, 0xd9, 0xda, 0xdb, 0xde, 0xdf, 0xe3, 0xe8, 0xe9, 0xea, 0xeb, 0xec,
  0xed, 0xee, 0xef, 0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xfa, 0xfb, 0xfc, 0xfd,
]);

/**
 * Whether foes are about (the port's): in a fight, any still standing on the field; elsewhere, a monster in the
 * party's view. While they are, what lies about is not searched, opened, taken or pushed at a bump - the party has
 * other business, and a bump in a fight is a step or a blow - though a door is still opened, rocks climbed, a thing
 * looked at, and the Sceptre wielded.
 */
export function foesAbout(g: Game, where: BumpPlace): boolean {
  const s = g.s;
  if (where === 'combat') {
    for (let i = 0; i < 0x20; i++) {
      const f = g.combat[i].flags;
      if (f !== 0 && (f & (CF.Dead | CF.Player | CF.Charmed)) === 0) return true;
    }
    return false;
  }
  for (let i = 1; i < 32; i++) {
    const a = s.actors[i];
    const t = a.tile;
    if (!t || a.z !== s.level || Math.abs(a.x - s.x) > 5 || Math.abs(a.y - s.y) > 5) continue;
    if ((t >= 0x80 && t !== 0xfc) || (t & 0xfc) === 0x2c) return true;
  }
  return false;
}

/** Whether a corpse is walked into, not over (it is searched): towns, the outdoors and combat alike. */
export const corpseBlocks = (actor: number): boolean => actor === CORPSE;

/** Loot lying on a field: a chest a slain foe left, and what lay in one - gold, potions, scrolls, arms, food (0x01-0x0f). */
export const isLoot = (actor: number): boolean => actor >= CHEST && actor <= 0x0f;

/**
 * The command walking into (x, y) does: `actor` the actor's tile there (0 none) and `tile` the map's; 0 for none
 * ("Blocked!"). Two-step things remember the first bump on `g`, for the party.
 */
export function bumpCommand(g: Game, where: BumpPlace, actor: number, tile: number, x: number, y: number): number {
  // The thing is known by where it stands: its first step done by one member, the next bump by any does the second.
  const key = thingKey(g, x, y);
  const twoStep = (first: number, second: number): number => {
    if (g.bumped.delete(key)) return second;
    g.bumped.set(key, 'done');
    return first;
  };
  // What lies about, left alone while foes are about (foesAbout).
  const busy = (): boolean => foesAbout(g, where);
  if (actor !== 0) {
    if (actor === CHEST) {
      if (settlement(g)) return L;
      if (busy()) return 0;
      return chestStep(g, where, key);
    }
    if (TAKEN(actor)) return busy() ? 0 : G;
    if (actor === CORPSE) {
      if (busy()) return 0;
      doneBy(g, where, hardiest(g));
      return S;
    }
    if (actor >= 0xe8 && actor <= 0xef) return L; // a field
    return 0;
  }
  // The second square of a two-square sign (0xe0-0xe2 say where its first is, as Look follows them): as the sign.
  for (let k = 0; k < 4 && tile >= T.E0 && tile <= T.E2; k++) {
    if (tile === T.E0) y--;
    else if (tile === T.E1) x++;
    else x--;
    tile = tileAt(g, x, y);
  }
  if ((SEARCH_PUSH.has(tile) || SEARCH.has(tile) || tile === T.HiddenDoor || PUSH.has(tile) || tile === 0xb0 || tile === 0xb1) && busy())
    return 0;
  if (SEARCH_PUSH.has(tile)) return searching(g, twoStep(S, P));
  if (SEARCH.has(tile)) return searching(g, S);
  if (tile === T.HiddenDoor && where !== 'combat') return searching(g, twoStep(L, S));
  // In a fight's room, a wall with a nick - one a trigger raised behind the party, Wrong's trap - is searched (by
  // whoever's turn it is): there is no Look in a fight, and the hidden door is the way on.
  if (tile === T.HiddenDoor) return S;
  if (PUSH.has(tile)) return P;
  if (tile === 0xb0 || tile === 0xb1) return where === 'combat' ? 0 : G; // a wall torch, borrowed
  // A locked door in a fight's room, with a key to pick it: jimmied, as a towne's is (town.ts bump); without, Open
  // says why not.
  if (where === 'combat' && (tile === T.DoorB9 || tile === T.DoorBB) && g.s.keys > 0) return J;
  if (OPEN_SAYS.has(tile)) return O;
  // A door in a fight's room (a towne's are opened before this, town.ts bump): opened, as Open would - no "Blocked!".
  if (where === 'combat' && (tile === T.DoorB8 || tile === T.DoorBA)) return O;
  // In a fight only the rocks a gargoyle leaves are climbed (combat.ts klimb), and each member is on foot, whatever
  // the party rode in on. A room's trigger square - a wall that opens a secret way - is pushed (cmds.ts pushCommand),
  // as 1988's player would Push it, rather than met with "Blocked!".
  if (where === 'combat') return tile === 0x4c ? K_ : isTrigger(g, x, y) ? P : 0;
  if (KLIMB.has(tile) && where !== 'outdoors') return mounted(g) || onLadder(g) ? 0 : K_;
  if (LOOK.has(tile)) return L;
  return 0;
}

/**
 * A chest's next step, by what its search found (Game.bumped; items.ts searchChest keeps it): unsearched, Search,
 * by the cleverest; read as trapped, An Sanct, else Jimmy; then Open, by one a trap harms least.
 */
function chestStep(g: Game, where: BumpPlace, key: string): number {
  const read = g.bumped.get(key);
  if (read === undefined) {
    g.bumped.set(key, 'searched');
    doneBy(
      g,
      where,
      best(g, (m) => g.s.members[m].int),
    );
    return S;
  }
  if (read === 'trap') {
    const caster = unlockCaster(g);
    if (caster >= 0) {
      g.castPreset = { caster, spell: AN_SANCT };
      return C;
    }
    if (g.s.keys > 0) {
      doneBy(
        g,
        where,
        best(g, (m) => g.s.members[m].dex),
      );
      return J;
    }
  }
  // Opened by the hardiest either way: a reading of no trap may be wrong.
  doneBy(g, where, hardiest(g));
  g.bumped.delete(key);
  return O;
}

/** The bumped command's member, where one is chosen (in a fight it is always whoever's turn it is). */
function doneBy(g: Game, where: BumpPlace, who: number): void {
  if (where !== 'combat') g.bumpWho = who;
}

/** Who suffers a trap or plague least: the most hit points - of those already poisoned, if any, who lose nothing by it. */
function hardiest(g: Game): number {
  const sick = able(g).filter((m) => g.s.members[m].status === Status.Poisoned);
  return best(g, (m) => g.s.members[m].hp, sick.length ? sick : undefined);
}

/** The members able to act (not asleep, not dead). */
function able(g: Game): number[] {
  const out: number[] = [];
  for (let m = 0; m < g.s.partySize; m++) {
    const st = g.s.members[m].status;
    if (st === Status.Good || st === Status.Poisoned) out.push(m);
  }
  return out;
}

/** The able member (of `among`, if given) with the most of `score`; -1 for none. */
function best(g: Game, score: (m: number) => number, among: number[] = able(g)): number {
  let who = -1;
  for (const m of among) if (who < 0 || score(m) > score(who)) who = m;
  return who;
}

/** A Search where it matters not who does it: the active member, or the first able, rather than asking. */
function searching(g: Game, command: number): number {
  if (command === S) g.bumpWho = g.s.activeMember !== 0xff ? g.s.activeMember : (able(g)[0] ?? -1);
  return command;
}

/** A bumped Jimmy (a locked door, town.ts) is made by the most dexterous: the lock is picked by dexterity. */
export function jimmyWho(g: Game): void {
  g.bumpWho = best(g, (m) => g.s.members[m].dex);
}

/** A settlement (maps 1-32), where opening a chest costs karma. */
const settlement = (g: Game): boolean => g.s.mapId > 0 && g.s.mapId < 0x21;
const mounted = (g: Game): boolean => (g.s.partyTile & 0xfe) === 0x10;
/** Standing on a ladder or grate, Klimb takes it rather than the direction asked. */
function onLadder(g: Game): boolean {
  if (g.s.mapId > 0x7f) return false;
  const under = tileAt(g, g.s.x, g.s.y);
  return under === T.LadderUp || under === T.LadderDown || under === 0x86;
}
