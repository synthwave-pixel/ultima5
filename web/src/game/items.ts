/**
 * items.ts
 *
 * Search, Jimmy, Open and Get (u5d sjog.c): hidden things in stumps,
 * desks and walls, moonstones, nightshade and mandrake by the moon,
 * chests with their traps and contents, doors and locks, and everything
 * the party can pick up.
 */

import { actorTileAt, freeActor, setActor } from './actors.ts';
import { invertMember, updateFrame, drawVitals } from './frame.ts';
import { Game, thingKey } from './game.ts';
import { selectDirection, whoActs } from './input.ts';
import { Status } from './save.ts';
import { POTION_LONG, scrollEffect } from './magic.ts';
import { damageMember, damageParty } from './time.ts';
import { T } from './tiles.ts';
import { callGuards, npcKilled, npcOfActor, removeNpc, setNpcKilled } from './town.ts';
import { buildLightMap, setTileAt, setTownTile, tileAt } from './world.ts';
import { roll30 } from './outdoors.ts';
import { cue } from './cues.ts';

const inc = (v: number, n: number, max: number): number => (v + n < max ? v + n : max);

/** The square in a dungeon (D_595a, 8x8 per level). */
function dungeonCell(x: number, y: number, level: number): number {
  return level * 0x40 + (y & 7) * 8 + (x & 7);
}

/** SJOG_012a: what the party finds, named. */
function nameFind(g: Game, tile: number): void {
  const names: Record<number, number> = {
    1: 0x850e,
    2: 0x8518,
    3: 0x852a,
    4: 0x8536,
    5: 0x8542,
    6: 0x854e,
    7: 0x855a,
    8: 0x856c,
    9: 0x8574,
    0xa: 0x857e,
    0xb: 0x8588,
    0xc: 0x8596,
    0xd: 0x85a2,
    0xf: 0x85b2,
    0x19: 0x85be,
    0x1e: 0x85d0,
    0x1f: 0x85e2,
  };
  g.say(names[tile] ?? 0x85f4); // "a chest!\n" ... "Nothing of note.\n"
}

/** ULTIMA_2fd0: a trap goes off on member `i`: acid, poison, a bomb, or gas. */
export async function springTrap(g: Game, i: number): Promise<void> {
  if (!g.soundOff) await g.sound.noise(0x28, 3000, 500);
  const kind = g.s.mapId > 0x7f ? g.random(0, 1) : g.data.bytes(0x559e, 8)[g.random(0, 7)];
  const poison = (m: number): void => {
    if (m < g.s.partySize && g.s.members[m].status !== Status.Dead) {
      g.s.members[m].status = Status.Poisoned;
      drawVitals(g);
    }
  };
  switch (kind) {
    case 0:
      g.say(0x5581); // "ACID!\n"
      await damageMember(g, i, roll30(g));
      break;
    case 1:
      g.say(0x5588); // "POISON!\n"
      poison(i);
      break;
    case 2:
      g.say(0x5591); // "BOMB!\n"
      await damageParty(g);
      break;
    case 3:
      g.say(0x5598); // "GAS!\n"
      for (let m = 0; m < 6; m++) poison(m);
      break;
  }
}

// --- Search -----------------------------------------------------------------------

/** SJOG_01f2: searching a body: mostly remains, sometimes plague, now and then food or gold. */
function searchBody(g: Game, actor: number, who: number): void {
  if (g.random(0, 7) !== 0) {
    setActor(g, actor, 0, 0, 0, 0, 0, 0);
    if (g.random(0, 0x1f) === 0x13) {
      g.say(0x8606); // "Plague!\n"
      if (!g.soundOff) void g.sound.noise(0x28, 3000, 500);
      g.s.members[who].status = Status.Poisoned;
      g.vitalsDirty = 1;
    } else {
      g.say([0x8610, 0x861a, 0x8622, 0x862a][g.random(0, g.random(0, 3))]); // nothing, worms, guts, a bloody pulp
    }
  } else {
    const a = g.s.actors[actor];
    if (g.random(0, 3) === 0) {
      g.say(0x863a); // "food!\n"
      a.tile = a.anim = 0xf;
    } else {
      g.say(0x8642); // "gold!\n"
      a.tile = a.anim = 2;
    }
    a.b5 = g.random(1, 3);
    g.viewDirty |= 2;
    updateFrame(g);
  }
}

