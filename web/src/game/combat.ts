/**
 * combat.ts
 *
 * Combat (u5d combat.c, comsubs.c, the combat parts of sjog.c and
 * 6000.c): the arena from BRIT.CBT by the terrain, the combatants by
 * turns of their dexterity, the player's commands, the monsters' minds
 * (charm, vanish, summon, teleport, flee), attacks, missiles and their
 * flight, damage, corpses and chests, and camping with its ambushes and
 * the old man's visit.
 *
 * Combatant flags are CF in game.ts. D_58a2 (s.d58a2) carries the last
 * blow's outcome: 1 killed, 2 vanished, 4 slept, 8 poisoned, 0x10 fled,
 * 0x20 grazed.
 */

import { canEnter, freeActor, setActor } from './actors.ts';
import { reveal, sleepTicks } from './effects.ts';
import { borderTitle, clearBorderTitle, commandPrompt, drawVitals, invertMember, markTurn, turnColour, updateFrame } from './frame.ts';
import { liftDungeonMap } from './dungeonMap.ts';
import { CF, Game } from './game.ts';
import { bumpCommand, corpseBlocks, foesAbout, isLoot } from './bumpAct.ts';
import { bumpInto, getChar, getCharYN, getCommandKey, getHours, queueKeys, selectDirection, upOrDown } from './input.ts';
import { restOutcome, restTimer } from './rest.ts';
import { K, Pad } from './io.ts';
import { earnedLevel, Status } from './save.ts';
import { gameDay, passTime } from './time.ts';
import {
  armourBonus,
  balancedXp,
  eased,
  keepsLastThrow,
  ORIGINAL_SPLITS,
  poisonKills,
  SPAWN_ALLOWANCE,
  SUMMON_CHANCE,
} from './settings.ts';
import { A, T } from './tiles.ts';
import { groundAt, tileAt, setTileAt, buildLightMap } from './world.ts';
import { unequip, CLASSES, readyCommand, THROWN_KEPT } from './zstats.ts';
import { getCommand, jimmyCommand, openCommand, searchCommand } from './items.ts';
import { pushCommand, yellCommand } from './cmds.ts';
import { Colour } from '../ui/colours.ts';
import { castCommand, useCommand, wieldSceptre } from './magic.ts';
import { followMap, musicForMap, playTune, Tune } from './music.ts';
import { PgDn, PgUp, Home, End } from './zstats.ts';
import { cue, deathCue } from './cues.ts';
import { devMode } from '../devMode.ts';

/** Enemy flags (u5d macros.h ENEMY_FLAG_*). */
export const EF = {
  Magic: 0x8000,
  F4000: 0x4000,
  Teleport: 0x2000,
  Vanish: 0x1000,
  Disappear: 0x800,
  Summon: 0x400,
  Poison200: 0x200,
  F100: 0x100,
  Str: 0x80,
  Charm: 0x40,
  Undead: 0x20,
  Divide: 0x10,
  NoDamage: 8,
  Poison4: 4,
  Steal: 2,
  NoCorpse: 1,
} as const;

/** The creatures whose blow rolls half their attack to all of it with the eased rules, the rest 1 to it (damageRoll). */
export const HEAVY_HITTERS = new Set([0x1e, 0x26, 0x27]); // gargoyle, daemons, dragons

/** The monster table (D_13bc, 8 bytes each: str, dex, int, def, atk, max hp, how many, treasure). */
export function enemy(
  g: Game,
  kind: number,
): { str: number; dex: number; int: number; def: number; atk: number; maxHp: number; count: number; treasure: number } {
  const b = g.data.bytes(0x13bc + kind * 8, 8);
  // The mimic's armour, 3 in the DOS game's table, is 8 in the Apple II's: the Classic rules have it so.
  const def = kind === 0x1a && g.options.rules === 'classic' ? 8 : b[3];
  return { str: b[0], dex: b[1], int: b[2], def, atk: b[4], maxHp: b[5], count: b[6], treasure: b[7] };
}
export const enemyFlags = (g: Game, kind: number): number => g.data.words(0x153c + kind * 2, 1)[0];
const creatureName = (g: Game, kind: number): string => g.data.table(0x1856, 0x30)[kind] ?? '';

// --- Who's who -----------------------------------------------------------------------------

/** ULTIMA_5646: is combatant `i` on the monsters' side now (a charmed player is, a charmed monster is not). */
export function onMonsterSide(g: Game, i: number): boolean {
  const c = g.combat[i];
  if (c.flags & CF.Dead) return false;
  if (c.flags & CF.Player) {
    if (c.who !== 0 && g.s.members[c.who].name[4] === 'j') return true;
    return (c.flags & CF.Charmed) !== 0;
  }
  return (c.flags & CF.Charmed) === 0;
}

/** COMSUBS_0094. */
export function sayName(g: Game, i: number): void {
  const c = g.combat[i];
  g.print(c.flags & CF.Player ? g.s.members[c.who].name : creatureName(g, c.who));
}

/** ULTIMA_6d82. */
export const inArena = (x: number, y: number): boolean => x > -1 && x < 11 && y > -1 && y < 11;

/** COMSUBS_0458, COMSUBS_048a: the rounded distance (integer square root of the squared distance). */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  let d = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
  let step = 1;
  let n = 0;
  while (d >= step) {
    d -= step;
    step += 2;
    n++;
  }
  return n;
}
const between = (g: Game, a: number, b: number): number => distance(g.combat[a].x, g.combat[a].y, g.combat[b].x, g.combat[b].y);

/** COMBAT_0000: can an actor of this tile stand at (x, y) in the arena (off the arena always can: that is an exit). */
export function arenaFree(g: Game, tile: number, x: number, y: number): boolean {
  if (x > 0xa || y > 0xa || x < 0 || y < 0) return true;
  const t = tileAt(g, x, y);
  if (!canEnter(g, tile, t) || t === 0xff) return false;
  const s = g.s;
  for (let i = 0; i < 0x20; i++) {
    const a = s.actors[i];
    if (a.x === x && a.y === y) {
      const k = a.tile;
      if (k === 0xeb) return false;
      if ((k & 0xfc) === 0xe8 || k === 0x1e || k === 0x1f) continue;
      // Loot (bumpAct.ts isLoot) is stepped over as a body is, by either side, with the eased rules (the port's): 1988
      // has a chest, and what it spills, in the way until someone deals with it.
      if (isLoot(k) && eased(g.options)) continue;
      if (k !== 0 && a.anim !== 0) return false;
    } else if (g.combat[i].x === x && g.combat[i].y === y) {
      const f = g.combat[i].flags;
      if ((f & (CF.Dead | CF.F4)) === 0 && f === 0) return false;
      if (s.actors[i].anim !== 0 && f === 8) return false;
    }
  }
  return true;
}

/** ULTIMA_3564: the burst on a combatant (a member's line flashes too). */
export async function hitFlash(g: Game, i: number, magic = false): Promise<void> {
  const c = g.combat[i];
  const a = g.s.actors[c.actor];
  // The Standard look's hit, the ultima3 port's: a burst over the one hit that grows over three frames - red for a
  // blow or a missile, blue for magic - and the sound unwaited.
  if (g.options.tileSet === 'standard' && g.draw.burst) {
    if (c.flags & CF.Player) invertMember(g, c.who);
    if (!g.soundOff) void (c.flags & CF.Player ? g.sound.noise(0x28, 3000, 500) : g.sound.noise(10, 3000, 2000));
    for (let frame = 1; frame <= 3; frame++) {
      g.draw.burst(a.x, a.y, frame, magic);
      await g.p.sleep(HIT_FRAME_MS);
    }
    g.draw.burst(a.x, a.y, 0, magic);
    if (c.flags & CF.Player) invertMember(g, c.who);
    updateFrame(g);
    return;
  }
  g.draw.tile(0, a.x, a.y, groundAt(g, a.x, a.y));
  if (c.flags & CF.Player) {
    invertMember(g, c.who);
    if (!g.soundOff) await g.sound.noise(0x28, 3000, 500);
    else await g.p.sleep(80);
    invertMember(g, c.who);
  } else if (!g.soundOff) {
    await g.sound.noise(10, 3000, 2000);
  } else {
    await g.p.sleep(80);
  }
  updateFrame(g);
}

// --- Placing combatants -----------------------------------------------------------------

/** ULTIMA_6506: a new combatant: a monster of kind `what` (0), party member `what` (1), or a plain actor of tile `what` (2). */
export function placeCombatant(g: Game, what: number, kind: 0 | 1 | 2, x: number, y: number, z: number): number {
  const s = g.s;
  let slot = -1;
  let c = null as null | (typeof g.combat)[number];
  if (kind !== 2) {
    for (let i = kind === 0 ? 6 : 0; i < 0x20; i++) {
      if (g.combat[i].flags !== 0) continue;
      c = g.combat[i];
      slot = i;
      g.splitLimit.delete(i);
      g.splits.delete(i);
      g.summoned.delete(i);
      g.charmedBy.delete(i); // a charm on the slot's last occupant, fallen, is not this one's
      if (kind === 1 && s.members[what].status !== Status.Dead) {
        c.dex = s.members[what].dex;
        c.timer = 36 - c.dex;
        c.flags = CF.Player;
        if (s.members[what].status !== Status.Good && s.members[what].status !== Status.Poisoned) c.flags |= CF.Asleep;
      }
      if (kind === 0) {
        const e = enemy(g, what);
        c.hp = e.maxHp;
        c.dex = (g.rng.upTo(7) - 4 + e.dex) & 0xff;
        if (c.dex > 0x1e) c.dex = e.dex;
        c.timer = 36 - c.dex;
        c.flags = CF.Monster;
        if (what === 8 || what === 9) c.flags = CF.Dead;
      }
      c.who = what;
      c.x = x;
      c.y = y;
      break;
    }
  }
  if (slot > -1 || kind === 2) {
    let a = 0;
    for (; a < 0x20; a++) {
      const actor = s.actors[a];
      if (actor.tile !== 0) continue;
      if (kind === 0 && c) {
        c.actor = a;
        actor.anim = actor.tile = (what * 4 + 0x40) & 0xff;
      }
      if (kind === 1 && c) c.actor = a;
      if (kind === 2) {
        actor.anim = actor.tile = what;
        slot = a;
      }
      actor.x = x;
      actor.y = y;
      actor.z = z;
      actor.b7 = 0xff;
      actor.b5 = kind === 0 && c ? c.hp : what;
      if (kind !== 2 && c) c.actor = a;
      break;
    }
    // No actor free (corpses, chests, loot and fields hold them): the fighter is not placed after all - and its slot,
    // taken above, is given back (the port's). 1988 left it a live monster with the actor of the slot's last occupant,
    // a phantom that fought, borrowing another's figure - a member's, even - until it was struck down.
    if (kind !== 2 && a === 0x20 && slot > -1) {
      if (c) c.flags = 0;
      slot = -1;
    }
  } else {
    slot = -1;
  }
  if (slot >= 0) {
    for (const cc of g.combat) if (s.actors[cc.actor].b7 === slot) s.actors[cc.actor].b7 = 0xff;
  }
  return slot;
}

/** ULTIMA_6794: a ring's effect at a player's turn: invisibility, regeneration. */
function ringTurn(g: Game, i: number): void {
  const c = g.combat[i];
  if ((c.flags & CF.Player) === 0 || (c.flags & (CF.Dead | CF.Asleep)) !== 0) return;
  const ring = g.s.members[c.who].equips[4];
  if (ring === 0x2a) {
    g.s.actors[c.actor].anim = 0x1d;
    c.flags |= CF.Invisible;
  } else if (ring === 0x2c) {
    // The original passes a member where the whole party is meant: the ring heals everyone a little, now and then.
    for (let m = 0; m < g.s.partySize; m++) {
      const p = g.s.members[m];
      if (p.status !== Status.Dead && p.equips[4] === 0x2c && g.random(0, 7) === 7) {
        p.hp = Math.min(p.hp + 1, p.maxHp);
        g.vitalsDirty = 1;
      }
    }
  }
}

/** ULTIMA_6800: wake a sleeper. */
export function wake(g: Game, i: number): void {
  const c = g.combat[i];
  const s = g.s;
  if (c.flags & CF.Asleep) {
    if (c.flags & CF.Player) {
      s.members[c.who].status = Status.Good;
      s.actors[c.actor].anim = c.flags & CF.Invisible ? 0x1d : s.actors[c.actor].tile;
    } else {
      s.actors[c.actor].b6 = 0;
    }
    c.flags &= ~CF.Asleep;
  }
  drawVitals(g);
}

/** ULTIMA_68ae: put to sleep. */
export function putToSleep(g: Game, i: number): void {
  const c = g.combat[i];
  const s = g.s;
  if (c.flags & CF.Player) {
    if (s.members[c.who].status === Status.Dead) return;
    s.members[c.who].status = Status.Sleeping;
    c.flags |= CF.Asleep;
    s.actors[c.actor].anim = 0x1e;
    if (i === s.activeMember) s.activeMember = 0xff;
    s.d58a2 = 4;
    drawVitals(g);
    if ((s.combatFlags & 4) === 0) updateFrame(g);
  } else {
    c.flags |= CF.Asleep;
    s.d58a2 = 4;
    s.actors[c.actor].b6 = 0xff;
    updateFrame(g);
  }
}

/** ULTIMA_6880: sleep, unless a player already poisoned. */
function sleepUnlessPoisoned(g: Game, i: number): void {
  const c = g.combat[i];
  if ((c.flags & CF.Player) === 0 || g.s.members[c.who].status !== Status.Poisoned) putToSleep(g, i);
}

/**
 * ULTIMA_6da8: a member's armour total, each worn item by the game's defence table - the Protection spell adding 2, as
 * the Apple II's does (the DOS routine's 3 was never used); in Doom, nothing but Mystic Armour counts. 1988's DOS build
 * compared each item with -1 unsigned, so that it never counted one, and never asked for the total in a fight at all.
 */
export function armourClass(g: Game, m: number): number {
  const s = g.s;
  const p = s.members[m];
  if (s.savedMapId === 40 && p.equips[1] !== 0x0f) return 0;
  const def = g.data.bytes(0x1634, 0x30);
  let n = 0;
  for (const e of p.equips) if ((e << 24) >> 24 > -1) n += def[e];
  if (s.icon === 80) n += 2;
  return n;
}

/** ULTIMA_6936: the party onto the arena (a ring may vanish as they go), and a moongate's guardian. */
export async function placeParty(g: Game): Promise<void> {
  liftDungeonMap(g); // a fight's log is the whole log
  const s = g.s;
  for (let i = 0; i < 0x20; i++) {
    const a = s.actors[i];
    a.y = a.z = a.b5 = a.tile = a.anim = a.x = a.b6 = 0;
    g.combat[i].clear();
  }
  const xs = g.combatMap.subarray(3 * 32 + 11, 3 * 32 + 17);
  const ys = g.combatMap.subarray(3 * 32 + 17, 3 * 32 + 23);
  const px = [...xs];
  const py = [...ys];
  const classTiles: Record<number, number> = {
    0x41: 0x4c,
    0x46: 0x48,
    0x50: 0x48,
    0x52: 0x48,
    0x44: 0x40,
    0x4d: 0x40,
    0x42: 0x44,
    0x53: 0x44,
    0x54: 0x44,
  };
  let ring = 0;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead) continue;
    if (p.equips[4] === 42) ring = 42;
    if (p.equips[4] === 44) ring = 44;
    if (ring !== 0) {
      if (g.random(0, 0xf) === 0xb) {
        g.say(0xa422); // "A ring has vanished!\n"
        await cue(g, 'Dissolve', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
        unequip(g, m, ring);
      }
      ring = 0;
    }
    const i = placeCombatant(g, m, 1, px[m], py[m], s.level);
    if (i < 0) continue;
    const a = s.actors[g.combat[i].actor];
    a.b7 = 0xff;
    a.tile = classTiles[p.cls] ?? 0x48;
    a.anim = a.tile;
    if (p.status === Status.Sleeping) putToSleep(g, i);
    else ringTurn(g, i);
  }
  if (g.combatMap[5 * 32 + 5] === 0xdc) {
    const i = placeCombatant(g, 1, 2, 5, 5, s.level);
    s.actors[i].b5 = s.level * 3 + 7;
    g.combatMap[5 * 32 + 5] = g.bb15;
  }
}