/** SJOG_02ea: searching a chest for traps, by intelligence. */
export function searchChest(g: Game, actor: number, who: number): void {
  const a = g.s.actors[actor];
  const b5 = a.b5;
  const int = g.s.members[who].int;
  const odds = (b5 & 0x80) === 0 ? -(int - 0x1e) >> 1 : ((b5 & 0x7f) - int + 0x1e) >> 1;
  const seen = odds <= g.random(1, 0x1e);
  // What it said, kept for the bump that comes next (bumpAct.ts): the reading, not the truth.
  const clean = (seen && (b5 & 0x80) === 0) || (!seen && (b5 & 0x80) !== 0);
  g.bumped.set(thingKey(g, a.x, a.y), clean ? 'clean' : 'trap');
  if (clean) {
    g.say(0x864a); // "no trap!\n"
  } else {
    const level = b5 & 0x7f;
    if (seen && level < 10)
      g.say(0x8654); // "a simple trap!\n"
    else if (seen && level > 0x14)
      g.say(0x8664); // "a complex trap!\n"
    else g.say(0x8676); // "a trap!\n"
  }
}

/** SJOG_03a8: a buried moonstone here comes to light. */
function findMoonstone(g: Game, x: number, y: number, z: number): boolean {
  const s = g.s;
  for (let i = 7; i >= 0; i--) {
    if (s.moonstoneX[i] !== x || s.moonstoneY[i] !== y || s.moonstoneZ[i] !== z || s.moonstoneHeld[i] !== s.mapId) continue;
    let shown = false;
    for (let k = 0x1f; k >= 0; k--) if (actorTileAt(g, x, y, z) === 0x19 && s.actors[s.dx].b5 === i) shown = true;
    if (shown) continue;
    setActor(g, freeActor(g), 0x19, 0x19, x, y, z, i);
    g.say(0x8680); // "a strange rock!\n"
    g.viewDirty |= 2;
    return true;
  }
  return false;
}

/** SJOG_045a: at midnight, once a day, nightshade or mandrake at its three spots. */
function findReagent(g: Game, x: number, y: number): boolean {
  const s = g.s;
  const xs = g.data.bytes(0x3e66, 3);
  const ys = g.data.bytes(0x3e6a, 3);
  const which = g.data.bytes(0x3e6e, 3);
  const names = g.data.table(0x3e72, 3);
  for (let i = 0; i < 3; i++) {
    if (xs[i] === x && ys[i] === y && s.hour === 0 && s.harvestDays[i] !== s.day) {
      s.harvestDays[i] = s.day;
      const n = g.random(2, 0xf);
      s.reagents[which[i]] = Math.min(s.reagents[which[i]] + n, 99);
      g.printNumber(n, n < 10 ? 1 : 2, ' ');
      g.say(0x86be); // " sprigs of\n"
      g.print(names[i]);
      g.say(0x86ca); // "\n"
      return true;
    }
  }
  return false;
}

/** Which of the hidden things of the world (D_3e78.. tables) is still to be found at (x, y); -1 for none. */
function hiddenIndex(g: Game, x: number, y: number): number {
  const s = g.s;
  const maps = g.data.bytes(0x3f5c, 0x72);
  const zs = g.data.bytes(0x3fce, 0x72);
  const xs = g.data.bytes(0x4040, 0x72);
  const ys = g.data.bytes(0x40b2, 0x72);
  for (let i = 0; i < 0x71; i++) {
    if (maps[i] !== s.mapId || zs[i] !== s.level || xs[i] !== x || ys[i] !== y) continue;
    // A key, the skull key and the glass sword are there again: a key when the party has none, the skull key a day
    // after it was taken, the glass sword when the party has not one - each unless it lies there already.
    if (
      (i === 0xd && s.keys === 0 && actorTileAt(g, x, y, s.level) === 0) ||
      (i === 0xe && s.day !== s.skullKeyDay) ||
      (i === 0xf && s.equipment[0x27] === 0 && actorTileAt(g, x, y, s.level) === 0)
    )
      return i;
    if ((s.d585c[i >> 3] & (1 << (i & 7))) === 0 && (i < 0xd || i > 0xf)) return i;
  }
  return -1;
}

/** SJOG_0514: the hidden things of the world (D_3e78.. tables), each found once (a few again and again). */
function findHidden(g: Game, x: number, y: number): void {
  const s = g.s;
  const i = hiddenIndex(g, x, y);
  if (i < 0) {
    g.say(0x86cc); // "nothing of note.\n"
    return;
  }
  if (i < 0xd || i > 0xf) s.d585c[i >> 3] |= 1 << (i & 7);
  if (i === 0xe) s.skullKeyDay = s.day;
  const tile = g.data.bytes(0x3e78, 0x72)[i];
  setActor(
    g,
    freeActor(g),
    tile,
    tile,
    g.data.bytes(0x4040, 0x72)[i],
    g.data.bytes(0x40b2, 0x72)[i],
    g.data.bytes(0x3fce, 0x72)[i],
    g.data.bytes(0x3eea, 0x72)[i],
  );
  g.viewDirty |= 2;
  nameFind(g, tile);
}

/**
 * Whether Search would turn something up in a square beside the party (Search looks north, south, east or west): a
 * hidden thing still to be found, a moonstone buried there, a reagent at its spot at midnight, a wall with a nick.
 * For the menu's hint (menu.ts): Search heads it then.
 */
export function somethingBeside(g: Game): boolean {
  const s = g.s;
  if (g.inDungeon || g.inCombat) return false;
  const xs = g.data.bytes(0x3e66, 3);
  const ys = g.data.bytes(0x3e6a, 3);
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    const x = (s.x + dx) & 0xff;
    const y = (s.y + dy) & 0xff;
    if (hiddenIndex(g, x, y) >= 0 || tileAt(g, x, y) === T.HiddenDoor) return true;
    for (let i = 0; i < 8; i++)
      if (s.moonstoneX[i] === x && s.moonstoneY[i] === y && s.moonstoneZ[i] === s.level && s.moonstoneHeld[i] === s.mapId) {
        const shown = actorTileAt(g, x, y, s.level) === 0x19;
        if (!shown) return true;
      }
    for (let i = 0; i < 3; i++) if (xs[i] === x && ys[i] === y && s.hour === 0 && s.harvestDays[i] !== s.day) return true;
  }
  return false;
}

/** SJOG_095c: Search. */
export async function searchCommand(g: Game): Promise<number> {
  const s = g.s;
  if (g.inDungeon) {
    const { searchInDungeon } = await import('./dungeon.ts');
    await searchInDungeon(g);
    return 1;
  }
  if (!(await selectDirection(g))) return 1;
  const x = s.x + s.dx;
  const y = s.y + s.dy;
  const who = await whoActs(g);
  if (who === -1) return 1;
  const t = tileAt(g, x, y);
  let chest = 1;
  for (; chest < 0x20; chest++) {
    const a = s.actors[chest];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === s.level) && a.tile === 1) break;
  }
  if (chest < 0x20) {
    g.say(0x892c); // "\nThou dost find\n"
    searchChest(g, chest, who);
    return 1;
  }
  // A body, wherever it lies among what is there (the 1988 game looked at the top one only, and a body under gold
  // - two fallen on one square, one searched - was never found).
  let body = 0x1f;
  for (; body > 0; body--) {
    const a = s.actors[body];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === s.level) && a.tile === 0x1f) break;
  }
  if (body > 0) {
    g.say(0x893e); // "\nThou dost find\n"
    searchBody(g, body, who);
    return 1;
  }
  const where: Record<number, number> = {
    [T.Stump]: 0x8950,
    [T.Shelf]: 0x8960,
    [T.Bookshelf]: 0x8970,
    [T.Bookshelf + 1]: 0x8970,
    [T.Well]: 0x8984,
    [T.Desk]: 0x8996,
    [T.Barrel]: 0x89a6,
    [T.Vanity]: 0x89b8,
    [T.Bed]: 0x89ca,
    [T.Bed + 1]: 0x89ca,
    [T.Dresser]: 0x89dc,
    [T.Trunk]: 0x89ee,
    [T.Fireplace]: 0x89fe,
    [T.Brazier]: 0x8a12,
    [T.Wall]: 0x8a24,
  };
  g.say(where[t] ?? 0x8a34); // "\nIn the stump\nt" ... "\nT"
  g.say(0x8a38); // "hou dost find\n"
  if (t === T.HiddenDoor) {
    g.say(0x8a48); // "a hidden door!\n"
    setTileAt(g, x, y, s.level < 0x80 ? T.DoorB9 : T.DoorB8);
    g.viewDirty |= 2;
  } else if ((t === T.Moongate || !findMoonstone(g, x, y, s.level)) && !findReagent(g, x, y)) {
    findHidden(g, x, y);
  }
  return 1;
}