/** ULTIMA_6bc2: the monsters: one of the kind, then its fellows (a few of the kind's helper, D_16d4), placed in shuffled order when ambushed. */
async function prepareCombat(g: Game, flags: number, kindIn: number): Promise<void> {
  const s = g.s;
  g.bumped.clear(); // a new field: nothing on it searched yet
  let kind = kindIn;
  let fixed = true;
  if (kind >= 0x100) {
    kind -= 0x100;
    fixed = false;
  }
  s.exitDir = 0;
  if ((flags & 4) === 0) await placeParty(g);
  const order = Array.from({ length: 16 }, (_, i) => i);
  if (flags & 4) {
    for (let i = 0; i < 0xf; i++) {
      const j = g.random(0, 0xf);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  g.say(0xa438); // "*** CONFLICT ***\n"
  void cue(g, 'CombatStart');
  let n = s.savedMapId !== 0 && s.savedMapId < 0x21 && kind !== 0xc && fixed ? 1 : enemy(g, kind).count;
  if (n !== 8 && n !== 0x10 && n !== 1) {
    n = g.random(1, n);
    if (s.d5959 !== 0) n = g.random(1, n);
    updateFrame(g);
    if (n > 0x1f - 6) n = 0x1a;
  }
  const mx = g.combatMap.subarray(6 * 32 + 11, 6 * 32 + 27);
  const my = g.combatMap.subarray(7 * 32 + 11, 7 * 32 + 27);
  const monX = [...mx];
  const monY = [...my];
  placeCombatant(g, kind, 0, monX[order[0]], monY[order[0]], s.level);
  const helpers = Math.trunc(n / 4) + 1;
  for (let i = 1; i < n; i++) {
    let k = kind;
    if (i < helpers && g.rng.upTo(8) === 0) k = g.data.bytes(0x16d4, 0x30)[kind];
    placeCombatant(g, k, 0, monX[order[i]], monY[order[i]], s.level);
  }
}

// --- The monsters' minds ---------------------------------------------------------------------

/**
 * Fighter `i` charmed by `by` (Game.charmedBy, for the eased rules' roll to shake it) - or `bound`, for good: a
 * creature summoned to the party's side, and the Chaos Sword's wielder, shake nothing off.
 */
export function charm(g: Game, i: number, by: number | 'bound'): void {
  g.combat[i].flags |= CF.Charmed;
  g.charmedBy.set(i, by);
}

/** Whether the eased rules are in play (settings.ts Rules: Story or Modern): sleep, charm and breeding eased, for both sides. */
const easedRules = (g: Game): boolean => eased(g.options);

/**
 * The eased rules' end of a charmed fighter's turn (the port's): the roll that resisted the charm, made again -
 * against whoever charmed them, where they still stand, else against their own wits - and on it the charm thrown off.
 */
export async function shakeCharm(g: Game, i: number): Promise<void> {
  const c = g.combat[i];
  if (!(c.flags & CF.Charmed) || c.flags & CF.Dead) return;
  const by = g.charmedBy.get(i);
  if (by === 'bound') return;
  const inside = g.possessedBy.get(i);
  if (inside) {
    // A daemon within: the roll against its intelligence, as though it still stood on the field - and how far under
    // the mark it came, the harder the daemon is thrown out (castOut).
    const mark = Math.trunc((stat(g, i, Q.Int) + 0x1e - inside.int) / 2);
    const r = roll(g);
    if (r >= mark) return;
    inside.margin = mark - r;
  } else {
    const standing = by !== undefined && by !== i && g.combat[by].flags !== 0 && (g.combat[by].flags & CF.Dead) === 0;
    if (!resists(g, standing ? by : i, i, 0)) return;
  }
  c.flags &= ~CF.Charmed;
  g.charmedBy.delete(i);
  g.printChar('\n');
  sayName(g, i);
  g.print(' shakes off the charm!\n');
  drawVitals(g);
  released(g, i);
}

/**
 * Member `i`'s possession ended mid-fight - the charm thrown off or broken, or the member fallen: the daemon within,
 * if any, is to come out at the turn's end (castOut). With the Classic rules it is gone, as in 1988.
 */
export function released(g: Game, i: number): void {
  if (!g.possessedBy.has(i)) return;
  if (easedRules(g)) g.castOutDue.push(i);
  else g.possessedBy.delete(i);
}

/**
 * The eased rules' daemons cast out (the port's): each back on the field beside the member it possessed - else
 * anywhere free on it, else lost - weakened, never below 1 hit point: by how far the member's roll to throw it off
 * came under its mark (2.5% of its hit points a point), else by a fifth; with the Story rules, one gated in during
 * the fight with 1 hit point, a blow from gone. Not a daemon gated in anew: the fight's
 * allowance is not spent on it (mayBreed), and it is what it was, gated in or not.
 */
export async function castOut(g: Game): Promise<void> {
  const s = g.s;
  while (g.castOutDue.length) {
    const m = g.castOutDue.shift()!;
    const inside = g.possessedBy.get(m);
    g.possessedBy.delete(m);
    if (!inside) continue;
    const c = g.combat[m];
    let free = false;
    for (let k = 0; k < 8 && !free; k++) {
      nearSquare(g, c.x, c.y);
      free = arenaFree(g, 0xd8, s.dx, s.dy);
    }
    for (let k = 0; k < 16 && !free; k++) free = randomSquare(g) && arenaFree(g, 0xd8, s.dx, s.dy);
    if (!free) continue;
    const d = placeCombatant(g, 0x26, 0, s.dx, s.dy, s.level);
    if (d < 0) continue;
    // Thrown off on the member's roll: 2.5% of its hit points gone for each point the roll came under its mark, the
    // cleverer the member the harder; the possession ended any other way (a charm, the member fallen, a pass-out), a
    // fifth. With the Story rules a daemon gated in during the fight keeps but one, a blow from gone.
    const lost = inside.margin !== undefined ? Math.max(1, Math.round((inside.hp * inside.margin) / 40)) : Math.ceil(inside.hp / 5);
    g.combat[d].hp = g.options.rules === 'story' && inside.summoned ? 1 : Math.max(1, inside.hp - lost);
    if (inside.summoned) g.summoned.add(d);
    g.printChar('\n');
    g.print(`The daemon is cast out of ${s.members[c.who].name}!\n`);
    if (!g.soundOff) void g.sound.pulse(0xac8, 1, 5000, 1000, 0xf);
    const a = s.actors[g.combat[d].actor];
    a.tile = a.anim = 0x16;
    await reveal(g, 0x1d8, s.dx, s.dy);
    a.tile = a.anim = 0xd8;
  }
}

/** COMSUBS_0000: a charm's roll of intelligences (not for certain spells). */
function resists(g: Game, attacker: number, target: number, spell: number): boolean {
  if (spell === 0x30 || spell === 0x31 || spell >= 0x33) return false;
  const a = stat(g, attacker, Q.Int);
  const b = stat(g, target, Q.Int);
  return roll(g) < Math.trunc((b + 0x1e - a) / 2);
}

/** COMSUBS_0056: fields fade now and then. */
function fadeFields(g: Game): void {
  for (let i = 0; i < 0x20; i++) if ((g.s.actors[i].tile & 0xfc) === 0xe8 && g.random(0, 0xff) < 0x10) removeCombatant(g, i + 1);
}

/** COMSUBS_00f4: a monster's magic instead of a move: charm, vanish or reappear, summon a daemon. True if it acted. */
export async function monsterMagic(g: Game, i: number): Promise<boolean> {
  const s = g.s;
  const c = g.combat[i];
  const kind = c.who;
  if (g.regalia === 0x1c || s.icon === 0x4e || (c.flags & CF.Player) !== 0) return false; // the Crown worn, or Negate Magic
  const flags = enemyFlags(g, kind);
  if (flags & EF.Charm) {
    const t = g.random(0, 0x1f);
    const tf = g.combat[t].flags;
    if ((tf & CF.Player) !== 0 && (tf & (CF.Dead | CF.Invisible | CF.Asleep | CF.F4 | CF.Charmed)) === 0) {
      if (!resists(g, i, t, 0)) {
        g.printChar('\n');
        charm(g, t, i);
        if (g.combat[t].who === s.activeMember) s.activeMember = 0xff;
        drawVitals(g);
        sayName(g, t);
        g.say(0x99b4); // " possessed!\n"
        if (!g.soundOff) await g.sound.pulse(0xc1c, 1, 30000, 1000, 2);
        if (kind === 0x26) {
          // A daemon goes into the one it possesses (as in 1988), and with the eased rules comes out when the
          // possession ends (castOut).
          g.possessedBy.set(t, { hp: c.hp, int: stat(g, i, Q.Int), summoned: g.summoned.has(i) });
          g.summoned.delete(i);
          removeCombatant(g, -i - 1);
        }
      }
      return true;
    }
  }
  if (flags & EF.Disappear && g.random(0, 0xff) < 0x20) {
    g.printChar('\n');
    sayName(g, i);
    const a = s.actors[c.actor];
    if (a.anim === 0) {
      g.say(0x99c2); // " reappears!"
      c.flags &= ~CF.Invisible;
      a.anim = a.tile;
    } else {
      g.say(0x99ce); // " disappears!"
      c.flags |= CF.Invisible;
      a.anim = 0;
    }
    return true;
  }
  // Gating in, by the rules (settings.ts SUMMON_CHANCE): 1 in 8 a turn with the Story and the Modern, as the DOS game
  // has it, only while the fight's allowance lasts (mayBreed); 1 in 32 with the Classic, as the Apple II has it.
  if (flags & EF.Summon && g.random(0, 0xff) < SUMMON_CHANCE[g.options.rules] && mayBreed(g, i, false) && randomSquare(g)) {
    if (arenaFree(g, 0xd8, s.dx, s.dy)) {
      const d = placeCombatant(g, 0x26, 0, s.dx, s.dy, s.level);
      if (d !== -1) {
        spawned(g, d);
        g.printChar('\n');
        sayName(g, i);
        g.say(0x99dc); // " gates in a daemon!\n"
        if (!g.soundOff) void g.sound.pulse(0xac8, 1, 5000, 1000, 0xf);
        const a = s.actors[g.combat[d].actor];
        a.tile = a.anim = 0x16;
        await reveal(g, 0x1d8, s.dx, s.dy);
        a.tile = a.anim = 0xd8;
        return true;
      }
    }
  }
  return false;
}

/** COMBAT_0d30: the nearest foe (by the other side), and the step toward it (or away, fleeing) in (dx, dy). */
function nearestFoe(g: Game, i: number): number {
  const s = g.s;
  const me = g.combat[i];
  let near = -1;
  let seenParty = -1;
  let best = 99;
  let tx = 5;
  let ty = 5;
  let mySide = onMonsterSide(g, i);
  if (s.icon === 67 && stat(g, i, Q.Int) < roll(g)) mySide = false;
  for (let k = 0x1f; k > -1; k--) {
    const o = g.combat[k];
    if (k === i || o.flags === 0 || (o.flags & CF.Dead) !== 0) continue;
    if (mySide === onMonsterSide(g, k)) continue;
    if ((s.savedMapId === 40 || me.who === 47 || (o.flags & CF.Invisible) === 0) && (o.flags & CF.F4) === 0) {
      if (k < 5) seenParty++;
      const d = distance(me.x, me.y, o.x, o.y);
      if (d < best) {
        best = d;
        near = k;
        tx = o.x;
        ty = o.y;
      }
    }
  }
  if (seenParty === -1 && near === -1) near = passOut(g);
  if (near === -1) {
    for (let k = 0x1f; k > 5; k--) {
      if (g.combat[k].flags & CF.Monster) {
        g.combat[k].hp = 1;
        g.combat[k].flags |= CF.F2;
      }
    }
    tx = 5;
    ty = 5;
  }
  s.dx = s.dy = 0;
  if (me.x > tx) s.dx = -1;
  if (me.x < tx) s.dx = 1;
  if (me.y > ty) s.dy = -1;
  if (me.y < ty) s.dy = 1;
  if (me.flags & CF.F2) {
    s.dx = -s.dx;
    s.dy = -s.dy;
  }
  return near === i ? -1 : near;
}

/** SJOG_20d8: is (x, y) blocked for combatant `i` (off the arena too, unless it is fleeing). */
function blockedFor(g: Game, x: number, y: number, i: number): boolean {
  const c = g.combat[i];
  if (inArena(x, y)) return !arenaFree(g, g.s.actors[c.actor].tile, x, y);
  return (c.flags & CF.F2) === 0;
}

/** SJOG_2148: boxed in on all four sides (the original's walk round the square is kept). */
function boxedIn(g: Game, i: number): boolean {
  const c = g.combat[i];
  let x = c.x;
  let y = c.y;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    if (k === 0) y++;
    else if (k === 2) x -= 2;
    else {
      y--;
      x++;
    }
    if (blockedFor(g, x, y, i)) n++;
  }
  return n === 4;
}

/** COMBAT_120e: a random square (0-15 each way); true if it is on the arena. */
export function randomSquare(g: Game): boolean {
  g.s.dx = g.rng.upTo(0xf);
  g.s.dy = g.rng.upTo(0xf);
  return g.s.dx <= 0xa && g.s.dy <= 0xa;
}

/** COMBAT_0ee4: a monster's move: teleport, or step toward (or away from) its foe, sideways if it must. */
function monsterMove(g: Game, i: number): boolean {
  const s = g.s;
  const c = g.combat[i];
  let moved = 0;
  let how = 0;
  if (c.who === 0x1b || c.who === 0x1a) return false;
  if (
    (c.flags & CF.Player) === 0 &&
    enemyFlags(g, c.who) & EF.Teleport &&
    s.icon !== 0x4e &&
    g.regalia !== 0x1c &&
    (boxedIn(g, i) || g.rng.upTo(3) !== 3) &&
    randomSquare(g) &&
    arenaFree(g, s.actors[c.actor].tile, s.dx, s.dy)
  ) {
    s.actors[c.actor].x = c.x = s.dx;
    s.actors[c.actor].y = c.y = s.dy;
    g.print(creatureName(g, c.who));
    g.say(0x6f0c); // " teleports!\n"
    moved++;
  }
  if (moved === 0 && !boxedIn(g, i)) {
    nearestFoe(g, i);
    if (g.rng.upTo(0xff) > 0x7f && !blockedFor(g, c.x + s.dx, c.y, i)) {
      s.dy = 0;
      how = 999;
    } else if (!blockedFor(g, c.x, c.y + s.dy, i)) {
      s.dx = 0;
      how = 998;
    }
    if (how < 990) {
      how = 0;
      for (let k = 4; k > 0; k--) {
        how = g.rng.upTo(3);
        [s.dx, s.dy] = [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ][how];
        if (!blockedFor(g, c.x + s.dx, c.y + s.dy, i)) how = 991;
        if (how > 990) break;
        s.dx = s.dy = 0;
      }
    }
    if (how !== 0) {
      c.x += s.dx;
      s.actors[c.actor].x = c.x;
      c.y += s.dy;
      s.actors[c.actor].y = c.y;
      moved = 1;
      if (!inArena(c.x, c.y)) s.d58a2 = 0x10;
    }
  }
  return moved !== 0;
}

/** How long each of the three frames of a hit's burst shows (the ultima3 port's). */
const HIT_FRAME_MS = 60;

/** COMBAT_014e: a monster's ranged attack (breath, arrows, magic) at its foe. */
async function monsterShoots(g: Game, i: number, target: number, reflected: boolean): Promise<boolean> {
  const s = g.s;
  const kind = g.combat[i].who;
  const missile = g.data.bytes(0x15cc, 0x30)[kind];
  if ((kind !== 0x1a && g.random(0, 0xff) >= 0x80) || ((enemyFlags(g, kind) & EF.Magic) !== 0 && (s.icon === 0x4e || g.regalia === 0x1c)))
    return false;
  // A monster's spell, in the Standard set, is its own sound; its arrows and breath are the missile's (game/cues.ts).
  const shoot = (): Promise<void> => g.sound.sweep(0x2ee, 400, 5, 0x96);
  if (enemyFlags(g, kind) & EF.Magic) await cue(g, 'MonsterSpell', shoot);
  else if (!g.soundOff) await shoot();
  const hit = reflected ? false : hitRoll(g, target, i, -s.d588f, 0);
  const victim = await missileAt(g, i, g.combat[target].x, g.combat[target].y, hit, missile);
  if (victim >= 0) {
    await hitFlash(g, victim, (enemyFlags(g, kind) & EF.Magic) !== 0);
    g.printChar('\n');
    await strike(g, victim, i);
    await report(g, victim, i);
  }
  return true;
}

/** COMBAT_0226: a monster attacks if it can: charmed ones strike their own; thieves steal; reach by D_159c. */
async function monsterAttacks(g: Game, i: number): Promise<boolean> {
  const s = g.s;
  const c = g.combat[i];
  const kind = c.who;
  const target = nearestFoe(g, i);
  if (target < 0) return false;
  let reflected = false;
  if (c.flags & CF.Charmed) {
    if (between(g, i, target) !== 1) return false;
    s.weapon = 0x21;
    await melee(g, i, target, 0x21);
    return true;
  }
  const tc = g.combat[target];
  if ((tc.flags & CF.Player) !== 0 && s.members[tc.who].equips[5] === 0x2d && enemyFlags(g, kind) & EF.Magic)
    reflected = g.random(0, 0xff) < 0x80;
  if (between(g, i, target) > g.data.bytes(0x159c, 0x30)[kind]) return false;
  if (kind === 0x1a) s.actors[c.actor].b6 = 0x20;
  if (between(g, i, target) !== 1) return monsterShoots(g, i, target, reflected);
  if (kind === 0x2d) s.actors[c.actor].b6 = 0x20;
  if (!g.soundOff) await g.sound.sweep(0x2ee, 400, 5, 0x96);
  s.d58a8[target] = i;
  if (!hitRoll(g, target, i, -s.d588f, 0)) return true;
  if (enemyFlags(g, kind) & EF.Steal && g.random(0, 3) !== 0 && s.food !== 0) {
    g.say(0x6d74); // "\nA "
    sayName(g, i);
    g.say(0x6d78); // " stole some food!\n"
    s.food = Math.max(0, s.food - 5);
    if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
    drawVitals(g);
    return true;
  }
  await hitFlash(g, target);
  g.printChar('\n');
  await strike(g, target, i);
  await report(g, target, i);
  return true;
}

/** COMBAT_03f4: a monster's (or charmed member's) turn. */
async function monsterTurn(g: Game): Promise<void> {
  const s = g.s;
  const c = g.combat[s.combatTurn];
  s.weapon = 0;
  if (s.icon === 0x54 || (s.icon === 0x51 && g.random(0, 1) === 0) || (c.flags & CF.F4) !== 0) return;
  if (c.flags & CF.Asleep) {
    // (The eased rules: one in ten, where 1988 woke a monster one turn in seventeen.)
    if (easedRules(g) ? g.random(0, 9) === 0 : g.random(0, 0x10) === 0x10) wake(g, s.combatTurn);
    return;
  }
  if (c.who === 0x2d) s.actors[c.actor].b6 = 0;
  if (c.flags & CF.F2) {
    if ((c.flags & CF.Player) === 0 && g.random(0, 3) === 3) c.hp++;
    woundedState(g, s.combatTurn);
  } else {
    if (await monsterMagic(g, s.combatTurn)) return;
    if (await monsterAttacks(g, s.combatTurn)) return;
  }
  if (monsterMove(g, s.combatTurn)) {
    if (s.d58a2 & 0x10) {
      g.printChar('\n');
      await cue(g, 'Withdraw', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
      sayName(g, s.combatTurn);
      g.say(0x6d8c); // " escapes!\n"
      removeCombatant(g, -s.combatTurn - 1);
      if ((c.flags & CF.Player) === 0 && c.who === 0x2f) passOut(g);
    }
    updateFrame(g);
  } else if (c.flags & CF.F2) {
    await monsterAttacks(g, s.combatTurn);
  }
}

// --- Attacks ------------------------------------------------------------------------------

/** QUERY_STAT_*. */
const Q = { Int: -1, Dex: -2, Str: -3, Def: -4 } as const;

/** ULTIMA_3abe. */
export function roll(g: Game): number {
  const n = Math.trunc(g.rng.upTo(0x3c) / 2);
  return n === 0 ? 1 : n;
}

/** COMBAT_139a: dexterity for a hit roll (1 when frozen by time, a mimic, or asleep). */
function dexOf(g: Game, i: number): number {
  const c = g.combat[i];
  if (g.s.icon === 0x54 && c.flags & CF.Monster) return 1;
  if (c.who === 0x1a) return 1;
  if (c.flags & CF.Asleep) return 1;
  return c.dex;
}

/** COMBAT_13e2: a combatant's stat; a weapon (or 0 for a monster) picks strength or dexterity. */
export function stat(g: Game, i: number, which: number): number {
  const c = g.combat[i];
  const s = g.s;
  if (c.flags & CF.Monster) {
    if (which === 0) which = enemyFlags(g, c.who) & EF.Str ? Q.Str : Q.Dex;
  } else if (which > 0) {
    which = which === 0xff ? Q.Dex : g.data.bytes(0x169c, 0x38)[which] === 8 ? Q.Str : Q.Dex;
  }
  switch (which) {
    case Q.Int:
      return c.flags & CF.Monster ? enemy(g, c.who).int : s.members[c.who].int;
    case Q.Dex:
      return dexOf(g, i);
    case Q.Str:
      return c.flags & CF.Monster ? enemy(g, c.who).str : s.members[c.who].str;
    case Q.Def:
      return c.flags & CF.Monster ? enemy(g, c.who).def : armourClass(g, c.who);
  }
  return 0;
}

/** COMBAT_14d6: does `attacker` hit `target` (with weapon or spell `weapon`; some never miss). */
export function hitRoll(g: Game, target: number, attacker: number, _unused: number, weapon: number): boolean {
  const s = g.s;
  let a: number = Q.Int;
  let t: number = Q.Int;
  let sure = false;
  if (s.d588f !== 0) {
    if ((weapon > 0x29 && weapon < 0x32) || weapon === 0x33) sure = true;
    else t = a = Q.Int;
  } else if (weapon === 0x27 || weapon === 0x23 || weapon === 0x28) {
    sure = true;
  } else {
    t = Q.Dex;
    a = weapon;
  }
  if (sure) return true;
  const tv = stat(g, target, t);
  const av = stat(g, attacker, a);
  return Math.trunc((tv - av + 0x1e) / 2) <= roll(g);
}

/**
 * What member `m` soaks of a blow, up to: their armour (armourClass) and the rules' armour bonus (settings.ts
 * COMBAT_BONUS), as the Apple II reckons it - armour alone being the design. 1988's DOS game took a byte of the member's
 * record instead (offset 0x18: 7 for everyone, never written), and so no armour at all.
 */
export function memberDefence(g: Game, m: number): number {
  return armourClass(g, m) + armourBonus(g.options, g.s.food);
}

/** COMBAT_12b0: damage from `attacker` to `target`: the weapon's (a monster's attack), less up to the target's defence. */
export function damageRoll(g: Game, attacker: number, target: number): number {
  const s = g.s;
  let dmg: number;
  if (g.combat[attacker].flags & CF.Monster) {
    // Rolled, 1 to the creature's attack, as the Apple II's MAIN.COMBAT rolls it (its $A41D); 1988's PC game took the
    // whole attack every blow (COMBAT_12b0), so a dragon struck for 30 each time - about twice the design's. With the
    // eased rules a heavy hitter (HEAVY_HITTERS: a gargoyle, a daemon, a dragon) rolls half its attack to all of it
    // (the port's), the threat it was meant to be, where 1 to its attack let a party just begun outlast it; the
    // Classic, the Apple II's 1 to it for every creature.
    const who = g.combat[attacker].who;
    dmg = enemy(g, who).atk;
    const heavy = HEAVY_HITTERS.has(who) && easedRules(g);
    if (dmg > 1 && dmg !== 99) dmg = g.random(heavy ? Math.ceil(dmg / 2) : 1, dmg);
  } else {
    dmg = s.weapon;
    if (dmg === 0x27) {
      g.say(0x6f1a); // "Thy sword hath shattered!\n"
      // The member's own, by their number in the party: 1988 passed the combatant's (COMBAT_12b0, ULTIMA_6e60), which
      // is another member's once one ahead of the wielder has fallen (the fallen take no place in a fight), and the
      // sword was never shattered at all - a Glass Sword kept for ever. Cheats has them for whoever wants them.
      unequip(g, g.combat[attacker].who, dmg);
      dmg = 99;
    } else if (dmg === 0xff) {
      dmg = 1;
    } else if (dmg === 0x28) {
      dmg = 0;
    } else {
      dmg = g.data.bytes(0x15fc, 0x38)[dmg];
      if (dmg > 1 && dmg !== 99) dmg = g.random(1, dmg);
    }
  }
  if (dmg === 99) return 99;
  const tc = g.combat[target];
  const def = tc.flags & CF.Monster ? enemy(g, tc.who).def : memberDefence(g, tc.who);
  return def !== 0 ? dmg - g.random(1, def) : dmg;
}

/** A fight begun: its allowance of creatures it can breed (mayBreed), full. */
export function newSpawns(g: Game): void {
  g.splitLimit.clear();
  g.splits.clear();
  g.summoned.clear();
  g.spawnLeft = g.options.rules === 'classic' ? 0 : SPAWN_ALLOWANCE[g.options.rules];
  g.possessedBy.clear();
  g.castOutDue = [];
}

/**
 * Whether combatant `i` may divide (`split`) or gate in a daemon now. With the Classic rules always, as in 1988.
 * With the Modern only while the fight's allowance lasts (SPAWN_ALLOWANCE, by the rules: each copy, daemon
 * gated in and creature the party summons spends one, both sides' together) - and a creature divides only so often:
 * one the fight began with as the rules have it (ORIGINAL_SPLITS), a copy one time fewer than what it split
 * from.
 */
export function mayBreed(g: Game, i: number, split: boolean): boolean {
  if (!easedRules(g)) return true;
  if (g.spawnLeft <= 0) return false;
  return !split || (g.splits.get(i) ?? 0) < splitLimit(g, i);
}

/** How often combatant `i` may divide with the eased rules (mayBreed). */
function splitLimit(g: Game, i: number): number {
  return g.splitLimit.get(i) ?? (g.options.rules === 'classic' ? Infinity : ORIGINAL_SPLITS[g.options.rules]);
}

/**
 * Combatant `n`, made in a fight - a copy split off `by`, a daemon gated in, a creature the party summons: with the
 * eased rules, spent from the fight's allowance (mayBreed). The party's summons spend it, never wait on it.
 */
export function spawned(g: Game, n: number, by = -1): void {
  if (n < 0 || !easedRules(g)) return;
  g.spawnLeft = Math.max(0, g.spawnLeft - 1);
  if (by < 0) {
    g.summoned.add(n); // gated in, not split off (castOut)
    return;
  }
  g.splits.set(by, (g.splits.get(by) ?? 0) + 1);
  g.splitLimit.set(n, Math.max(0, splitLimit(g, by) - 1));
}

/** COMBAT_1574: damage to combatant `i`; the experience it is worth if it dies. */
export async function damage(g: Game, i: number, amount: number): Promise<number> {
  const s = g.s;
  const c = g.combat[i];
  let worth = 0;
  if (amount < 1) {
    s.d58a2 = 0x20;
    amount = 0;
  }
  // The eased rules (the port's): a sleeper hurt, and left standing, has an even chance to wake.
  if (easedRules(g) && amount > 0 && amount !== 99 && c.flags & CF.Asleep && g.random(0, 1) === 0) {
    const left = c.flags & CF.Player ? s.members[c.who].hp - amount : c.hp - amount;
    if (left > 0) {
      wake(g, i);
      g.printChar('\n');
      sayName(g, i);
      g.print(' wakes!\n');
    }
  }
  if (c.flags & CF.Player) {
    const m = s.members[c.who];
    m.hp -= amount;
    if (m.hp < 1 || amount === 99) {
      m.hp = 0;
      c.flags |= CF.Dead;
      m.status = Status.Dead;
      released(g, i);
      void cue(g, deathCue(m.gender));
      s.actors[c.actor].tile = s.actors[c.actor].anim = 0x1e;
      if (c.who === s.activeMember) s.activeMember = 0xff;
    }
    drawVitals(g);
    return 0;
  }
  const flags = enemyFlags(g, c.who);
  if ((flags & 0xff & EF.Undead) !== 0 && s.d5890 === 0) amount = Math.trunc(amount / 2);
  if ((flags & 0xff & EF.NoDamage) !== 0) amount = 0;
  c.hp = c.hp < amount ? 0 : c.hp - amount;
  if (c.hp === 0 || amount === 99) {
    const e = enemy(g, c.who);
    worth = (e.maxHp >> 2) + 1;
    const treasure = e.treasure;
    c.flags = CF.Dead;
    c.hp = 0;
    const x = c.x;
    const y = c.y;
    const under = g.combatMap[y * 32 + x];
    const a = s.actors[c.actor];
    if ((flags & (EF.Vanish | EF.NoCorpse)) === 0) {
      if (c.who === 0x1c) {
        a.tile = a.anim = 0x1f;
        placeCombatant(g, 0x1f, 0, x, y, s.level);
        updateFrame(g);
      } else if (c.who === 0x1e) {
        setTileAt(g, x, y, T.T4C);
        removeCombatant(g, -i - 1);
      } else if (under === 0x87 || under < 4) {
        removeCombatant(g, -i - 1);
      } else if (treasure >= roll(g)) {
        a.tile = a.anim = 1;
        a.b5 = treasure;
        if (treasure > roll(g)) a.b5 |= 0x80;
      } else {
        a.tile = a.anim = 0x1f;
      }
    } else if (flags & EF.Vanish) {
      g.print(creatureName(g, c.who));
      g.say(0x6f36); // " vanishes!"
      s.d58a2 = 2;
      a.tile = a.anim = 0x16;
      await reveal(g, g.combatMap[c.y * 32 + c.x], c.x, c.y);
      removeCombatant(g, -(i + 1));
      passOut(g);
    } else {
      removeCombatant(g, -(i + 1));
    }
  } else if (flags & EF.Divide && (amount > 0 || !easedRules(g)) && mayBreed(g, i, true)) {
    // A gargoyle or a slime splits at every blow that does not kill it, a graze too, the copy as whole as it is, as
    // in both originals. With the eased rules as the fight's allowance lets it (mayBreed), and a graze lets it be.
    for (let k = 0; k < 8; k++) {
      nearSquare(g, c.x, c.y);
      const x = s.dx;
      const y = s.dy;
      if (arenaFree(g, s.actors[c.actor].tile, x, y)) {
        const n = placeCombatant(g, (s.actors[c.actor].tile - 0x40) >> 2, 0, x, y, s.level);
        if (n > -1) {
          g.combat[n].hp = c.hp;
          spawned(g, n, i);
          g.print(creatureName(g, c.who));
          g.say(0x6f42); // " divides!\n"
          break;
        }
      }
    }
  }
  return worth;
}

/** COMBAT_18ba: poison: a healthy member is poisoned; anyone else takes 0-20 damage. */
export async function poison(g: Game, i: number, attacker: number): Promise<void> {
  const s = g.s;
  const c = g.combat[i];
  if (c.flags & CF.Player && s.members[c.who].status === Status.Good) {
    s.members[c.who].status = Status.Poisoned;
    g.print(s.members[c.who].name);
    g.say(0x6f4e); // " is poisoned!\n"
    s.d58a2 = 8;
    g.vitalsDirty = 1;
  } else {
    // Poison that only damages (the port's setting) takes a poisoned member no lower than a single hit point
    // here either, where the original's second dose deals 0-20.
    let amount = g.rng.upTo(0x14);
    if (c.flags & CF.Player && !poisonKills(g.options)) amount = Math.min(amount, Math.max(s.members[c.who].hp - 1, 0));
    const worth = await damage(g, i, amount);
    if (attacker > -1 && g.combat[attacker].flags & CF.Player) addExp(g, g.combat[attacker].who, worth);
  }
}

/**
 * The experience a kill is worth. The original gives it all to whoever
 * struck the blow; with the Story or Modern rules (the port's, from the ultima3
 * port) it is shared among the living members, the odd points left over
 * going to the one who struck.
 */
export function addExp(g: Game, m: number, n: number): void {
  const s = g.s;
  const give = (who: number, amount: number): void => {
    const p = s.members[who];
    p.exp = Math.min(p.exp + amount, 9999);
  };
  if (!balancedXp(g.options)) {
    give(m, n);
    return;
  }
  const alive: number[] = [];
  for (let i = 0; i < s.partySize; i++) if (s.members[i].status !== Status.Dead) alive.push(i);
  if (alive.length < 2) {
    give(m, n);
    return;
  }
  const each = Math.floor(n / alive.length);
  for (const who of alive) give(who, each);
  const over = n - each * alive.length;
  if (over > 0) give(m, over);
}

/** COMBAT_194a: `attacker`'s blow lands on `target`: poison, sleep, or damage (and experience). */
export async function strike(g: Game, target: number, attacker: number): Promise<void> {
  const s = g.s;
  const byMonster = (g.combat[attacker].flags & CF.Player) === 0;
  if (byMonster && enemyFlags(g, g.combat[attacker].who) & (EF.Poison200 | EF.Poison4) && g.random(0, 3) !== 0) {
    await poison(g, target, attacker);
    return;
  }
  if (byMonster && g.combat[attacker].who === 0x1c && (g.combat[target].flags & CF.Asleep) === 0) {
    putToSleep(g, target);
    return;
  }
  if (s.d5890 !== 0 && s.weapon === 52) {
    putToSleep(g, target);
    return;
  }
  if (s.d5890 === 0 || s.weapon !== 51) {
    const dmg = damageRoll(g, attacker, target);
    if (dmg < 0 && g.combat[target].flags & CF.Player) {
      s.d58a2 = 0x20;
      return;
    }
    const worth = await damage(g, target, dmg);
    if (g.combat[attacker].flags & CF.Player) addExp(g, g.combat[attacker].who, worth);
  } else {
    await poison(g, target, attacker);
  }
}

/** COMSUBS_0312: tell what happened to `i`. */
export async function report(g: Game, i: number, attacker: number): Promise<void> {
  const s = g.s;
  const f = g.combat[i].flags;
  s.d58a2 &= 0xfe;
  if (s.d58a2 & 0x20) {
    sayName(g, i);
    g.say(0x99f2); // " grazed!\n"
    await cue(g, 'Graze', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
  }
  if ((s.d58a2 & 0x22) !== 0) {
    s.d58a2 &= 0xdd;
    return;
  }
  if (f === 0 || (f & CF.Dead) !== 0) {
    sayName(g, i);
    g.say(0x99fc); // " killed!\n"
    s.d58a2 |= 1;
  } else if (s.d58a2 & 4) {
    sayName(g, i);
    g.say(0x9a06); // " slept!\n"
  } else if ((s.d58a2 & 8) === 0) {
    sayName(g, i);
    if (f & CF.Player) {
      if (attacker !== 0xff && g.combat[attacker].who === 0x2d) {
        g.say(0x9a10); // " dragged under!\n"
        await cue(g, 'DraggedUnder', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
        g.combat[i].flags |= CF.F4;
        s.actors[g.combat[i].actor].anim = 0;
        await sleepTicks(g, 4);
      } else {
        g.say(0x9a22); // " hit!\n"
      }
    } else {
      const state = woundedState(g, i);
      g.say([0, 0x9a64, 0x9a50, 0x9a3c, 0x9a2a][state] || 0x9a2a);
    }
  }
  if (f & CF.Player) {
    drawVitals(g);
    updateFrame(g);
  }
  s.d58a2 &= 0xf3;
}

/** COMBAT_1a5c: a monster's state by its hit points (1 critical, 2 heavily, 3 lightly, 4 barely); the badly hurt flee. */
export function woundedState(g: Game, i: number): number {
  const c = g.combat[i];
  if (c.flags & CF.Player) return 0;
  let quarter = Math.trunc(enemy(g, c.who).maxHp / 4);
  let flee = false;
  let state: number;
  if (c.hp < quarter) {
    state = 1;
    flee = true;
  } else {
    quarter *= 2;
    if (c.hp < quarter) {
      state = 2;
      if (g.rng.upTo(0x100) > 0xfb) flee = true;
    } else {
      state = c.hp < Math.trunc(quarter / 2) * 3 ? 3 : 4;
    }
  }
  if (flee) c.flags |= CF.F2;
  else c.flags &= ~CF.F2;
  return state;
}

/** COMSUBS_07d4: a random square next to (x, y) on the arena, in (dx, dy). */
export function nearSquare(g: Game, x: number, y: number): void {
  const s = g.s;
  do {
    s.dx = g.random(1, 3) + x - 2;
    s.dy = g.random(1, 3) + y - 2;
  } while (s.dx < 0 || s.dx > 10 || s.dy < 0 || s.dy > 10);
}

/** COMSUBS_0748: the live combatant at (x, y), or -1. */
export function combatantAt(g: Game, x: number, y: number): number {
  let found = -1;
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (c.x !== x || c.y !== y) continue;
    if (
      g.s.actors[c.actor].anim !== 0xf4 &&
      (c.flags & (CF.Player | CF.Monster)) !== 0 &&
      (c.flags & CF.Dead) === 0 &&
      (c.flags & CF.F4) === 0
    ) {
      found = i;
      break;
    }
    found = -1;
  }
  return found;
}

/** COMSUBS_0822: a missile from `i` toward (x, y) (a miss lands nearby); fields where it lands for certain weapons and spells. The combatant hit, or -1. */
export async function missileAt(g: Game, i: number, x: number, y: number, hit: boolean, kind: number): Promise<number> {
  const s = g.s;
  let tx = x;
  let ty = y;
  const fx = g.combat[i].x;
  const fy = g.combat[i].y;
  if (!hit) {
    do nearSquare(g, tx, ty);
    while (fx === s.dx && fy === s.dy);
    tx = s.dx;
    ty = s.dy;
  }
  let landed = false;
  if (s.weapon === 25 || s.weapon === 34) {
    if (hit) {
      tx = x;
      ty = y;
      landed = true;
    }
  } else {
    landed = await shoot(g, fx, fy, tx, ty, kind);
    if (landed) trigger(g, tx, ty);
    else {
      tx = s.dx;
      ty = s.dy;
    }
  }
  if (landed) {
    const victim = combatantAt(g, tx, ty);
    const fieldFor: Record<number, number> = { 0x13: 0xea, 53: 0xea, 51: 0xe8, 52: 0xe9, 54: 0xeb };
    if (fieldFor[s.weapon] !== undefined) placeCombatant(g, fieldFor[s.weapon], 2, tx, ty, s.level);
    if ((s.d588f === 0 || hit) && victim >= 0 && victim !== s.combatTurn) {
      s.dx = tx;
      s.dy = ty;
      return victim;
    }
  }
  s.dx = tx;
  s.dy = ty;
  return -1;
}

/**
 * What a weapon spends, for its name before a blow (the port's): the party's arrows for a bow, its quarrels for a
 * crossbow, and how many a member has to throw of a dagger, spear, throwing axe or flaming oil - the one in hand and
 * the party's spares. Null for a weapon that spends nothing.
 */
export function ammoLeft(g: Game, weapon: number): number | null {
  const s = g.s;
  if (weapon === 0x1a || weapon === 0x24) return s.equipment[0x1b];
  if (weapon === 0x1c) return s.equipment[0x1d];
  if (THROWN.includes(weapon)) return s.equipment[weapon] + 1;
  return null;
}

/** A weapon's name before its blow, with how many it has left to spend (ammoLeft): "Bow x23:", "Spear x2:". */
export function weaponLabel(g: Game, weapon: number): string {
  const name = (g.data.table(0x17f6, 0x30)[weapon] ?? '').trim();
  const left = ammoLeft(g, weapon);
  return left === null ? `${name}:` : `${name} x${left}:`;
}

/**
 * COMSUBS_097c: ammunition spent (arrows, bolts), thrown weapons given up. The last arrow put every bow away, the
 * magic bow with the plain (the port's: the original put away only the kind that shot it, and the other, left in
 * hand with none, shot on - the count wrapping to 255 arrows). What the last arrow or quarrel put away is said, after
 * the shot (the port's: 1988 put it away without a word): returned, to be.
 */
export function spendAmmo(g: Game, weapon: number, range: number): string | null {
  const s = g.s;
  if (s.d588f !== 0) return null;
  const refill = (...ws: number[]): number => {
    let n = 0;
    for (const w of ws)
      for (let m = 0; m < s.partySize; m++)
        if (unequip(g, m, w)) {
          s.equipment[w]++;
          n++;
        }
    return n;
  };
  switch (weapon) {
    case 0x1a:
    case 0x24:
      if (s.equipment[0x1b] > 0) s.equipment[0x1b]--;
      if (s.equipment[0x1b] === 0) {
        const n = refill(0x1a, 0x24);
        if (n) return `Last arrow! ${n > 1 ? 'Bows' : 'Bow'} put away.`;
      }
      break;
    case 0x1c:
      if (s.equipment[0x1d] > 0) s.equipment[0x1d]--;
      if (s.equipment[0x1d] === 0) {
        const n = refill(0x1c);
        if (n) return `Last quarrel! ${n > 1 ? 'Crossbows' : 'Crossbow'} put away.`;
      }
      break;
    case 0x10:
    case 0x15:
    case 0x16:
      if (range <= 1) break;
      if (s.equipment[weapon] !== 0) s.equipment[weapon]--;
      else unequip(g, g.combat[s.combatTurn].who, weapon);
      break;
  }
  return null;
}

/**
 * COMSUBS_09fc: a foe next to a missile user who struck it last "interferes" - said as what it stops (the port's, where
 * 1988 said only " interferes!"): "interrupts casting!", "interrupts ranged attack!".
 */
export function interferes(g: Game, i: number, stops: 'casting' | 'ranged attack'): boolean {
  const s = g.s;
  const o = s.d58a8[i];
  if (
    o !== 0xff &&
    g.combat[o].flags !== 0 &&
    onMonsterSide(g, o) &&
    (g.combat[o].flags & (CF.Asleep | CF.F4)) === 0 &&
    s.icon !== 0x54 &&
    between(g, i, o) === 1
  ) {
    g.printChar('\n');
    sayName(g, o);
    g.print(` interrupts ${stops}!\n`); // (1988's 0x9a70: " interferes!\n")
    return true;
  }
  return false;
}

/**
 * Where the aim starts with no foe struck before, or none still standing within `range` (the port's): the nearest
 * foe within it, the weakest of those as near; `i` itself (the 1988 game's start) where there is none.
 */
function firstAim(g: Game, i: number, range: number): number {
  let best = i;
  for (let j = 0; j < 0x20; j++) {
    if (j === i || !standingFoe(g, j) || between(g, i, j) > range) continue;
    if (
      best === i ||
      between(g, i, j) < between(g, i, best) ||
      (between(g, i, j) === between(g, i, best) && g.combat[j].hp < g.combat[best].hp)
    )
      best = j;
  }
  return best;
}

/**
 * The nearest of the party's side to combatant `i` within `range` - a member, or a creature summoned or charmed to it
 * - else `i` itself: where a spell for a friend is first aimed (Clone, the port's).
 */
function nearestFriend(g: Game, i: number, range: number): number {
  let best = i;
  for (let j = 0; j < 0x20; j++) {
    const c = g.combat[j];
    if (j === i || !c.flags || c.flags & (CF.Dead | CF.Invisible) || onMonsterSide(g, j) || combatantAt(g, c.x, c.y) !== j) continue;
    if (between(g, i, j) > range) continue;
    if (best === i || between(g, i, j) < between(g, i, best)) best = j;
  }
  return best;
}

/**
 * COMSUBS_0504: aim with the crosshair within `range`; the distance chosen, or 0 when cancelled. A spell for a friend
 * (`friend`, Clone) starts the crosshair on the nearest of the party's side, not the nearest foe.
 */
export async function aim(g: Game, i: number, range: number, friend = false): Promise<number> {
  const s = g.s;
  s.crosshair = 1;
  let target = s.actors[g.combat[i].actor].b7;
  const tc = g.combat[target];
  if (friend) target = nearestFriend(g, i, range);
  else if (
    target > 0x1f ||
    !standingFoe(g, target) || // the last one struck, charmed to the party's side since
    (tc.flags & (CF.Dead | CF.Invisible)) !== 0 ||
    tc.flags === 0 ||
    s.actors[tc.actor].tile === 0 ||
    between(g, i, target) > range
  )
    target = firstAim(g, i, range);
  s.crossX = g.combat[target].x;
  s.crossY = g.combat[target].y;
  // A foe walked into with Auto aim off: the crosshair starts on it, while it stands in reach.
  const from = friend ? null : g.aimFrom;
  if (from && standingFoe(g, combatantAt(g, from.x, from.y)) && distance(from.x, from.y, g.combat[i].x, g.combat[i].y) <= range) {
    s.crossX = from.x;
    s.crossY = from.y;
  }
  let fire = false;
  let cancel = false;
  let d = 0;
  // A foe walked into is the one aimed at, and struck without asking (movePlayer) - by every hand's weapon in turn,
  // for as long as it stands (the Attack command lets it go when it is done).
  const bumped = g.bumpFoe;
  const there = bumped ? combatantAt(g, bumped.x, bumped.y) : -1;
  if (bumped && there >= 0 && !(g.combat[there].flags & CF.Dead) && distance(bumped.x, bumped.y, g.combat[i].x, g.combat[i].y) <= range) {
    s.crossX = bumped.x;
    s.crossY = bumped.y;
    s.crosshair = 0;
    g.printChar('\n');
    if (s.d588f !== 0 && !g.soundOff) void g.sound.noise(800, s.d588f * 0x640 + 8000, 700);
    return distance(bumped.x, bumped.y, g.combat[i].x, g.combat[i].y);
  }
  // The crosshair is moved by the d-pad and A strikes, as A chooses everywhere (and X, which attacks, or Y a spell's
  // aim, which casts): the border says only what is asked.
  const hint = g.options.input === 'controller' && !autoPlaysTurn(g);
  if (hint) borderTitle(g, 'Aim');
  while (!fire && !cancel) {
    let dx = 0;
    let dy = 0;
    updateFrame(g);
    let k = await getChar(g);
    // The button that began it looses it, as A does: X an attack's blow, Y a spell's (and neither the other's).
    if (k === (g.casting ? Pad.Y : Pad.X)) k = K.Enter;
    switch (k) {
      case Home:
        dx = dy = -1;
        break;
      case PgDn:
        dx = dy = 1;
        break;
      case PgUp:
        dy = -1;
        dx = 1;
        break;
      case End:
        dy = 1;
        dx = -1;
        break;
      case K.Up:
        dy = -1;
        break;
      case K.Down:
        dy = 1;
        break;
      case K.Right:
        dx = 1;
        break;
      case K.Left:
        dx = -1;
        break;
      case K.Space:
        if (g.combat[i].x === s.crossX && g.combat[i].y === s.crossY) cancel = true;
      // falls through
      case K.Enter:
      case 0x41:
        if (g.combat[i].x !== s.crossX || g.combat[i].y !== s.crossY) {
          g.printChar('\n');
          if (s.d588f !== 0 && !g.soundOff) void g.sound.noise(800, s.d588f * 0x640 + 8000, 700);
          fire = true;
        }
        break;
      case K.Escape:
        cancel = true;
        break;
    }
    const nx = dx + s.crossX;
    const ny = dy + s.crossY;
    d = distance(nx, ny, g.combat[i].x, g.combat[i].y);
    if (d <= range && nx >= 0 && nx < 0xb && ny >= 0 && ny < 0xb) {
      s.crossX = nx;
      s.crossY = ny;
    }
  }
  s.crosshair = 0;
  if (hint) clearBorderTitle(g);
  if (cancel) {
    g.printChar('\n');
    g.cancelled = true;
    return 0;
  }
  return d;
}

/** How long the turn's marker shows dim as a blow or shot misses (missFlash). */
const MISS_FLASH_MS = 140;

/**
 * A miss shown on the one who missed (the port's): in the Standard look, the turn's marker round them flashed a dim
 * white, the attack seen to be made though it struck nothing - where the log alone said so. The party's side only, as
 * the marker is theirs.
 */
async function missFlash(g: Game, attacker: number): Promise<void> {
  const d = g.draw;
  if (g.options.tileSet !== 'standard' || !d.marker || attacker < 0 || attacker > 0x1f || onMonsterSide(g, attacker)) return;
  const c = g.combat[attacker];
  d.marker(c.x, c.y, Colour.missed);
  await g.p.sleep(MISS_FLASH_MS);
  updateFrame(g);
}

/** COMSUBS_00d2. */
function missed(g: Game, i: number): void {
  if (g.s.d588f !== 0)
    g.say(0x99a0); // "Failed!\n"
  else {
    sayName(g, i);
    g.say(0x99aa); // " missed!\n"
  }
}

/** COMSUBS_0a68: a ranged attack: aim, fly, hit (boomerangs come back). */
async function rangedAttack(g: Game, i: number, weapon: number, missile: number): Promise<void> {
  const s = g.s;
  const needsSpace = weapon === 0x1a || weapon === 0x1c || weapon === 0x24 || weapon === 0x13 || weapon === 0x11;
  if (needsSpace && interferes(g, i, 'ranged attack')) return;
  const d = await aim(g, i, g.data.bytes(0x1664, 0x38)[weapon]);
  if (d === 0) return;
  // A dagger, a spear or a throwing axe at a neighbour strikes from the hand (the port's): 1988 threw it at arm's
  // length too - kept, not spent, but flown, and a miss flew on to strike whoever stood beside the foe (missileAt).
  // The same roll to hit, the same blow. Flaming oil is thrown, to burn.
  const beside = combatantAt(g, s.crossX, s.crossY);
  if (d <= 1 && HELD.includes(weapon) && g.combat[i].flags & CF.Player && beside >= 0) {
    s.actors[g.combat[i].actor].b7 = beside;
    await melee(g, i, beside, weapon);
    return;
  }
  if (!g.soundOff) await g.sound.sweep(0x514, 300, 5, 100);
  if (weapon === 0x13) {
    if (s.equipment[weapon] !== 0) s.equipment[weapon]--;
    else unequip(g, g.combat[s.combatTurn].who, weapon);
  }
  const a = s.actors[g.combat[i].actor];
  a.b7 = 0xff;
  const target = combatantAt(g, s.crossX, s.crossY);
  let victim: number;
  let spent: string | null = null;
  if (target > -1) {
    a.b7 = target;
    spent = spendAmmo(g, weapon, d);
    victim = await missileAt(g, i, s.crossX, s.crossY, hitRoll(g, target, i, -s.d588f, weapon), missile);
  } else {
    victim = await missileAt(g, i, s.crossX, s.crossY, true, missile);
  }
  const lx = s.dx;
  const ly = s.dy;
  if (victim > -1) {
    await hitFlash(g, victim);
    if (g.text.win.x !== 0) g.printChar('\n');
    await strike(g, victim, i);
    await report(g, victim, i);
  } else if (target > -1) {
    g.printChar('\n');
    missed(g, target);
    await missFlash(g, i);
  }
  if (weapon === 0x26) await shoot(g, lx, ly, g.combat[i].x, g.combat[i].y, missile);
  if (spent) {
    if (g.text.win.x !== 0) g.printChar('\n');
    g.print(`${spent}\n`);
  }
}

/** COMSUBS_0bf8: a blow at a neighbour. */
export async function melee(g: Game, i: number, target: number, weapon: number): Promise<void> {
  // A monster's blow, in the Standard set, is its own sound, where the party's is the swing (game/cues.ts).
  const swing = (): Promise<void> => g.sound.sweep(400, 0x2ee, 5, 0x96);
  if (!(g.combat[i].flags & CF.Player)) await cue(g, 'Attack', swing);
  else if (!g.soundOff) await swing();
  // The blow's result on a line of its own - no empty line under the aim, which ended its line already.
  if (g.text.win.x !== 0) g.printChar('\n');
  if (hitRoll(g, target, i, -g.s.d588f, weapon)) {
    await hitFlash(g, target);
    await strike(g, target, i);
    await report(g, target, i);
  } else {
    missed(g, target);
    await missFlash(g, i);
  }
}

/**
 * Whether this weapon is the party's last of its kind and the Throw
 * setting says to keep it: it may still be used at arm's length, but it
 * will not be thrown away (the port's).
 */
export function keepsLastThrown(g: Game, weapon: number): boolean {
  return keepsLastThrow(g.options) && THROWN_KEPT.includes(weapon) && g.s.equipment[weapon] === 0;
}

/** COMSUBS_0c52: attack with `weapon` (0xff bare hands): at a neighbour, or at range. */
export async function attackWith(g: Game, i: number, weapon: number): Promise<void> {
  const s = g.s;
  if (weapon >= 0x23) s.d5890 = 1;
  const c = g.combat[i];
  let range: number;
  let missile: number;
  if ((c.flags & CF.Player) === 0) {
    range = g.data.bytes(0x159c, 0x30)[c.who];
    if (range === 1) range = 0;
    missile = g.data.bytes(0x15cc, 0x30)[c.who];
  } else {
    range = weapon !== 0xff ? g.data.bytes(0x1664, 0x38)[weapon] : 0;
    missile = weapon !== 0xff ? g.data.bytes(0x169c, 0x38)[weapon] : 0;
    if (range > 0 && keepsLastThrown(g, weapon)) {
      // The last one is not thrown: it strikes at arm's length instead, and the player is told why.
      range = 0;
      g.print(`Last ${(g.data.table(0x1962, 0x38)[weapon] ?? '').trim()} kept\n`);
    }
  }
  if (range === 0) {
    const d = await aim(g, i, 1);
    const target = combatantAt(g, s.crossX, s.crossY);
    if (d === 0 && g.cancelled) {
      // Backed out of (B): no blow, and the member is asked again - not told of a blow at nothing.
    } else if (d === 0 || target === -1) {
      g.say(0x9a8a); // "Nothing!\n"
    } else {
      s.actors[c.actor].b7 = target;
      await melee(g, i, target, weapon);
    }
  } else {
    await rangedAttack(g, i, weapon, missile);
  }
}

/** Whether what is worn or held there strikes: a weapon, a spiked helm or shield. */
const strikes = (g: Game, item: number): boolean => item !== 0xff && g.data.bytes(0x15fc, 0x38)[item] !== 0;

/** What leaves the hand when it strikes past a neighbour: the dagger, the flaming oil, the spear, the throwing axe. */
const THROWN = [0x10, 0x13, 0x15, 0x16];
/** Of those, what strikes a neighbour from the hand, not thrown (rangedAttack): all but the oil, which is to burn. */
const HELD = [0x10, 0x15, 0x16];
/** The morning star and the halberd: a blow two squares off, flying nowhere (missileAt). */
const REACH = [0x19, 0x22];

const standingFoe = (g: Game, j: number): boolean => {
  if (j < 0 || j >= 0x20) return false;
  const c = g.combat[j];
  return (
    inArena(c.x, c.y) &&
    combatantAt(g, c.x, c.y) === j &&
    (c.flags & (CF.Invisible | CF.Player)) === 0 &&
    onMonsterSide(g, j) &&
    g.s.actors[c.actor].tile !== 0
  );
};

type Bumped = NonNullable<Game['bumpFoe']>;

/**
 * Where a hand's blow goes in an attack begun by walking into a foe (the port's): at that foe while it stands and
 * the hand reaches it; else at the nearest foe the hand reaches, the weaker of two as near; else nowhere, and the
 * hand's blow is skipped. A weapon that leaves the hand reaches only a neighbour, so a blow the player did not choose
 * throws nothing away - but for a foe pointed at past a friend (foePast), which it is thrown at; an arrow, bolt,
 * stone or magic axe goes only where no wall stops it.
 */
export function followUpFoe(g: Game, i: number, weapon: number, walkedInto: Bumped | null, careful = false): Bumped | null {
  const reaches = (j: number, pointed = false): boolean => reachesFoe(g, i, weapon, j, pointed);
  const there = walkedInto ? combatantAt(g, walkedInto.x, walkedInto.y) : -1;
  if (walkedInto && standingFoe(g, there) && reaches(there, walkedInto.pointed === true)) return walkedInto;
  const risky = careful && strays(g, weapon);
  let best = -1;
  for (let j = 0; j < 0x20; j++) {
    if (j === i || !standingFoe(g, j) || !reaches(j) || (risky && strayRisk(g, i, j))) continue;
    if (
      best < 0 ||
      between(g, i, j) < between(g, i, best) ||
      (between(g, i, j) === between(g, i, best) && g.combat[j].hp < g.combat[best].hp)
    )
      best = j;
  }
  return best < 0 ? null : { x: g.combat[best].x, y: g.combat[best].y };
}

/** Whether a miss with `weapon` flies on to land somewhere (missileAt): a shot or a throw - not a blow in the hand. */
function strays(g: Game, weapon: number): boolean {
  // (A dagger, spear or axe Auto aim sends goes only at a neighbour, which it strikes from the hand: no stray.)
  return g.data.bytes(0x1664, 0x38)[weapon] > 0 && !REACH.includes(weapon) && !HELD.includes(weapon) && !keepsLastThrown(g, weapon);
}

/**
 * Whether a missed shot from `i` at foe `j` might strike one of the party's side: it lands on a square about the
 * foe, the archer's own aside (nearSquare), and strikes whoever stands there - a member, charmed or not, or a
 * creature fighting for the party.
 */
export function strayRisk(g: Game, i: number, j: number): boolean {
  const f = g.combat[j];
  for (let k = 0; k < 0x20; k++) {
    const c = g.combat[k];
    if (k === i || k === j || c.flags === 0 || c.flags & CF.Dead || combatantAt(g, c.x, c.y) !== k) continue;
    if (!(c.flags & CF.Player) && onMonsterSide(g, k)) continue;
    if (Math.abs(c.x - f.x) <= 1 && Math.abs(c.y - f.y) <= 1) return true;
  }
  return false;
}

/**
 * Whether combatant `i`'s `weapon` reaches combatant `j`: within its range - a weapon kept in the hand, or one thrown
 * that the player did not point (`pointed`), only a neighbour - and where what it looses must fly there, with no
 * wall in the way. The morning star and halberd strike where they reach, over whatever is between; and a member's
 * dagger, spear or throwing axe strikes a neighbour from the hand (rangedAttack), flying nowhere - a bat over a wall
 * or a tree beside them is struck as it is pointed at.
 */
function reachesFoe(g: Game, i: number, weapon: number, j: number, pointed: boolean): boolean {
  const me = g.combat[i];
  const range = g.data.bytes(0x1664, 0x38)[weapon];
  const kept = range === 0 || keepsLastThrown(g, weapon);
  const d = distance(g.combat[j].x, g.combat[j].y, me.x, me.y);
  const inHand = d <= 1 && HELD.includes(weapon) && (me.flags & CF.Player) !== 0;
  const flies = range > 0 && !REACH.includes(weapon) && !inHand;
  const missile = g.data.bytes(0x169c, 0x38)[weapon];
  return (
    d <= (kept || (!pointed && THROWN.includes(weapon)) ? 1 : range) &&
    (!flies || clearShot(g, me.x, me.y, g.combat[j].x, g.combat[j].y, missile))
  );
}

/** Whether any foe still standing is within reach of combatant `i`'s `weapon`, aimed by the player. */
function foeInReach(g: Game, i: number, weapon: number): boolean {
  for (let j = 0; j < 0x20; j++) if (j !== i && standingFoe(g, j) && reachesFoe(g, i, weapon, j, true)) return true;
  return false;
}

/**
 * Whether member combatant `i` can strike one of `targets` from where they stand, as Attack would reach it
 * (attackEach): a weapon of theirs reaching it - a shot or a throw only along a clear line - or, with none in hand,
 * a target beside them for the bare hands. Auto combat's choice between striking and moving (autocombat.ts), with
 * the foes it would strike - a friend charmed against the party among them with the Classic rules.
 */
export function canStrike(g: Game, i: number, targets: number[]): boolean {
  const c = g.combat[i];
  const hands = [0, 2, 3].map((h) => g.s.members[c.who].equips[h]).filter((w) => strikes(g, w));
  if (!hands.length) return targets.some((j) => distance(g.combat[j].x, g.combat[j].y, c.x, c.y) <= 1);
  // Attack lets a hand that reaches no foe stand aside only while another reaches one it counts (attackEach,
  // standingFoe: never one of the party). With none - the only foe a friend charmed against the party, with the
  // Classic rules - each hand is asked in turn, and the first must reach: a spiked helm asked first, a throwing axe
  // the hand that reached, had its aim backed out of for ever.
  if (!hands.some((w) => foeInReach(g, i, w))) return targets.some((j) => reachesFoe(g, i, hands[0], j, true));
  return hands.some((w) => targets.some((j) => reachesFoe(g, i, w, j, true)));
}

/**
 * The foe struck past a friend a member walks into (the port's): the first foe along that line beyond them, over
 * other members, a wall ending the line - if one of the member's hands reaches it; else none.
 */
export function foePast(g: Game, i: number, dx: number, dy: number): Bumped | null {
  const c = g.combat[i];
  if (!(c.flags & CF.Player)) return null;
  const hands = [0, 2, 3].map((h) => g.s.members[c.who].equips[h]).filter((w) => strikes(g, w));
  const far = Math.max(0, ...hands.map((w) => g.data.bytes(0x1664, 0x38)[w]));
  for (let k = 2; k <= far; k++) {
    const x = c.x + dx * k;
    const y = c.y + dy * k;
    if (!inArena(x, y)) return null;
    const j = combatantAt(g, x, y);
    if (standingFoe(g, j)) {
      const past = { x, y, pointed: true };
      return hands.some((w) => followUpFoe(g, i, w, past) === past) ? past : null;
    }
    if (j < 0 && !passable(g, x, y)) return null;
  }
  return null;
}

/** COMSUBS_0d3c: attack with one of the hands' weapons; whether it did (a hand with no weapon, or armour, does not). */
async function attackHand(g: Game, weapon: number, weapons: number): Promise<boolean> {
  const s = g.s;
  if (!strikes(g, weapon)) return false;
  if (weapons > 1) s.d5890 = s.d588f = 0;
  // Each blow is its weapon's name and what it did (the port's; the 1988 game's "Attack-Aim!" before each): the
  // name after the prompt's arrow, or on a line of its own - never under an empty one - and the result below it.
  // Who strikes is marked on the map, and where, by the aim.
  if (g.text.win.x > 1) g.printChar('\n');
  // With what it has left to spend, as the shot or throw is made: "Bow x23:", "Spear x2:" (the port's).
  g.print(weaponLabel(g, weapon));
  s.weapon = weapon;
  await attackWith(g, s.combatTurn, weapon);
  return true;
}

/** COMSUBS_0d96: the Attack command: bare hands, or each weapon in turn; a foe walked into is let go at its end. */
export async function attackCommand(g: Game, i: number, weapons: number): Promise<void> {
  try {
    await attackEach(g, i, weapons);
  } finally {
    g.bumpFoe = null;
    g.autoAim = false;
    g.aimFrom = null;
  }
}

/**
 * Y's attack with nothing it can strike (the port's): said, and the turn given back - where it was aimed by hand,
 * with no foe the crosshair could reach, so that it could only be backed out of.
 */
function nothingInReach(g: Game): void {
  if (g.text.win.x > 1) g.printChar('\n');
  g.print('Out of reach!\n'); // a line of the log's fifteen
  g.cancelled = true;
}

/**
 * Auto aim's X with every foe in reach a risk to the party (the port's): a missed shot strays to a square about the
 * foe (missileAt), and strikes whoever stands there. Said, and the turn given back; X again, straight away, shoots.
 */
function allyAtRisk(g: Game, i: number): void {
  if (g.text.win.x > 1) g.printChar('\n');
  const c = g.combat[i];
  g.print(`${c.flags & CF.Player ? g.s.members[c.who].name : 'Ally'} might hit ally, confirm?\n`);
  g.allyWarned = i;
  g.cancelled = true;
}

async function attackEach(g: Game, i: number, weapons: number): Promise<void> {
  const s = g.s;
  // Auto aim passes over a foe a stray shot might hit a friend beside (strayRisk) - but for the X that confirms it.
  const careful = g.allyWarned !== i;
  g.allyWarned = -1;
  if ((g.combat[i].flags & CF.Player) === 0 || weapons === 0) {
    // Y's bare hands (a member with no weapon), Auto aim on: at the foe beside them, the weakest of those as near, as
    // a weapon's blow goes - or "Out of reach!". (A creature on the party's side aims its own, as ever.)
    if (g.autoAim && !g.bumpFoe && g.combat[i].flags & CF.Player) {
      const me = g.combat[i];
      let best = -1;
      for (let j = 0; j < 0x20; j++)
        if (j !== i && standingFoe(g, j) && distance(g.combat[j].x, g.combat[j].y, me.x, me.y) <= 1)
          if (best < 0 || g.combat[j].hp < g.combat[best].hp) best = j;
      if (best < 0) return nothingInReach(g);
      g.bumpFoe = { x: g.combat[best].x, y: g.combat[best].y };
    }
    s.weapon = 0xff;
    // Bare hands, named as a weapon is.
    const hands = g.t(0x6db2); // "bare hands"
    if (g.text.win.x > 1) g.printChar('\n');
    g.print(`${hands.charAt(0).toUpperCase()}${hands.slice(1)}:`);
    await attackWith(g, i, 0xff);
    return;
  }
  const m = s.members[g.combat[i].who];
  // A hand's aim backed out of ends the command there (the port's). If no hand has struck yet, the turn is not spent
  // (playerTurn asks again); if one has, it is - backing out of the second blow is not a way to a free first one.
  // Auto aim (the port's): a foe walked into takes every hand's blow where followUpFoe sends it from that foe, without
  // asking; Y the same, from no foe - each blow at the nearest it reaches - unless none reaches any, when it is said
  // so and the turn is not spent (nothingInReach).
  // Off, a foe walked into is only where the crosshair starts.
  const on = g.options.autoAim;
  const walkedInto = on ? g.bumpFoe : null;
  if (!on && g.bumpFoe) {
    g.aimFrom = g.bumpFoe;
    g.bumpFoe = null;
  }
  const reached = (wary: boolean): boolean =>
    [0, 2, 3].some((h) => strikes(g, m.equips[h]) && followUpFoe(g, i, m.equips[h], null, wary) !== null);
  const auto = !walkedInto && g.autoAim && reached(careful);
  if (g.autoAim && !walkedInto && !auto) return careful && reached(false) ? allyAtRisk(g, i) : nothingInReach(g);
  // Once a hand has struck, a hand after it with no foe left in its reach is not asked where to strike (the port's):
  // the foe the first blow killed was the only one near.
  let struck = false;
  // The foe a blow aimed by hand struck: with Auto aim, the hands after it strike it too while it stands in reach.
  let aimedAt = -1;
  // A hand whose weapon reaches no foe stands aside while another's does (a spiked helm with a bow in hand, the foes
  // out of the helm's reach): asked first, its aim could only be backed out of, which ended the command before the
  // bow was ever raised - and auto combat backed out of it for ever.
  const someReach = [0, 2, 3].some((h) => strikes(g, m.equips[h]) && foeInReach(g, i, m.equips[h]));
  for (const hand of [0, 2, 3]) {
    const weapon = m.equips[hand];
    if ((struck || someReach) && strikes(g, weapon) && !foeInReach(g, i, weapon)) continue;
    if ((walkedInto || auto) && strikes(g, weapon)) {
      const foe = followUpFoe(g, i, weapon, walkedInto, careful);
      if (!foe) continue;
      g.bumpFoe = foe;
    } else if (on && aimedAt >= 0 && strikes(g, weapon) && standingFoe(g, aimedAt) && reachesFoe(g, i, weapon, aimedAt, true)) {
      g.bumpFoe = { x: g.combat[aimedAt].x, y: g.combat[aimedAt].y, pointed: true };
    }
    const byHand = g.bumpFoe === null;
    g.cancelled = false;
    const attacked = await attackHand(g, weapon, weapons);
    if (g.cancelled) {
      if (struck) g.cancelled = false;
      return;
    }
    if (attacked && byHand && aimedAt < 0) aimedAt = combatantAt(g, s.crossX, s.crossY);
    g.bumpFoe = null;
    struck ||= attacked;
  }
}

// --- Missiles ------------------------------------------------------------------------------

/** COMSUBS_0e26: the missile's path in pixels, a point per step, ended by 0xff. */
function missilePath(x1: number, y1: number, x2: number, y2: number): [number[], number[]] {
  const xs: number[] = [x1];
  const ys: number[] = [y1];
  let sx = 1;
  let sy = 1;
  let budget = 0x148;
  let slope = x2 !== x1 ? Math.trunc(((y2 - y1) * 100) / (x2 - x1)) : 0x4b00;
  if (slope < 0) slope = -slope;
  if (x2 < x1) sx = -1;
  if (y2 < y1) sy = -1;
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  let acc = slope;
  while (dx > 0 || dy > 0) {
    while (acc > 0 && dy > 0) {
      acc -= 100;
      y1 += sy;
      ys.push(y1);
      dy--;
      xs.push(x1);
      if (--budget === 0) break;
    }
    if (budget === 0) break;
    dx--;
    acc += slope;
    x1 += sx;
    ys.push(y1);
    xs.push(x1);
    if (--budget === 0) break;
  }
  xs.push(0xff);
  ys.push(0xff);
  return [xs, ys];
}

/** COMSUBS_0f4a: the missile at (x, y): a streak, a ball, a star, sparks of a colour, or a flash (D_2188, D_21ba). */
function drawMissile(g: Game, x: number, y: number, frame: number, kind: number, xs: number[], ys: number[], at: number): void {
  const d = g.draw;
  let sx = 1;
  let sy = 1;
  const shapes = g.data.sbytes(0x2188, 0x32);
  let ai = kind === 2 ? 0 : 0x10;
  let bi = ai;
  switch (frame) {
    case 1:
      bi++;
      break;
    case 2:
      ai++;
      sx = -1;
      break;
    case 3:
      bi++;
      sx = sy = -1;
      break;
    case 4:
      ai++;
      sy = -1;
      break;
  }
  d.pen = Colour.brightWhite;
  let sparks = -1;
  switch (kind) {
    case 0:
      for (let k = 0; k < 9; k++) {
        const j = at - 4 + k;
        if (j < 0 || xs[j] === 0xff) break;
        d.line(xs[j], ys[j], xs[j] + 1, ys[j]);
      }
      break;
    case 1:
      d.line(x - 1, y - 2, x + 1, y - 2);
      d.line(x - 2, y - 1, x + 2, y - 1);
      d.line(x - 2, y, x + 2, y);
      d.line(x - 2, y + 1, x + 2, y + 1);
      d.line(x - 1, y + 2, x + 1, y + 2);
      break;
    case 2:
    case 7: {
      const n = kind === 2 ? 4 : 7;
      for (let k = 0; k < n; k++) {
        const x1 = shapes[ai] * sx + x;
        ai += 2;
        const y1 = shapes[bi] * sy + y;
        bi += 2;
        const x2 = shapes[ai] * sx + x;
        ai += 2;
        const y2 = shapes[bi] * sy + y;
        bi += 2;
        d.line(x1, y1, x2, y2);
      }
      if (kind === 7) {
        for (let k = 0; k < 3; k++) {
          d.plot(shapes[ai] * sx + x, shapes[bi] * sy + y);
          ai += 2;
          bi += 2;
        }
      }
      break;
    }
    case 3:
      sparks = Colour.red + 8;
      break;
    case 4:
      sparks = Colour.blue + 8;
      break;
    case 5:
      sparks = Colour.green + 8;
      break;
    case 6:
      sparks = Colour.magenta + 8;
      break;
  }
  if (sparks > -1) {
    const offs = g.data.bytes(0x21ba, 0x10);
    let fx = -1;
    let fy = 1;
    for (let k = 0; k < 0x30; k++) {
      const ox = offs[g.random(0, 0xf)];
      const oy = offs[g.random(0, 0xf)];
      if (g.random(0, 1) !== 0) fx = -fx;
      if (g.random(0, 1) !== 0) fy = -fy;
      d.pen = sparks;
      d.plot(ox * fx + x, oy * fy + y);
    }
  }
}

/** ULTIMA_3fb4: the viewport cell a pixel is in, in (dx, dy), or -1 off the map. */
export function cellAt(g: Game, px: number, py: number): void {
  [g.s.dx, g.s.dy] = cellOf(px, py);
}
const cellOf = (px: number, py: number): [number, number] =>
  px < 8 || px > 0xb7 || py < 8 || py > 0xb7 ? [-1, -1] : [Math.trunc((px - 8) / 0x10), Math.trunc((py - 8) / 0x10)];

/** ULTIMA_3f6e: a missile passes over this viewport cell's tile (D_6a14). */
export function passable(g: Game, x: number, y: number): boolean {
  const t = g.view[y * 32 + x];
  return ((0x80 >> (t & 7)) & g.data.bytes(0x6a14, 0x20)[t >> 3]) !== 0;
}

/**
 * COMSUBS_12de: a missile of `kind` flies from cell (x1, y1) to (x2, y2)
 * over the map; false (and where it stopped in (dx, dy)) if a wall stops it.
 */
export async function shoot(g: Game, x1: number, y1: number, x2: number, y2: number, kind: number): Promise<boolean> {
  const s = g.s;
  const d = g.draw;
  d.savePage();
  const { xs, ys, step } = flight(g, x1, y1, x2, y2, kind);
  let at = kind === 0 ? 4 : 0;
  let frame = 0;
  // The path's last point (its 0xff end before it): the square aimed at's middle.
  const last = xs.indexOf(0xff) - 1;
  while (xs[at] !== 0xff && at < xs.length) {
    frame = (frame & 3) + 1;
    cellAt(g, xs[at], ys[at]);
    if (s.dx === -1) break;
    drawMissile(g, xs[at], ys[at], frame, kind, xs, ys, at);
    await g.p.sleep(16);
    const bx = (xs[at] & 0xf8) - 8;
    const by = ys[at] - 8;
    g.p.fx.transfer(1, 0, Math.max(0, bx), Math.max(0, by), Math.min(319, bx + 0x17), Math.min(199, by + 0x17));
    if (at === last) break;
    at += step;
    if (at >= xs.length || xs[at] === 0xff) {
      // (The port's: the original drew a frame every `step` points and stopped at the last one short of the end -
      // up to a third of a square short, on a slant, where a step counts both axes' pixels. One frame more, on the
      // square aimed at; what the missile hits is as it was.)
      at = last;
      continue;
    }
    if (!passable(g, s.dx, s.dy) && (x1 !== s.dx || y1 !== s.dy)) return false;
  }
  return true;
}

/** A missile's flight in pixels (missilePath's), and how many of its points each drawn step passes. */
function flight(g: Game, x1: number, y1: number, x2: number, y2: number, kind: number): { xs: number[]; ys: number[]; step: number } {
  const s = g.s;
  const [xs, ys] = missilePath(x1 * 16 + 16, y1 * 16 + 16, x2 * 16 + 16, y2 * 16 + 16);
  const step = s.mapId !== 0 && s.mapId < 0x21 ? 6 : kind === 7 ? 8 : 0xd;
  return { xs, ys, step };
}

/** Whether a missile from cell (x1, y1) would reach (x2, y2), no wall stopping it: shoot's flight, undrawn. */
export function clearShot(g: Game, x1: number, y1: number, x2: number, y2: number, kind: number): boolean {
  const { xs, ys, step } = flight(g, x1, y1, x2, y2, kind);
  for (let at = kind === 0 ? 4 : 0; at < xs.length && xs[at] !== 0xff; ) {
    const [cx, cy] = cellOf(xs[at], ys[at]);
    if (cx === -1) break;
    at += step;
    if (at >= xs.length || xs[at] === 0xff) break;
    if (!passable(g, cx, cy) && (x1 !== cx || y1 !== cy)) return false;
  }
  return true;
}

// --- The arena's ways ------------------------------------------------------------------------

/** COMBAT_111a: stepping on a trigger square changes up to two others (secret doors in dungeon rooms and the like). */
export function trigger(g: Game, x: number, y: number): boolean {
  const s = g.s;
  if ((s.combatFlags & 0x80) === 0 && (s.combatFlags & 2) === 0) return false;
  const m = g.combatMap;
  let any = false;
  for (let k = 0; k < 8; k++) {
    const tx = 8 * 32 + 11 + k;
    const ty = 8 * 32 + 19 + k;
    if (m[tx] === x && m[ty] === y) {
      m[tx] = m[ty] = 0xff;
      const tile = m[0 * 32 + 11 + k];
      const x1 = m[9 * 32 + 11 + k];
      const y1 = m[9 * 32 + 19 + k];
      const x2 = m[10 * 32 + 11 + k];
      const y2 = m[10 * 32 + 19 + k];
      if (x1 < 0xb && y1 < 0xb) m[y1 * 32 + x1] = tile;
      if (x2 < 0xb && y2 < 0xb) m[y2 * 32 + x2] = tile;
      any = true;
    }
  }
  if (any) updateFrame(g);
  return any;
}

/** COMBAT_1236: remove a combatant (negative: -index - 1) or an actor (positive: index + 1). */
export function removeCombatant(g: Game, n: number): void {
  let actor: number;
  if (n < 0) {
    const c = g.combat[-n - 1];
    actor = c.actor;
    c.clear();
    g.charmedBy.delete(-n - 1); // one charmed who leaves the field - escapes, or is taken off it - is charmed no more
  } else {
    actor = n - 1;
  }
  const a = g.s.actors[actor];
  a.y = a.z = a.b5 = a.tile = a.anim = a.x = 0;
}

/** SJOG_1b6c: count the sides: (dx) members standing on the monsters' side, (dy) the party's side. */
function countSides(g: Game): void {
  const s = g.s;
  s.dx = s.dy = 0;
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    if (c.flags !== 0 && (c.flags & CF.Dead) === 0) {
      if (onMonsterSide(g, i)) s.dx++;
      else s.dy++;
    }
  }
}

/**
 * SJOG_21ce: the first charmed member passes out, the charm broken; returns it, or -1. With the Classic rules every
 * charmed member does, as the Apple II's MAIN.COMBAT has it ($A546 runs through every slot); the first is returned.
 */
export function passOut(g: Game): number {
  const s = g.s;
  let first = -1;
  for (let i = 0; i < 6; i++) {
    const c = g.combat[i];
    if ((c.flags & CF.Charmed) !== 0 && (c.flags & CF.Player) !== 0) {
      c.flags &= ~CF.Charmed;
      g.charmedBy.delete(i);
      g.print(s.members[c.who].name);
      g.say(0x8f56); // " passes out!"
      if (!g.soundOff) void g.sound.pulse(0xc1c, 1, 30000, 1000, 2);
      unequip(g, c.who, 0x23);
      putToSleep(g, i);
      released(g, i);
      if (first < 0) first = i;
      if (easedRules(g)) return first;
    }
  }
  return first;
}

/** SJOG_1bb2: a member leaves the arena (all by the same side, where it matters). */
async function leaveArena(g: Game, i: number, dir: number): Promise<boolean> {
  const s = g.s;
  if ((s.partyTile & 0xf8) === 0x20) {
    g.say(0x8e76); // "\nStay with ship!\n"
    return false;
  }
  if (g.combat[i].flags & CF.Player) {
    if (s.exitDir === 0) s.exitDir = dir;
    else if (dir !== s.exitDir && s.combatFlags & 0x80) {
      g.say(0x8e88); // "\nAll must use the same exit!\n"
      if (!g.soundOff) void g.sound.tone(0xa5, 200);
      return false;
    }
  }
  s.blink = 1;
  countSides(g);
  g.say(s.dx === 0 ? 0x8ea6 : 0x8eae); // "Leave!\n" : "Escape!\n"
  await cue(g, 'Withdraw', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
  s.activeMember = 0xff;
  removeCombatant(g, -i - 1);
  drawVitals(g);
  updateFrame(g);
  return true;
}

/** SJOG_1c56: a member steps (or leaves the arena at its edge). */
async function movePlayer(g: Game, i: number, key: number): Promise<boolean> {
  const s = g.s;
  const c = g.combat[i];
  const [dx, dy, text] = (
    {
      [K.Up]: [0, -1, 0x8eb8],
      [K.Down]: [0, 1, 0x8ec0],
      [K.Right]: [1, 0, 0x8ec8],
      [K.Left]: [-1, 0, 0x8ece],
    } as Record<number, [number, number, number]>
  )[key];
  g.text.moving = true; // a move: said again, it folds with a count (text.ts)
  g.say(text);
  const x = c.x + dx;
  const y = c.y + dy;
  if (x > 0xa || y > 0xa || x < 0 || y < 0) return leaveArena(g, i, key);
  const pad = g.options.input === 'controller';
  // A corpse is walked into and searched, not over (bumpAct.ts) - and with the eased rules, where loot is walked over,
  // a chest or a thing lying there is walked into to be dealt with: what a bump stops at.
  const lying = pad && combatantAt(g, x, y) < 0 ? thingAt(g, x, y) : 0;
  const stopsAt = corpseBlocks(lying) || (isLoot(lying) && eased(g.options));
  // While foes stand, such a thing is stepped over, not stopped at (bumpAct.ts foesAbout).
  if (arenaFree(g, s.actors[c.actor].tile, x, y) && !(stopsAt && !foesAbout(g, 'combat'))) {
    s.actors[c.actor].x = c.x = x;
    s.actors[c.actor].y = c.y = y;
    if (!g.soundOff) void g.sound.noise(1, 0x19, 1000);
    if (s.combatFlags & 0x82) trigger(g, x, y);
    return true;
  }
  // Walking into a foe strikes it (the ultima3 port's controller play): the attack is given as if chosen, and
  // its aim is already on the one walked into.
  const at = combatantAt(g, x, y);
  if (g.options.input === 'controller' && at >= 0 && at < 0x20 && onMonsterSide(g, at) && !(g.combat[at].flags & CF.Dead)) {
    if (g.text.win.x !== 0) g.printChar('\n'); // the move's line ended already: no empty line after it
    g.bumpFoe = { x, y };
    queueKeys(0x41);
    return false;
  }
  // Walking into a friend strikes past them, at the first foe along the line a hand reaches (foePast).
  const past =
    g.options.input === 'controller' && at >= 0 && at < 0x20 && g.combat[at].flags & CF.Player && !onMonsterSide(g, at)
      ? foePast(g, i, dx, dy)
      : null;
  if (past) {
    if (g.text.win.x !== 0) g.printChar('\n'); // the move's line ended already: no empty line after it
    g.bumpFoe = past;
    queueKeys(0x41);
    return false;
  }
  // Walking into the strange walls with the Sceptre wields it (bumpAct.ts): they dissolve round the member.
  if (pad && at < 0 && (tileAt(g, x, y) & 0xf0) === T.T70 && s.sceptre !== 0 && c.flags & CF.Player) {
    g.say(0x6e42); // "Use"
    if (g.text.win.x !== 0) g.printChar('\n'); // the move's line ended already: no empty line after it
    await wieldSceptre(g);
    return true;
  }
  // Walking into a chest, a thing lying there, a corpse or rocks: what there is to do with it (bumpAct.ts).
  if (pad && at < 0) {
    const command = bumpCommand(g, 'combat', thingAt(g, x, y), tileAt(g, x, y), x, y);
    if (command !== 0) {
      if (g.text.win.x !== 0) g.printChar('\n'); // the move's line ended already: no empty line after it
      bumpInto(g, command, key);
      return false;
    }
  }
  g.say(0x8ed4); // "Blocked!\n"
  if (!g.soundOff) void g.sound.tone(0xa5, 200);
  g.p.flushKeys();
  return false;
}

/**
 * The tile of a thing lying at (x, y) of the arena - a chest, gold, a corpse - that is no combatant; 0 for none. Where
 * more than one lies there (two fell on the one square, and one of them was searched to gold), the one the map shows:
 * a corpse is drawn only where nothing else is (world.ts overlayActors), so the other is what the bump is for.
 */
export function thingAt(g: Game, x: number, y: number): number {
  let corpse = 0;
  for (let a = 1; a < 0x20; a++) {
    const actor = g.s.actors[a];
    if (actor.tile === 0 || actor.x !== x || actor.y !== y) continue;
    if (g.combat.some((c) => c.flags !== 0 && !(c.flags & CF.Dead) && c.actor === a)) continue;
    if (actor.tile === 0x1f) corpse = actor.tile;
    else return actor.tile;
  }
  return corpse;
}

/** SJOG_1d6a: Klimb in combat: ladders out of a dungeon room; over low walls. */
export async function klimbInCombat(g: Game): Promise<boolean> {
  const s = g.s;
  g.say(0x8ede); // "Klimb-"
  // A way already given - the rocks walked into, or auto combat's climb over them (bumpAct.ts, autocombat.ts) - is
  // climbed that way, though the member stands on a ladder: only Klimb asked for alone goes up or down it.
  const toward = g.bumpDir !== 0;
  let t = toward ? T.T4C : tileAt(g, s.x, s.y);
  if (s.combatFlags & 2 && t === T.LadderUp && g.bb16 !== 0) {
    g.say(0x8ee6); // "U/D-"
    for (;;) {
      const k = await upOrDown(g);
      if (k === K.Down || k === 0x44) {
        t = T.LadderDown;
        break;
      }
      if (k === K.Up || k === 0x55) break;
      // Neither (B out of the box, the space bar): passed, and no turn spent, as a direction passed is - where the box
      // came up again and again, and only leaving the room by one ladder or the other ended it.
      if (k === K.Space || k === K.Escape) {
        g.say(0xa2a0); // "Pass\n"
        g.cancelled = true;
        return true;
      }
    }
  }
  if (t === T.LadderUp) {
    g.say(0x8eec); // "Up!\n"
    return leaveArena(g, s.combatTurn, 5);
  }
  if ((t === T.T86 && s.combatFlags & 0x80) || t === T.LadderDown) {
    g.say(0x8ef2); // "Down!\n"
    return leaveArena(g, s.combatTurn, 6);
  }
  if (await selectDirection(g)) {
    const x = s.x + s.dx;
    const y = s.y + s.dy;
    const { actorTileAtRev } = await import('./actors.ts');
    if (tileAt(g, x, y) === T.T4C && actorTileAtRev(g, x, y, 0) === 0) {
      const c = g.combat[s.combatTurn];
      s.actors[c.actor].x = c.x = x;
      s.actors[c.actor].y = c.y = y;
      trigger(g, x, y);
    } else {
      g.say(0x8efa); // "What?\n"
      return false;
    }
  }
  return true;
}

/** SJOG_1ea4: stepping before the Mirror of Truth in the Codex's chamber. */
function checkMirror(g: Game): void {
  const s = g.s;
  const c = g.combat[s.combatTurn];
  if (c.flags !== 0 && (c.flags & CF.Dead) === 0 && c.y === 2 && (g.actorMap[c.x + 0x10] & 0xfc) === 0x3c) {
    s.exitDir = 0x4d;
    g.printChar('\n');
    sayName(g, s.combatTurn);
    g.say(0x8f02); // " is absorbed!\n"
    void cue(g, 'Absorbed', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
    s.activeMember = 0xff;
    drawVitals(g);
    removeCombatant(g, -s.combatTurn - 1);
    updateFrame(g);
  }
}

/** SJOG_1f26: commands that have no use in combat. */
async function notInCombat(g: Game, name: number, how: number): Promise<number> {
  g.say(name);
  g.say([0, 0x8f12, 0x8f1a, 0x8f24][how]); // " what?", "-Not here", "-Funny, no response!"
  g.printChar('\n');
  if (!g.soundOff) {
    await g.sound.tone(0xdc, 0x96);
    await g.sound.tone(0x96, 0x96);
  }
  return 1;
}

/** SJOG_1f7a: set the active player in combat. */
function setActiveInCombat(g: Game, m: number): boolean {
  const s = g.s;
  g.say(0x8f3a); // "Set active plr:\n"
  let ok = false;
  let i = 0;
  for (; i < 0x20; i++) {
    const f = g.combat[i].flags;
    if (f & CF.Player && !onMonsterSide(g, i) && g.combat[i].who === m) {
      ok = (f & (CF.Dead | CF.Asleep | CF.F4)) === 0;
      break;
    }
  }
  if (ok) {
    s.activeMember = m;
    sayName(g, i);
    g.printChar('\n');
    drawVitals(g);
  } else {
    g.say(0x8f4c); // "Invalid!\n"
  }
  return ok;
}

/** SJOG_2012: the end of a combatant's turn: rings, fading fields, the protection spell. */
function turnEnds(g: Game): void {
  const s = g.s;
  ringTurn(g, s.combatTurn);
  fadeFields(g);
  if (s.protection !== 0 && s.protection !== 0xff && --s.protection === 0) {
    s.icon = 0;
    g.vitalsDirty = 1;
  }
}

/**
 * CMDS_17ec: Escape: all flee the arena (not while there are foes, unless it is won; never in a dungeon room). A won
 * field is left as a member walking off it leaves ("Leave!", leaveArena) - the port's: the original echoed its
 * command, "Escape!", for the same going.
 */
async function escape(g: Game): Promise<number> {
  const s = g.s;
  let stay = false;
  let anyone = false;
  for (const c of g.combat) {
    if ((c.flags & (CF.Player | CF.Dead)) === CF.Player) {
      anyone = true;
      break;
    }
  }
  const leave = anyone && !(s.combatFlags & 0x80) && s.battleWon !== 0;
  if (!leave) g.say(0x4574); // "Escape"
  if (anyone) {
    if (s.combatFlags & 0x80) {
      g.say(0x457b); // "-Not here!\n"
      stay = true;
    } else if (s.battleWon === 0) {
      g.say(0x4587); // "-Not yet!\n"
      stay = true;
    }
  }
  if (!stay) {
    if (leave)
      g.say(0x8ea6); // "Leave!\n"
    else g.printChar('!');
    for (let i = 0; i < 0x20; i++) {
      if (g.combat[i].flags !== 0) {
        removeCombatant(g, -i - 1);
        updateFrame(g);
      }
    }
    for (let i = 0; i < 0x20; i++) {
      if (s.actors[i].tile !== 0) {
        removeCombatant(g, i + 1);
        updateFrame(g);
      }
    }
    await cue(g, 'Withdraw', () => g.sound.sweep(0x4b0, 2000, 1, 0x28));
  }
  g.vitalsDirty = 1;
  return stay ? 1 : 0;
}

// --- Terrain -------------------------------------------------------------------------------------

/** COMBAT_1b1e: what the square does at the end of a turn: fire and lava burn, swamp poisons, fields act. */
async function squareEffect(g: Game, i: number): Promise<void> {
  const s = g.s;
  const c = g.combat[i];
  const t = g.combatMap[c.y * 32 + c.x];
  let kind = 0;
  if (t === 0x8f || t === 0xbc) kind = 100;
  if (t === 4) kind = 50;
  if (kind === 0) {
    for (let a = 0; a < 0x20; a++) {
      if (a === c.actor || c.x !== s.actors[a].x || c.y !== s.actors[a].y) continue;
      const at = s.actors[a].tile;
      if (at === 0xea) kind = 100;
      if (at === 0xe8) kind = 50;
      if (at === 0xe9) kind = 150;
      if (kind !== 0) break;
    }
  }
  switch (kind) {
    case 150:
      putToSleep(g, i);
      break;
    case 100:
      void cue(g, 'Immolate');
      await hitFlash(g, i, true); // a fire field
      await damage(g, i, g.rng.upTo(10));
      await report(g, i, 0xff);
      g.vitalsDirty = 1;
      break;
    case 50:
      if (s.actors[c.actor].tile < 0x80) {
        await poison(g, i, -1);
        await hitFlash(g, i, true); // a poison field
      }
      break;
  }
}

/** COMBAT_1c66: the swallowed may be spat out. */
async function regurgitate(g: Game, i: number): Promise<void> {
  const s = g.s;
  const c = g.combat[i];
  if (roll(g) >= c.dex) return;
  g.print(c.flags & CF.Player ? s.members[c.who].name : creatureName(g, c.who));
  g.say(0x6f5e); // " regurgitated!\n"
  if (!g.soundOff) await g.sound.noise(1, 7000, 600);
  c.flags &= ~CF.F4;
  s.actors[c.actor].anim = s.actors[c.actor].tile;
}

// --- The player's turn -------------------------------------------------------------------------

/** COMBAT_05b6: a weapon's name for "armed with". */
function armedWith(g: Game, weapon: number, list: string[]): boolean {
  if (weapon === 0xff || g.data.bytes(0x15fc, 0x38)[weapon] === 0) return false;
  list.push(g.data.table(0x17f6, 0x30)[weapon] ?? '');
  return true;
}

/** COMBAT_063e: a member's turn: the command. */
async function playerTurn(g: Game): Promise<void> {
  const s = g.s;
  const c = g.combat[s.combatTurn];
  s.x = c.x;
  s.y = c.y;
  const who = c.who;
  if (g.autoKill && devMode()) {
    // The development build's auto kill (cheats.ts; devMode.ts): the fight is over before the party lifts a hand.
    const { slayAll } = await import('./cheats.ts');
    if ((await slayAll(g)) > 0) {
      turnEnds(g);
      return;
    }
  }
  let key = 0xff;
  if (s.activeMember !== 0xff && ((c.flags & CF.Player) === 0 || s.activeMember !== who)) {
    turnEnds(g);
    return;
  }
  const m = s.members[who];
  if (c.flags & CF.Player) {
    // Switch Weapon's memory (switchWeapon.ts): what the member holds as their turn comes.
    const { rememberArms } = await import('./switchWeapon.ts');
    rememberArms(g, who);
  }
  if (c.flags & CF.Player && (m.equips[2] === 0x23 || m.equips[3] === 0x23)) {
    // The Chaos Sword's wielder is not his own (item 0x23, in either hand) - the sword the charmer, its will its own.
    charm(g, s.combatTurn, 'bound');
    s.activeMember = 0xff;
    g.vitalsDirty = 1;
    await monsterTurn(g);
  } else {
    if (c.flags & CF.Player) markTurn(g, who, true);
    if (g.vitalsDirty !== 0) {
      drawVitals(g);
      g.vitalsDirty = 0;
    }
    let again: boolean;
    do {
      again = false;
      // On a line of its own - a new line only where the last did not end with one, as at the prompt (frame.ts
      // commandPrompt): the 1988 game's newline here left an empty line between one member's turn and the next.
      if (g.text.win.x !== 0) g.printChar('\n');
      sayName(g, s.combatTurn);
      const arms: string[] = [];
      let weapons = 0;
      if (c.flags & CF.Player) {
        g.say(0x6da4); // ", armed with "
        weapons += armedWith(g, m.equips[0], arms) ? 1 : 0;
        weapons += armedWith(g, m.equips[2], arms) ? 1 : 0;
        weapons += armedWith(g, m.equips[3], arms) ? 1 : 0;
        if (weapons === 0) arms.push(g.t(0x6db2)); // "bare hands"
      }
      g.print(arms.join(g.t(0x6da0)) + g.t(0x6dbe));
      let done = false;
      while (!done) {
        commandPrompt(g);
        if (c.flags & CF.F4) {
          g.say(0x6dc0); // "ARGH!\n"
          if (!g.soundOff) await g.sound.noise(0x28, 3000, 500);
          await regurgitate(g, s.combatTurn);
          done = true;
        } else if (c.flags & CF.Asleep) {
          // (The eased rules: one in ten, where 1988 woke a member one turn in sixteen.)
          if (easedRules(g) ? g.random(0, 9) === 0 : g.random(0, 0xff) < 0x10) wake(g, s.combatTurn);
          g.say(0x6dc8); // "Zzzzz...\n"
          done = true;
        } else {
          key = await getCommandKey(g, 'combat');
          g.cancelled = false;
          done = true;
          again = false;
          const misc = async (name: number, how: number): Promise<void> => {
            again = (await notInCombat(g, name, how)) !== 0;
          };
          const onlyPlayers = async (name: number, run: () => Promise<unknown>): Promise<void> => {
            g.say(name);
            if (c.flags & CF.Player) await run();
            else {
              g.say(0x6d98); // "Can't!\n"
              again = true;
            }
          };
          switch (key) {
            case K.CtrlB:
              g.say(0x6dd2);
              g.keyBuffer = !g.keyBuffer;
              g.say(g.keyBuffer ? 0x6ddc : 0x6de0);
              done = false;
              break;
            case K.CtrlS:
              g.say(0x6de4);
              g.say(g.soundOff ? 0x6dec : 0x6df2);
              g.soundOff = !g.soundOff;
              done = false;
              break;
            case 0x41:
              await attackCommand(g, s.combatTurn, weapons);
              break;
            case 0x43:
              g.say(0x6df6); // "Cast...\n"
              again = true;
              if (c.flags & CF.Player) {
                if (!interferes(g, s.combatTurn, 'casting')) {
                  s.d588f = s.d5890 = 1;
                  again = false;
                  if (s.icon === 0x4e || (s.crown === 0 && s.savedMapId === 0x12)) {
                    g.say(0x6e00); // "Absorbed!\n"
                    if (!g.soundOff) void g.sound.pulse(0x2648, 1, 28000, 1000, 2);
                  } else {
                    await castCommand(g);
                  }
                }
              } else {
                g.say(0x6e0c); // "Can't!\n"
              }
              // A spell chosen from the menu and not cast (interfered with, absorbed) is not the next Cast's, another
              // member's turn perhaps - who would cast it with the first one's mana.
              g.castPreset = null;
              g.castOn = null;
              break;
            case 0x47:
              await onlyPlayers(0x6e14, () => getCommand(g));
              break;
            case 0x4a:
              await onlyPlayers(0x6e1a, () => jimmyCommand(g));
              break;
            case 0x4b:
              if (!(await klimbInCombat(g))) done = false;
              break;
            case 0x4f:
              await onlyPlayers(0x6e22, () => openCommand(g));
              break;
            case 0x50:
              g.say(0x6e28); // "Push-"
              await pushCommand(g, true);
              break;
            case 0x52:
              await onlyPlayers(0x6e2e, () => readyCommand(g, true));
              break;
            case 0x53:
              await onlyPlayers(0x6e3a, () => searchCommand(g));
              break;
            case 0x55:
              await onlyPlayers(0x6e42, () => useCommand(g));
              break;
            case 0x59:
              await yellCommand(g);
              break;
            case 0x5a: {
              const { ztatsCommand } = await import('./zstats.ts');
              await ztatsCommand(g);
              again = true; // looking at the party is not a turn (the ultima3 port's; the original spent it)
              break;
            }
            case K.Escape:
              again = (await escape(g)) !== 0;
              break;
            case K.Space:
              g.text.moving = true; // passed again, it folds with a count as a move does (text.ts)
              g.say(0x6e60); // "Pass\n"
              break;
            case 0x30:
              s.activeMember = 0xff;
              g.say(0x6e66); // "Set active plr:\nNone!\n"
              drawVitals(g);
              break;
            case 0x31:
            case 0x32:
            case 0x33:
            case 0x34:
            case 0x35:
            case 0x36:
              if (!setActiveInCombat(g, key - 0x31)) again = true;
              break;
            case K.Left:
            case K.Right:
            case K.Up:
            case K.Down:
              if (!(await movePlayer(g, s.combatTurn, key))) done = false;
              break;
            case 0x42:
              await misc(0x6e7e, 1);
              break;
            case 0x44:
              g.say(0x6e84);
              again = true;
              break;
            case 0x45:
              await misc(0x6e8e, 2);
              break;
            case 0x46:
              await misc(0x6e94, 2);
              break;
            case 0x48:
              await misc(0x6e9a, 2);
              break;
            case 0x49:
              await misc(0x6ea2, 2);
              break;
            case 0x4c:
              await misc(0x6eb0, 2);
              break;
            case 0x4d:
              await misc(0x6eb6, 2);
              break;
            case 0x4e:
              await misc(0x6eba, 2);
              break;
            case 0x51:
              await misc(0x6ec4, 2);
              break;
            case 0x54:
              await misc(0x6eca, 3);
              break;
            case 0x56:
              await misc(0x6ed0, 2);
              break;
            case 0x57: {
              // Switch Weapon (the port's): the member's melee arms and their ranged, one for the other
              // (switchWeapon.ts). Elsewhere W is still the original's "W-What?".
              if ((c.flags & CF.Player) === 0) {
                g.say(0x6ed6); // "W-What?\n"
                again = true;
                break;
              }
              const { switchWeapon } = await import('./switchWeapon.ts');
              g.print('\nSwitch Weapon-');
              const { said, done } = switchWeapon(g, c.who);
              g.print(`\n${said}\n`);
              // Nothing taken up: no turn spent.
              if (!done) again = true;
              else drawVitals(g);
              break;
            }
            case 0x58:
              await misc(0x6ee0, 1);
              break;
            default:
              g.say(0x6ee6); // "What?\n"
              done = false;
          }
        }
      }
      // A bump's direction is for the command it queued, and goes when that command is done (processCommand does this
      // out of combat); a walk that queued one is not done, and keeps it for the command.
      if (done) g.bumpDir = 0;
      // A command backed out of at its prompt spends no turn (the port's): the same member is asked again - afresh, as
      // at the turn's start, so a cast backed out of leaves no mark of a spell on the blow struck instead (its sound,
      // its roll, "Failed!" for a miss).
      if (g.cancelled) {
        g.cancelled = false;
        again = true;
        s.d588f = s.d5890 = 0;
      }
    } while (again);
    if (c.flags & CF.Player) markTurn(g, c.who, false);
  }
  if (key < 0x30 || key > 0x36) {
    turnEnds(g);
    updateFrame(g);
    checkMirror(g);
  }
}

/** COMBAT_0b94_MainLoop: turns by each combatant's timer until one side is gone; true if the battle was lost. */
export async function combatLoop(g: Game): Promise<boolean> {
  const s = g.s;
  let lost = true;
  s.exitDir = 0;
  updateFrame(g);
  drawVitals(g);
  g.p.flushKeys();
  countSides(g);
  s.battleWon = s.dx === 0 ? 1 : 0;
  musicForMap(g);
  for (;;) {
    for (s.combatTurn = 0; s.combatTurn < 0x20; s.combatTurn++) {
      s.openDoor = 0;
      const c = g.combat[s.combatTurn];
      const f = c.flags;
      if ((f & (CF.Player | CF.Monster)) === 0 || (f & CF.Dead) !== 0) continue;
      if (f & CF.Player && s.members[c.who].status === Status.Dead) {
        c.flags |= CF.Dead;
        await hitFlash(g, s.combatTurn);
        await damage(g, s.combatTurn, 99);
        continue;
      }
      if ((g.combatMap[c.y * 32 + c.x] & 0xfe) === 0x84) continue;
      if (--c.timer !== 0) continue;
      c.timer = 36 - c.dex;
      s.weapon = s.d5890 = s.d588f = s.d58a2 = s.crosshair = 0;
      if (++s.d5882 === 10) {
        s.d5882 = 0;
        passTime(g, 1);
      }
      s.blink = 1;
      if (onMonsterSide(g, s.combatTurn)) await monsterTurn(g);
      else await playerTurn(g);
      s.d58a8[s.combatTurn] = 0xff;
      if (easedRules(g)) await shakeCharm(g, s.combatTurn);
      await castOut(g);
      await squareEffect(g, s.combatTurn);
      countSides(g);
      if (s.dy === 0) {
        if (s.dx === 0) {
          lost = false;
          return finishLoop(g, lost);
        }
        if (passOut(g) === -1) {
          updateFrame(g);
          if (s.battleWon === 0) {
            g.say(0x6eee); // "\nBATTLE IS LOST!"
            lost = true;
          }
          return finishLoop(g, lost);
        }
        continue;
      }
      if (s.dx === 0 && s.battleWon === 0) {
        g.say(0x6f00); // "\nVICTORY!\n"
        s.battleWon = 1;
        await victoryTune(g);
        g.p.flushKeys();
      }
    }
  }
}

function finishLoop(g: Game, lost: boolean): boolean {
  g.p.flushKeys();
  g.lighthouse.step = 0xff;
  g.sound.music(0);
  return lost;
}

/** ULTIMA_4368. */
async function victoryTune(g: Game): Promise<void> {
  // With the Upgrade the field turns to the theme once it is won (MID.DRV 016d).
  musicForMap(g);
  if (g.soundOff) return;
  for (let i = 0; i < 3; i++) await g.sound.pulse(0x11f8, 1, 0x2a30, 300, 6);
  await g.sound.pulse(0x17d4, 1, 0x5460, 300, 3);
}

// --- In and out ------------------------------------------------------------------------------------

/** ULTIMA_60ec: one of BRIT.CBT's arenas into the combat map, with the party's and the monsters' places. */
function loadArena(g: Game, n: number): void {
  g.combatMap.fill(0);
  g.combatMap.set(g.data.files.get('BRIT.CBT').subarray(n * 0x160, n * 0x160 + 0x160));
}

/** Arena `n` against actor `foe` and back, as attackCombat fights it but with the arena given (devStarts.ts). */
export async function arenaFight(g: Game, n: number, foe: number): Promise<void> {
  loadArena(g, n);
  await specialMap(g, 0, foe, 0);
}

/**
 * A camp's ambush fought out (or fled), whoever still sleeps wakes (the Story and Modern rules, the port's). 1988 woke
 * a camp only when it was not ambushed (CMDS_0000's end), so a party that left the fight with its sleepers walked on
 * with them asleep - out in Britannia, where nothing wakes a sleeper, until a towne, a spell or the next camp.
 */
function wakeAfterAmbush(g: Game): void {
  const s = g.s;
  if (!easedRules(g)) return;
  for (let m = 0; m < s.partySize; m++) if (s.members[m].status === Status.Sleeping) s.members[m].status = Status.Good;
}

/** The Avatar's place in the fight, or -1 where they are not on the field. */
export const avatarAt = (g: Game): number => g.combat.findIndex((c) => (c.flags & CF.Player) !== 0 && c.who === 0);

/**
 * Whether auto combat (autocombat.ts) plays the turn the fight is on: any of the party's side with All; with Allies,
 * any but the Avatar's, until it is handed back for the fight (Game.autoHeld).
 */
export function autoPlaysTurn(g: Game): boolean {
  const mode = g.options.autoCombat;
  if (mode === 'all') return true;
  return mode === 'allies' && !g.autoHeld && g.s.combatTurn !== avatarAt(g);
}

/** ULTIMA_5f86: to the arena and back: actors put aside, combat or camping, then everything restored. */
export async function specialMap(g: Game, flags: number, a: number, b: number): Promise<void> {
  const s = g.s;
  s.combatFlags = flags;
  const x = s.x;
  const y = s.y;
  const level = s.level;
  s.savedMapId = s.mapId;
  const active = s.activeMember;
  s.mapId = 0xff;
  g.charmedBy.clear();
  newSpawns(g);
  g.autoProgress = Infinity;
  g.autoIdle = 0;
  g.autoHeld = false;
  g.savedActorBytes.set(s.b.subarray(0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100));
  let fight = true;
  if (flags === 0) {
    const a0 = s.actors[a];
    let kind = (a0.tile & 0xfc) === 0x2c ? 1 : (a0.tile - 0x40) >> 2;
    if (a0.b5 > 0x7f) kind += 0x100;
    await prepareCombat(g, 1, kind);
  } else if (flags & 4) {
    fight = await camp(g, flags, a, b);
  } else if (flags & 2) {
    const { dungeonRoomCombat } = await import('./dungeon.ts');
    await dungeonRoomCombat(g, a);
  } else {
    fight = false;
  }
  if (fight) {
    s.combatTurn = s.activeMember = 0xff;
    s.battleWon = 0;
    await combatLoop(g);
    if (flags & 4) wakeAfterAmbush(g);
  }
  if (g.bb16 !== 0) g.bb16 = 0;
  s.x = x;
  s.y = y;
  s.level = level;
  s.mapId = s.savedMapId;
  g.viewDirty = 1;
  musicForMap(g);
  drawVitals(g);
  s.activeMember = s.members[active]?.status !== Status.Dead && s.members[active]?.status !== Status.Sleeping ? active : 0xff;
  s.b.set(g.savedActorBytes, 0x5c5a - 0x55a6);
}

/** SJOG_203e: after the fight: the Mirror's end, the actors back, the foe gone (pirate ships left to board). */
async function afterCombat(g: Game, foe: number): Promise<void> {
  const s = g.s;
  if (s.exitDir === 0x4d) {
    const { endgame } = await import('./story.ts');
    await endgame(g);
  }
  s.b.set(g.savedActorBytes, 0x5c5a - 0x55a6);
  if ((s.combatFlags & 0x82) === 0) {
    if (foe < 0x20) {
      const a = s.actors[foe];
      if (s.battleWon !== 0 && (a.tile & 0xfc) === 0x2c) {
        a.tile -= 8;
        a.anim -= 8;
        a.b5 = 99;
        a.b7 = 2;
      } else {
        a.tile = a.anim = a.x = a.y = a.z = 0;
      }
    }
    g.printChar('\n');
    s.mapId = s.savedMapId;
  }
}

/** ULTIMA_6150_Combat: a fight with actor `foe` on an arena chosen by the ground and the foe. */
export async function attackCombat(g: Game, foe: number): Promise<void> {
  const s = g.s;
  const a = s.actors[foe];
  const kind = a.tile & 0xfc;
  g.printChar('\n');
  g.printChar(0xfc);
  if (kind < 0x40)
    g.say(0xa3fa); // "PIRATES"
  else g.print(g.data.table(0x18b6, 0x30)[(kind - 0x40) / 4] ?? '');
  g.printChar(0xfb);
  g.say(0xa402); // "\n\n"
  const ground = tileAt(g, a.x, a.y);
  let water = ground < T.Poison || ((ground & 0xfe) !== T.T6A && (ground & 0xf0) === T.T60);
  let arena: number;
  if (kind === 0xfc) {
    arena = 10;
    if (s.sceptre !== 0) {
      g.say(0xa406); // "The Sceptre is reclaimed!\n"
      if (!g.soundOff) void g.sound.pulse(0xfd2, 1, 65000, 1, 1);
      s.sceptre = 0;
    }
  } else {
    if ((kind & 0xf0) === 0x80) water = true;
    if ((s.partyTile & 0xf8) === 0x20) arena = kind === 0x2c ? 0xe : water ? 0xb : 0xd;
    else if (kind === 0x2c) arena = 0xc;
    else if (water) arena = 0xf;
    else {
      const byGround: Record<number, number> = {
        1: 0xf,
        2: 0xf,
        3: 0xf,
        4: 1,
        5: 2,
        6: 3,
        8: 3,
        7: 4,
        0x1e: 4,
        0x1f: 4,
        9: 5,
        0xa: 5,
        0xb: 6,
        0xc: 6,
        0xd: 6,
        0xe: 6,
        0xf: 6,
        0x1d: 7,
        0x48: 7,
        0x49: 7,
        0x6a: 7,
        0x6b: 7,
        0x44: 8,
      };
      arena = byGround[ground] ?? (s.mapId !== 0 ? 8 : 2);
    }
  }
  loadArena(g, arena);
  await specialMap(g, 0, foe, 0);
  await afterCombat(g, foe);
  buildLightMap(g);
  passTime(g, 0);
}

/** CMDS_0000: camping: the party sleeps (a bard on watch plays), maybe ambushed; rested at last, and perhaps a visitor. False if there was no fight. */
async function camp(g: Game, flags: number, guard: number, hours: number): Promise<boolean> {
  const s = g.s;
  let lastHour = s.hour;
  let bard = -1;
  let ambush = -1;
  s.icon = s.protection = 0;
  const active = s.activeMember;
  s.activeMember = 0xff;
  if (flags & 2) {
    const { dungeonRoomCombatSetup } = await import('./dungeon.ts');
    await dungeonRoomCombatSetup(g, false);
  } else {
    await placeParty(g);
  }
  playTune(g, Tune.Stones);
  s.combatTurn = 0xff;
  let until = hours + s.hour;
  if (until > 0x17) until -= 0x18;
  if (guard > 5 || guard < -1) guard = -1;
  const poisoned = [0, 0, 0, 0, 0, 0, 0, 0];
  let guardC = 0;
  for (let m = 0; m < s.partySize; m++) {
    let ci = 0;
    for (; ci < 0x20; ci++) if (m === g.combat[ci].who) break;
    const st = s.members[m].status;
    if (st === Status.Poisoned || st === Status.Good || st === Status.Sleeping) {
      if (st === Status.Poisoned) poisoned[m]++;
      if (m !== guard) sleepUnlessPoisoned(g, ci);
      if (s.members[m].cls === 0x42 && m === guard && !g.soundOff) bard = ci;
    }
    if (m === guard) guardC = ci;
  }
  updateFrame(g);
  if (bard !== -1) {
    const a = s.actors[g.combat[bard].actor];
    const [t, an] = [a.tile, a.anim];
    a.tile = a.anim = 0x5f;
    g.banjoNote = 1;
    await sleepTicks(g, 0x34);
    a.tile = t;
    a.anim = an;
    if (g.combat[bard].who !== guard) sleepUnlessPoisoned(g, bard);
    updateFrame(g);
  }
  g.say(0x41d4); // "Zzzzzz...\n\n"
  const guardTile = guard !== -1 ? s.actors[g.combat[guardC].actor].tile : 0;
  // A rest as soon as it is earned, the poisoned and the watch not healed (rest.ts restTimer).
  const timer = restTimer(g, (m) => poisoned[m] !== 0 || m === guard);
  while (until !== s.hour) {
    if (s.hour >= 0x18) s.hour -= 0x18;
    updateFrame(g);
    drawVitals(g);
    if (lastHour !== s.hour && g.random(0, 0x3f) === 0) {
      ambush = g.data.bytes(0x1734, 8)[g.random(0, 7)];
      g.say(0x41e0); // "Ambushed!\n\n"
      if (guard > -1) {
        for (let k = 0; k < 6; k++) {
          const m = g.combat[k].who;
          if (m < s.partySize) {
            wake(g, k);
            s.members[m].status = poisoned[m] ? Status.Poisoned : Status.Good;
          }
        }
      }
      drawVitals(g);
      if (flags & 2) {
        const { dungeonRoomCombatSetup } = await import('./dungeon.ts');
        await dungeonRoomCombatSetup(g, true);
      } else {
        await prepareCombat(g, flags, ambush);
      }
      break;
    }
    lastHour = s.hour;
    passTime(g, 5);
    if (s.hour !== lastHour && timer.hourPassed()) drawVitals(g);
    await g.p.sleep(1000 / 18.2);
    if (s.savedMapId < 0x21) {
      s.mapId = s.savedMapId;
      const { drawMoons } = await import('./frame.ts');
      drawMoons(g);
      s.mapId = 0xff;
    }
    if (guard !== -1 && g.random(0, 3) === 2) {
      const c = g.combat[guardC];
      s.dx = c.x;
      s.dy = c.y;
      switch (g.random(0, 3)) {
        case 0:
          s.dy--;
          break;
        case 1:
          s.dy++;
          break;
        case 2:
          s.dx++;
          break;
        case 3:
          s.dx--;
          break;
      }
      if (inArena(s.dx, s.dy) && arenaFree(g, guardTile, s.dx, s.dy)) {
        c.x = s.actors[c.actor].x = s.dx;
        c.y = s.actors[c.actor].y = s.dy;
        updateFrame(g);
      }
    }
  }
  if (ambush > -1) {
    followMap(g);
    return true;
  }
  if (timer.rested()) {
    // The old man comes to a camp outdoors that rested (apparitionComes).
    if ((flags & 0x82) === 0 && apparitionComes(g)) {
      s.d588d = s.month;
      g.oldManDay = gameDay(s);
      await apparition(g);
    }
  } else {
    g.say(0x41fb); // "No effect...\n"
  }
  for (let m = 0; m < s.partySize; m++) if (s.members[m].status === Status.Sleeping) s.members[m].status = Status.Good;
  s.activeMember = active;
  drawVitals(g);
  followMap(g);
  return false;
}

/** Days the Story and Modern rules keep the old man from camp after he has come, unless a level is due. */
export const OLD_MAN_EVERY = 14;

/**
 * Whether the old man comes to a camp outdoors that rested. 1988's one time in four, every camp (the Classic rules).
 * The Story and Modern rules (the port's): always where a member has a level due - he alone grants them - and
 * otherwise one time in four, but not within two weeks of his last coming. 1988 noted the month he came (D_588d) and
 * never read it; a camp every night had him back as often as not, to heal a party with nothing to be given.
 */
function apparitionComes(g: Game): boolean {
  const s = g.s;
  if (!easedRules(g)) return g.random(0, 99) < 0x19;
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status !== Status.Dead && earnedLevel(p.exp) > p.level) return true;
  }
  const since = g.oldManDay < 0 ? Infinity : gameDay(s) - g.oldManDay;
  // (A day before the one noted - a save taken up from another calendar - counts as long since.)
  return (since >= OLD_MAN_EVERY || since < 0) && g.random(0, 99) < 0x19;
}

/** OUTSUBS_0658: the old man appears at the camp: healing, levels by experience, and a word on karma. */
async function apparition(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x7750); // "An apparition!\n"
  const snd = g.soundOff ? null : g.sound;
  await snd?.pulse(0x0a3c, 1, 10000, 0x9c4, 6);
  for (const f of g.data.words(0x3a26, 6)) await snd?.pulse(f, 1, 5000, 200, 0xd);
  const man = s.actors[10];
  man.x = man.y = 5;
  man.tile = man.anim = 0x16;
  await reveal(g, 0x174, 5, 5);
  man.tile = man.anim = 0x74;
  const classTiles = g.data.bytes(0x1ade, 9);
  for (let m = 0; m < s.partySize; m++) {
    const p = s.members[m];
    if (p.status === Status.Dead) continue;
    p.hp = p.maxHp;
    p.status = Status.Good;
    let figure = s.actors[0];
    for (const c of g.combat) {
      if (c.who === m) {
        figure = s.actors[c.actor];
        break;
      }
    }
    figure.tile = figure.anim = classTiles[CLASSES.indexOf(String.fromCharCode(p.cls))];
    man.b6 = 0;
    await sleepTicks(g, 1);
    await snd?.pulse(5500, 1, 5000, 200, 13);
    g.draw.invert(8, 8, 0xb7, 0xb7);
    await snd?.pulse(5500, 1, 60000, 2500, 1);
    for (let k = 0; k < 3; k++) {
      man.b6 = 1;
      await sleepTicks(g, 1);
    }
    const level = earnedLevel(p.exp);
    if (p.level !== level) {
      p.level = level;
      p.hp = p.maxHp = level * 0x1e;
      g.say(0x776a); // "\n\"Hail, "
      g.print(p.name);
      g.say(0x7774); // "!\nFor thy valiant deeds, I shall reward thee!\n"
      g.say(0x77a4); // "Thou art now level "
      g.printNumber(level);
      g.say(0x77b8); // ", and\n"
      switch (g.random(1, 3)) {
        case 1:
          g.say(0x77c0); // "stronger!"
          p.str = Math.min(p.str + 1, 0x1e);
          break;
        case 2:
          g.say(0x77ca); // "quicker!"
          p.dex = Math.min(p.dex + 1, 0x1e);
          break;
        default:
          g.say(0x77d4); // "wiser!"
          p.int = Math.min(p.int + 1, 0x1e);
      }
      g.say(0x77dc); // "\" "
      await getChar(g);
      g.printChar('\n');
    }
    if (p.cls === 0x41 || p.cls === 0x4d) p.mp = p.int;
    else if (p.cls === 0x42) p.mp = p.int >> 1;
    drawVitals(g);
  }
  g.say(0x77e0); // "\n\""
  const band = Math.trunc(s.karma / 20);
  const karma = g.data.files.get('KARMA.DAT');
  const at = band < 4 ? g.data.words(0x1a74, 5)[band] : 0x29f;
  let text = '';
  for (let i = at; i < karma.length && karma[i] !== 0 && i < at + 2000; i++) text += String.fromCharCode(karma[i]);
  g.print(text);
  g.printChar('"');
  await getChar(g);
  g.say(0x77f8); // "\n\nThe strangely familiar old man vanishes...\n"
  man.tile = man.anim = 0x16;
  await reveal(g, g.combatMap[5 * 32 + 5], 5, 5);
  man.tile = man.anim = 0;
  await sleepTicks(g, 1);
  passTime(g, 0);
}

/** ULTIMA_6360: camping outdoors (in a dungeon, dungeon.ts does it). */
export async function campOutdoors(g: Game, guard: number, hours: number): Promise<void> {
  loadArena(g, 0);
  await specialMap(g, 4, guard, hours);
  buildLightMap(g);
}

/**
 * The combat marks drawn over the map (ULTIMA_56ac's end): the turn's square, blinking, and the crosshair. The
 * Standard look marks the turn's square with the ultima3 Standard outline, which stays (nothing blinks).
 */
export function drawCombatMarks(g: Game): void {
  const s = g.s;
  const d = g.draw;
  const marks = g.options.tileSet === 'standard' && d.aim !== undefined;
  // A direction asked on the world or in a town: the party, in the middle of the view, marked (input.ts directing).
  if (s.mapId <= 0x7f) {
    if (marks && g.directing && s.mapId < 0x21) d.aim!(5, 5, 'direction');
    return;
  }
  if (marks) {
    const me = g.combat[s.combatTurn];
    if (g.directing && s.combatTurn !== 0xff && me) d.aim!(me.x, me.y, 'direction');
    // The member a spell will be for, as the choice moves (magic.ts onWho).
    const on = g.healPick >= 0 ? g.combat.find((c) => c.flags & CF.Player && !(c.flags & CF.Dead) && c.who === g.healPick) : undefined;
    if (on) d.aim!(on.x, on.y, 'heal');
  }
  const standard = g.options.tileSet === 'standard' && d.marker !== undefined;
  s.blink = s.blink ? 0 : 1;
  const c = g.combat[s.combatTurn];
  // In the colour of the member's bar in the party panel: their state's, else their hit points', else white.
  if (standard && s.combatTurn !== 0xff && !onMonsterSide(g, s.combatTurn)) d.marker!(c.x, c.y, turnColour(g, c.who));
  if (standard || s.blink === 0 || s.combatTurn === 0xff || onMonsterSide(g, s.combatTurn)) {
    if (standard) crosshair(g);
    return;
  }
  const x = c.x * 16 + 8;
  const y = c.y * 16 + 8;
  d.pen = Colour.brightWhite;
  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 0xf; k += 0xe) {
      d.line(x, y + i + k, x + 0xf, y + i + k);
      d.line(x + i + k, y, x + i + k, y + 0xf);
    }
  }
  crosshair(g);
}