// --- Jimmy ------------------------------------------------------------------------

/** SJOG_0baa: a chest's lock. */
async function jimmyChest(g: Game, actor: number): Promise<void> {
  const who = await whoActs(g);
  if (who === -1) return;
  await jimmyChestBy(g, actor, who);
}

/** A chest's lock picked by member `who` (loot.ts names them; Jimmy asks): whether its trap was disarmed. */
export async function jimmyChestBy(g: Game, actor: number, who: number): Promise<boolean> {
  const a = g.s.actors[actor];
  const b5 = a.b5;
  // The bump's next step (bumpAct.ts): open it, disarmed; or, the key broken, search it again - the reading that
  // sent the party here may have been wrong, and a chest never trapped breaks every key.
  const key = thingKey(g, a.x, a.y);
  if (b5 >= 0x80) {
    const odds = (((b5 & 0x7f) - g.s.members[who].dex + 0x1e) >> 1) & 0xff;
    if (odds < g.random(1, 0x1e)) {
      g.say(0x8a64); // "Success!\n"
      a.b5 &= 0x7f;
      g.bumped.set(key, 'disarmed');
      return true;
    }
    g.say(0x8a6e); // "Key broke!\n"
  } else {
    g.say(0x8a58); // "Key broke!\n"
  }
  g.bumped.delete(key);
  if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
  g.s.keys--;
  return false;
}

/** SJOG_0c3e: Jimmy in a dungeon: chests on the party's square. */
async function jimmyInDungeon(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x8a7a); // "\n"
  const who = await whoActs(g);
  if (who === -1) return;
  const at = dungeonCell(s.x, s.y, s.level);
  const cell = s.dungeon[at];
  const odds = (s.level * 2 - s.members[who].dex + 0x1e) >> 1;
  if ((cell & 0xf7) === 0x40) {
    if (s.keys === 0)
      g.say(0x8a7c); // "No keys!\n"
    else {
      g.say(0x8a86); // "Key broke!\n"
      s.keys--;
    }
  } else if ((cell & 0xf0) === 0x40) {
    if (s.keys === 0)
      g.say(0x8a92); // "No keys!\n"
    else if (odds < g.random(1, 0x1e)) {
      g.say(0x8a9c); // "Chest unlocked\n"
      s.dungeon[at] = (cell & 8) + 0x40;
    } else {
      g.say(0x8aac); // "Key broke!\n"
      s.keys--;
    }
  } else if ((cell & 0xf0) === 0x70) {
    g.say(0x8ab8); // "Already open!\n"
  } else {
    g.say(0x8ac8); // "What?\n"
  }
}

/** SJOG_0d4a: Jimmy: locked doors, stocks and manacles (freeing prisoners), chests. */
export async function jimmyCommand(g: Game): Promise<number> {
  const s = g.s;
  if (g.inDungeon) {
    await jimmyInDungeon(g);
    return 1;
  }
  if (s.keys === 0) {
    g.say(0x8ad0); // "No Keys!\n"
    return 1;
  }
  if (!(await selectDirection(g))) return 1;
  const x = s.x + s.dx;
  const y = s.y + s.dy;
  const t = tileAt(g, x, y);
  switch (t) {
    case T.DoorB9:
    case T.DoorBB: {
      const who = await whoActs(g);
      if (who === -1) break;
      if (s.members[who].dex <= g.random(0, 0x1d)) {
        g.say(0x8ada); // "Key broke!\n"
        s.keys--;
        break;
      }
      setTileAt(g, x, y, t - 1);
      g.viewDirty |= 2;
      g.say(0x8ae6); // "Unlocked!\n"
      break;
    }
    case T.T97:
    case T.T98:
      g.say(0x8af2); // "Key broke!\n"
      s.keys--;
      break;
    case T.T84:
    case T.T85: {
      if (s.mapId < 0x80 && actorTileAt(g, x, y, s.level) === 0) {
        g.say(0x8afe); // "No one is there!\n"
        break;
      }
      let npc = s.dx;
      const who = await whoActs(g);
      if (who === -1) break;
      if (s.members[who].dex <= g.random(0, 0x1d)) {
        g.say(0x8b10); // "Key broke!\n"
        s.keys--;
        break;
      }
      if (s.mapId < 0x7f) {
        npc = npcOfActor(g, npc);
        if (npc === -1) {
          g.say(0x8b1c); // "Couldn't find this npc\n\n"
          break;
        }
        if (s.npcs[npc].fa !== 0) s.npcs[npc].fa = 0;
        if (!npcKilled(g, npc)) {
          for (let k = 0; k < 3; k++) s.schedules[npc].setType(k, 5);
          g.say(0x8b36); // "\n\"I thank thee!\"\n"
          s.karma = inc(s.karma, 2, 99);
        }
        setNpcKilled(g, npc);
        break;
      }
      setTileAt(g, x, y, T.T44);
      g.viewDirty |= 2;
      g.say(0x8b48); // "Unlocked\n"
      break;
    }
    default: {
      let c = 1;
      for (; c < 0x20; c++) {
        const a = s.actors[c];
        if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === s.level) && a.tile === 1) break;
      }
      if (c < 0x20) await jimmyChest(g, c);
      else g.say(0x8b52); // "No lock!\n"
    }
  }
  return 1;
}

// --- Open ---------------------------------------------------------------------------

/** SJOG_0f88: something from the chest appears beside it. */
function chestItem(g: Game, tile: number, amount: number, x: number, y: number, z: number, level: number, found: { any: boolean }): void {
  const s = g.s;
  if (tile === 3 || tile === 4) amount--;
  const n = tile === 1 ? g.random(1, level) : tile === 2 ? g.random(1, level * 3) : amount;
  let slot = 0;
  for (let i = 0x1f; i >= 0; i--) {
    if (s.actors[i].tile === 0) {
      slot = i;
      break;
    }
  }
  if (slot === 0) return;
  setActor(g, slot, tile, tile, x, y, z, n);
  if (s.mapId < 0x80) {
    s.actors[slot].b7 = 0;
    s.actors[slot].z = z;
  } else {
    s.actors[slot].b7 = 0x20;
  }
  g.viewDirty |= 2;
  updateFrame(g);
  if (!found.any) {
    g.say(0x8b5c); // "Found:\n"
    found.any = true;
  }
  nameFind(g, tile);
}

/**
 * SJOG_112c: open a chest: traps, then its contents by its level (D_4124.., D_413c..). `by` names the chest and who
 * opens it (loot.ts, where two may lie on one square); else the chest at (x, y), by whoever acts.
 */
export async function openChest(g: Game, x: number, y: number, z: number, by?: { actor: number; who: number }): Promise<void> {
  const s = g.s;
  let i = by ? by.actor : 1;
  for (; i < 0x20 && !by; i++) {
    const a = s.actors[i];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === z)) {
      if (a.tile === 1) break;
      if (a.tile === 0xe) {
        g.say(0x8b64); // "Can't!\n"
        return;
      }
    }
  }
  if (i === 0x20) {
    g.say(0x8b6c); // "Nothing to open!\n"
    return;
  }
  const who = by ? by.who : await whoActs(g);
  if (who === -1) return;
  let level = s.actors[i].b5;
  setActor(g, i, 0, 0, 0, 0, 0, 0);
  g.viewDirty |= 2;
  if (s.mapId >= 1 && s.mapId <= 0x20) s.karma = s.karma > 2 ? s.karma - 2 : 0;
  if (level > 0x7f) {
    level &= 0x7f;
    g.say(0x8b7e); // "Trapped!\n"
    await springTrap(g, who);
    if (s.mapId > 0x7f && s.members[who].status === Status.Dead) {
      for (const c of g.combat) {
        if ((c.flags & 0x80) !== 0 && c.who === who) {
          c.flags |= 0x20;
          s.actors[c.actor].tile = s.actors[c.actor].anim = 0x1e;
          break;
        }
      }
      if (who === s.activeMember) s.activeMember = 0xff;
      updateFrame(g);
    }
  }
  const found = { any: false };
  const tiles = g.data.bytes(0x4124, 8);
  const odds = g.data.bytes(0x412c, 8);
  const most = g.data.bytes(0x4134, 8);
  for (let k = 7; k >= 0; k--) {
    if (odds[k] <= level && odds[k] <= g.random(1, 0x1e)) {
      const n = most[k] === 1 ? 1 : g.random(1, most[k]);
      chestItem(g, tiles[k], n, x, y, z, level, found);
    }
  }
  const gear = g.data.bytes(0x413c, 0x30);
  const gearOdds = g.data.bytes(0x416c, 0x30);
  for (let k = Math.trunc(level / 2); k-- >= 0; ) {
    const pick = g.random(0, 0x2f);
    if (gearOdds[pick] <= level && gearOdds[pick] <= g.random(1, 0x1e)) chestItem(g, gear[pick], pick, x, y, z, level, found);
  }
  if (!found.any) g.say(0x8b88); // "Chest empty!\n"
}