/** The aiming crosshair (part of ULTIMA_56ac's marks); the Standard look's own mark where it has one (four triangles). */
function crosshair(g: Game): void {
  const s = g.s;
  const d = g.draw;
  if (s.crosshair !== 0 && g.options.tileSet === 'standard' && d.aim) {
    d.aim(s.crossX, s.crossY, g.casting ? 'spell' : 'attack');
    return;
  }
  if (s.crosshair !== 0) {
    const cx = s.crossX * 16 + 8;
    const cy = s.crossY * 16 + 8;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 2; k++) {
        d.pen = Colour.brightWhite;
        d.line(k * 0xb + cx + 2, i * 3 + cy + 6, k * 3 + cx + 6, i * 3 + cy + 6);
        d.plot(k * 3 + cx + 6, i * 0xb + cy + 2);
        d.pen = 0;
        d.line(k * 0xb + cx + 2, i * 5 + cy + 5, k * 5 + cx + 5, i * 5 + cy + 5);
        d.plot(k * 5 + cx + 5, i * 0xb + cy + 2);
        d.line(k * 0xb + cx + 2, cy + i + 7, k * 3 + cx + 6, cy + i + 7);
        d.line(cx + k + 7, i * 3 + cy + 6, cx + k + 7, i * 0xb + cy + 2);
      }
    }
  }
}