/** SJOG_12d4: Open in a dungeon. */
async function openInDungeon(g: Game): Promise<void> {
  const s = g.s;
  const at = dungeonCell(s.x, s.y, s.level);
  const cell = s.dungeon[at];
  if ((cell & 0xf0) === 0x40) {
    const who = await whoActs(g);
    if (who === -1) return;
    if ((cell & 7) !== 0) await springTrap(g, who);
    s.dungeon[at] = (cell & 8) + 0x70;
    g.say(0x8b96); // "\nChest opened\n"
  } else if ((cell & 0xf0) === 0x70) {
    g.say(0x8ba6); // "Already Open!\n"
  } else {
    g.say(0x8bb6); // "What?\n"
  }
}

/** SJOG_1374: Open: doors (which close again in four turns) and chests. */
export async function openCommand(g: Game): Promise<number> {
  const s = g.s;
  if (g.inDungeon) {
    await openInDungeon(g);
    return 1;
  }
  setTownTile(g, s.openDoor, s.doorX, s.doorY);
  if (!(await selectDirection(g))) return 1;
  const x = s.x + s.dx;
  const y = s.y + s.dy;
  const t = tileAt(g, x, y);
  switch (t) {
    case T.Trunk:
      g.say(0x8bbe); // "It's open!\n"
      break;
    case T.T99:
      g.say(0x8bca); // "Too heavy!\n"
      break;
    case T.T97:
    case T.T98:
    case T.DoorB9:
    case T.DoorBB:
      g.say(0x8bd6); // "Locked!\n"
      break;
    case T.DoorB8:
    case T.DoorBA:
      s.openDoor = t;
      s.doorTurns = 4;
      s.doorX = x & 0xff;
      s.doorY = y & 0xff;
      setTileAt(g, x, y, T.T44);
      g.viewDirty = 1;
      g.say(0x8be0); // "Opened!\n"
      void cue(g, 'DoorOpen');
      break;
    default:
      await openChest(g, x, y, s.level);
  }
  return 1;
}

// --- Get ------------------------------------------------------------------------------

/** SJOG_1458: take an item (`amount` is the actor's byte 5), and clear its actor (`actor` < 32). */
export function getObject(g: Game, tile: number, amount: number, actor: number): void {
  const s = g.s;
  switch (tile) {
    case 1:
      g.say(0x8c3e); // "Open it first!\n"
      return;
    case 0x19:
      g.say(0x8c4e); // "A moonstone!\n"
      s.moonstoneHeld[amount] = 0xff;
      break;
    case 0x1b:
      g.say(0x8c5c); // "A magic carpet!\n"
      s.carpets++;
      if (s.carpets === 100) s.carpets = 99;
      if (s.mapId === 0x11) removeNpc(g, 0x16);
      break;
    case 0xf:
      g.printNumber(amount);
      g.say(0x8c6e); // " food!\n"
      s.food = inc(s.food, amount, 9999);
      break;
    case 0xe:
      g.say(0x8c76); // "A sandalwood box!\n"
      s.sandalwoodBox = 0xff;
      s.npcKilled[0x43] |= 0x80;
      break;
    case 0xd:
      g.printNumber(amount);
      g.say(0x8c8a); // " torch"
      g.say(amount === 1 ? 0x8c92 : 0x8c96); // "!\n" : "es!\n"
      s.torches = inc(s.torches, amount, 99);
      break;
    case 8:
      g.printNumber(amount);
      g.say(0x8c9c); // " gem"
      g.say(amount === 1 ? 0x8ca2 : 0x8ca6); // "!\n" : "s!\n"
      s.gems = inc(s.gems, amount, 99);
      break;
    case 7:
      if (amount > 0x7f) {
        amount &= 0x7f;
        g.printNumber(amount);
        g.say(0x8caa); // " odd key"
        s.skullKeys = inc(s.skullKeys, amount, 99);
      } else {
        g.printNumber(amount);
        g.say(0x8cb4); // " key"
        s.keys = inc(s.keys, amount, 99);
      }
      g.say(amount === 1 ? 0x8cba : 0x8cbe); // "!\n" : "s!\n"
      break;
    case 4:
      if (amount === 0xff) {
        g.say(0x8cc2); // "The plans for the HMS Cape!\n"
        s.hmsCapePlans = 0xff;
      } else {
        g.say(0x8ce0); // "A scroll: "
        // Named by what it does, as the Use list names it (the port's; the original prints its runes).
        g.print(scrollEffect(g, amount & 7));
        g.say(0x8cec); // "!\n"
        s.scrolls[amount & 7] = Math.min(s.scrolls[amount & 7] + 1, 99);
      }
      break;
    case 2:
      g.printNumber(amount);
      g.say(0x8cf0); // " gold!\n"
      s.gold = inc(s.gold, amount, 9999);
      break;
    case 3:
      g.say(0x8cf8); // "A "
      // Named by what it does, as the Use list names it (the port's; the original prints its colour).
      g.print(`potion: ${POTION_LONG[amount & 7]}!\n`);
      s.potions[amount & 7] = Math.min(s.potions[amount & 7] + 1, 99);
      break;
    case 5:
    case 6:
    case 9:
    case 0xa:
    case 0xb:
    case 0xc:
      if (amount === 0x1b || amount === 0x1d) s.equipment[amount] = inc(s.equipment[amount], 5, 99);
      else s.equipment[amount] = Math.min(s.equipment[amount] + 1, 99);
      g.print(g.data.table(0x17f6, 0x30)[amount] ?? '');
      g.say(0x8d06); // "!\n"
      break;
    case 0xb4:
      s.shards[amount & 3] = 0xff;
      g.say(0x8d0a); // "The Shard of\n"
      g.say([0x8d18, 0x8d24, 0x8d2e, 0x8d2e][amount & 3]); // Falsehood, Hatred, Cowardice
      break;
    case 0xb5: {
      s.crown = 0xff;
      g.say(0x8d3a); // "The Crown of Lord British!\n"
      const n = npcOfActor(g, actor);
      setNpcKilled(g, n);
      if (n >= 0) removeNpc(g, n);
      break;
    }
    case 0xb6:
      s.sceptre = 0xff;
      g.say(0x8d56); // "The Sceptre of Lord British!\n"
      break;
    case 0xb7:
      s.amulet = 0xff;
      g.say(0x8d74); // "The Amulet of Lord British!\n"
      break;
    default:
      g.say(0x8d92); // "Nothing to get!\n"
      return;
  }
  if (actor < 0x20) setActor(g, actor, 0, 0, 0, 0, 0, 0);
  g.viewDirty |= 2;
  g.vitalsDirty = 1;
}

/** SJOG_179e: Get in a dungeon: an open chest's contents, by the level's depth (D_41bc..). */
function getInDungeon(g: Game): void {
  const s = g.s;
  g.say(0x8da4); // "Get\n"
  const at = dungeonCell(s.x, s.y, s.level);
  const cell = s.dungeon[at];
  if ((cell & 0xf0) === 0x40) {
    g.say(0x8daa); // "Must open first!\n"
    return;
  }
  if ((cell & 0xf0) !== 0x70) {
    g.say(0x8dda); // "Not here!\n"
    return;
  }
  s.dungeon[at] &= 8;
  g.say(0x8dbc); // "contents\nof chest\nYou find:\n"
  const odds = g.data.bytes(0x41bc, 8);
  const most = g.data.bytes(0x41c4, 8);
  const tiles = g.data.bytes(0x41cc, 8);
  for (let k = 0; k < 7; k++) {
    if (odds[k] > g.random(1, s.level * 4 + 4)) continue;
    if (k === 5) getObject(g, 3, g.random(0, 7), 0x20);
    else if (k === 6) getObject(g, 4, g.random(0, 7), 0x20);
    else getObject(g, tiles[k], k === 1 ? g.random(1, s.level << 3) : g.random(1, most[k]), 0x20);
  }
}