export { freeActor, setActor };

/** ULTIMA_3c9a_HoleUpCmd (outdoors and in dungeons): a ship's crew repairs the hull; otherwise the party camps. */
export async function holeUpCommand(g: Game): Promise<number> {
  const s = g.s;
  const party = s.actors[0];
  let tile = party.anim;
  g.say(0xa2c2); // "Hole up & "
  if ((tile & 0xf8) === 0x20) {
    g.say(0xa2ce); // "\nrepair...\n\n"
    if (party.anim < 0x24) {
      g.say(0xa2dc); // "Sails must be\n"
      g.say(0xa2ec); // "lowered!\n\n"
    } else {
      const { monsterPause, monstersTurn } = await import('./outdoors.ts');
      for (let i = 0; i < 5; i++) {
        await monsterPause(g);
        await monstersTurn(g);
        if ((s.partyTile & 0xfc) !== 0x24) return 1;
        passTime(g, 5);
      }
      do party.b5 = Math.min(party.b5 + g.random(1, 3), 99);
      while (party.b5 < 10);
      g.say(0xa2f8); // "Hull now "
      g.printNumber(party.b5, 2);
      g.say(0xa302); // "!\n\n"
      g.vitalsDirty = 1;
    }
    return 1;
  }
  g.say(0xa306); // "camp!\n\n"
  if (s.mapId < 0x21) tile = tileAt(g, s.x, s.y);
  if (s.mapId < 0x21 && tile !== 0 && tile < 4) {
    g.say(0xa30e); // "On land or ship!\n\n"
    return 1;
  }
  if (s.mapId < 0x21 && party.anim !== A.Avatar) {
    g.say(0xa322); // "On foot!\n"
    return 1;
  }
  // A controller dials up to twenty-three (input.ts getHours): the question without the 1988 range.
  g.say(g.options.input === 'controller' ? 0x4209 : 0xa32c); // "For how many hours? " : "For how many hours? (1-9) "
  const hours = await getHours(g, (h) => restOutcome(g, h));
  g.print(hours ? String(hours) : ' ');
  g.printChar('\n');
  if (hours === 0) {
    g.cancelled = true; // no hours (B): no camp made, and no turn spent, as a command backed out of spends none
    return 1;
  }
  let k: number;
  let awake = 0;
  for (let m = 0; m < s.partySize; m++) if (s.members[m].status === Status.Good || s.members[m].status === Status.Poisoned) awake++;
  let guard = -1;
  if (awake > 1) {
    g.say(0xa348); // "\nWilt thou set a watch? "
    while ((k = await getCharYN(g)) !== 0x59 && k !== 0x4e);
    if (k === 0x4e)
      g.say(0xa362); // "No\n\n"
    else {
      g.say(0xa368); // "Yes\n\n"
      g.say(0xa36e); // "Who will stand guard? "
      const { selectMember } = await import('./input.ts');
      guard = await selectMember(g);
      // (B at the member is "None posted!", and the camp is made all the same: no backing out of the command.)
      g.cancelled = false;
      g.printChar('\n');
      if (guard === -1 || s.members[guard].status !== Status.Good) {
        guard = -1;
        g.say(0xa386); // "None posted!\n\n"
      }
    }
  }
  if (s.mapId > 0x20) {
    const { campInDungeon } = await import('./dungeon.ts');
    await campInDungeon(g, guard, hours);
  } else {
    await campOutdoors(g, guard, hours);
  }
  g.viewDirty = 1;
  return 1;
}