/**
 * A loose thing where the party stands - a shard Blinked onto, the carpet left lying there - for Get to take up (the
 * port's: in 1988 Get asked only a direction, and the party stepped off and reached back).
 */
export function thingUnderfoot(g: Game): boolean {
  const s = g.s;
  if (g.inDungeon) return false;
  for (let i = 1; i < 0x20; i++) {
    const a = s.actors[i];
    if (a.x !== s.x || a.y !== s.y || !(s.mapId > 0x7f || a.z === s.level)) continue;
    const t = a.tile;
    if ((t > 1 && t < 0x10) || t === 0x19 || t === 0x1b || (t & 0xfc) === 0xb4) return true;
  }
  return false;
}

/** SJOG_18ce: Get: items, torches from walls, crops and a bite from a plate. */
export async function getCommand(g: Game): Promise<number> {
  const s = g.s;
  if (g.inDungeon) {
    getInDungeon(g);
    return 1;
  }
  // With a controller, A at the prompt takes what lies underfoot (the marked square), where something does.
  if (!(await selectDirection(g, thingUnderfoot(g)))) return 1;
  const dx = s.dx;
  const dy = s.dy;
  const x = dx + s.x;
  const y = dy + s.y;
  g.say(0x8de6); // "\n"
  let i = 1;
  let tile = 0;
  for (; i < 0x20; i++) {
    const a = s.actors[i];
    if (a.x === (x & 0xff) && a.y === (y & 0xff) && (s.mapId > 0x7f || a.z === s.level)) {
      tile = a.tile;
      if (tile < 0x10 || tile === 0x19 || tile === 0x1b || (tile & 0xfc) === 0xb4) break;
    }
  }
  if (i < 0x20) {
    getObject(g, tile, s.actors[i].b5, i);
    return 1;
  }
  const t = tileAt(g, x, y);
  const eat = (): void => {
    g.say(0x8e04); // "Mmmmm...!\n"
    s.food = inc(s.food, 1, 9999);
    g.vitalsDirty = 1;
    if (s.karma !== 0) s.karma--;
  };
  switch (t) {
    case T.B0:
    case T.B1:
      setTileAt(g, x, y, T.T44);
      g.viewDirty = 1;
      if (s.mapId < 0x80) buildLightMap(g);
      s.d58a7 = 100;
      g.say(0x8de8); // "Borrowed!\n"
      if (!g.soundOff) await g.sound.sweep(800, 2000, 1, 0x32);
      updateFrame(g);
      break;
    case T.Crops:
      setTileAt(g, x, y, T.CropsPicked);
      g.viewDirty |= 2;
      g.say(0x8df4); // "Crops picked!\n"
      s.food = inc(s.food, 1, 9999);
      g.vitalsDirty = 1;
      if (s.karma !== 0) s.karma--;
      break;
    case T.Table9A:
      if (dy === 1) {
        setTileAt(g, x, y, T.Table95);
        g.viewDirty |= 2;
        eat();
      } else {
        g.say(0x8e10); // "Can't reach plate!\n"
      }
      break;
    case T.Table9B:
      if (dy === -1) {
        setTileAt(g, x, y, T.Table95);
        g.viewDirty |= 2;
        eat();
      } else {
        g.say(0x8e30);
      }
      break;
    case T.Table9C:
      if (dx === 1 || dx === -1) {
        g.say(0x8e44);
        break;
      }
      if (dy === 1) setTileAt(g, x, y, T.Table9B);
      if (dy === -1) setTileAt(g, x, y, T.Table9A);
      g.viewDirty |= 2;
      eat();
      break;
    default:
      g.say(0x8e64); // "Nothing to get!\n"
  }
  return 1;
}

export { callGuards, invertMember };
