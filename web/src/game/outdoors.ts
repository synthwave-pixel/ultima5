/**
 * outdoors.ts
 *
 * Britannia and the Underworld (u5d mainout.c, outsubs.c): moving on foot,
 * horseback, carpet, skiff and ship with the wind; slow terrain; the
 * wandering monsters, whirlpools and pirates and how they close in; trolls
 * under bridges, waterfalls, and the entrances to everything.
 */

import { actorTileAt, actorTileAtRev, canEnter, freeActor, setActor } from './actors.ts';
import { attackCombat, shoot } from './combat.ts';
import { processCommand, setActivePlayer } from './commands.ts';
import { commandPrompt, drawVitals, drawMoons, drawMapName, leftArrow, setWind, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { bumpCommand } from './bumpAct.ts';
import { asPad, bumpInto, getCharYN, getCommandKey, queueKeys, selectDirection } from './input.ts';
import { K } from './io.ts';
import { moongateTravel } from './moongate.ts';
import { musicForMap } from './music.ts';
import { Status } from './save.ts';
import { shrine } from './shrine.ts';
import { death } from './story.ts';
import { damageMember, damageParty, endTurn, firstActive, passTime } from './time.ts';
import { T } from './tiles.ts';
import { footstep } from './town.ts';
import { buildLightMap, centreChunks, loadChunks, shiftChunks, tileAt } from './world.ts';
import { explosion, shakeScreen, sleepTicks } from './effects.ts';
import { autosave } from './storage.ts';
import { cue } from './cues.ts';
import { enteredPlace } from './placeNames.ts';

/** D_2c55, D_2c57: every other turn under Quickness, and on horse or carpet. */
let quickTurn = 0;
let mountTurn = 0;

/** The world's actor file: BRIT.OOL on the surface, UNDER.OOL below (OUTSUBS_0368). */
export function worldActors(g: Game): Uint8Array {
  return g.s.level === 0 ? g.ool.brit : g.ool.under;
}

/** Save the world's actors to its file (the party is leaving it). */
export function stashWorldActors(g: Game): void {
  worldActors(g).set(g.s.b.subarray(0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100));
}

/** Restore them. */
export function unstashWorldActors(g: Game): void {
  g.s.b.set(worldActors(g), 0x5c5a - 0x55a6);
}

/** MAINOUT_0000: come out into the world: load the chunks around the party, the light, the wind, the moons. */
export function enterWorld(g: Game): void {
  const s = g.s;
  g.bumped.clear();
  drawMapName(g);
  passTime(g, 0);
  s.drawMap = s.newline = 1;
  g.viewDirty = 1;
  s.sailing = 0;
  centreChunks(g);
  passTime(g, 0);
  buildLightMap(g);
  setWind(g, -1);
  drawMoons(g);
  placeTreasures(g);
}

/** OUTSUBS_0566: in the Underworld, the Amulet and the shards lie where they wait to be found. */
function placeTreasures(g: Game): void {
  const s = g.s;
  if (s.level === 0) return;
  if (s.amulet === 0) {
    const a = s.actors[28];
    a.tile = a.anim = 0xb7;
    a.x = 0x69;
    a.y = 0xe1;
    a.z = 0xff;
    a.b5 = 0xf3;
  }
  const xs = g.data.bytes(0x3a06, 3);
  const ys = g.data.bytes(0x3a0a, 3);
  const b5 = g.data.bytes(0x3a0e, 3);
  for (let i = 0; i < 3; i++) {
    if (s.shards[i] === 0 && s.shadowlords[i] < 0x80) {
      const a = s.actors[29 + i];
      a.tile = a.anim = 0xb4;
      a.x = xs[i];
      a.y = ys[i];
      a.z = 0xff;
      a.b5 = b5[i];
    }
  }
}

/** MAINOUT_0d22: into the world's loop, with a ship bought in port waiting at the dock. */
export async function outdoorsEntry(g: Game): Promise<void> {
  const s = g.s;
  g.sound.music(0);
  enterWorld(g);
  if (s.boughtShip >= 0x40) {
    const i = freeActor(g);
    const a = s.actors[i];
    a.b7 = s.boughtShip & 0x3f;
    a.x = s.shipX;
    a.y = s.shipY;
    a.z = 0;
    a.tile = a.anim = s.boughtShip > 0x7f ? 0x25 : 0x29;
    a.b5 = 99;
    s.boughtShip = 0;
  }
  musicForMap(g);
  await outdoorsLoop(g);
}

// --- Moving the party -----------------------------------------------------------

/** MAINOUT_00da: turn the party's figure; a ship turning spends the move (and reports its hull). */
function turnParty(g: Game, dir: number): boolean {
  const s = g.s;
  let spent = false;
  switch (s.partyTile & 0xfc) {
    case 0x10:
      g.say(0x2946); // "Ride "
      if (dir === 1) s.partyTile = 0x12;
      else if (dir === 3) s.partyTile = 0x13;
      break;
    case 0x14:
      g.say(0x294c); // "Fly "
      if (dir === 1) s.partyTile = 0x14;
      else if (dir === 3) s.partyTile = 0x15;
      break;
    case 0x28:
      g.say(0x2951); // "Row "
      s.partyTile = dir + (s.partyTile & 0xfc);
      break;
    case 0x20:
    case 0x24: {
      const was = s.partyTile;
      s.partyTile = dir + (s.partyTile & 0xfc);
      if (was !== s.partyTile) {
        g.say(0x2956); // "Head "
        g.say([0x295c, 0x296a, 0x2963, 0x2970][dir]); // North, East, South, West
        s.newline = 1;
        spent = true;
        if (s.actors[0].b5 < 0x32) g.say(0x2976); // "Hull weak!\n"
      } else if (s.partyTile < 0x24 && s.wind === 0) {
        spent = true;
      }
      break;
    }
  }
  return spent;
}

/** Bump to act for what is not a creature (bumpAct.ts): the command queued toward (dx, dy), or false for none. */
function bumpOther(g: Game, other: number, dx: number, dy: number): boolean {
  const s = g.s;
  const command = bumpCommand(g, 'outdoors', other, tileAt(g, s.x + dx, s.y + dy), s.x + dx, s.y + dy);
  if (command === 0) return false;
  bumpInto(g, command, dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down);
  return true;
}

/** MAINOUT_01fe: may the party move by (dx, dy): boats and mounts can be boarded, ships run aground. */
async function mayMove(g: Game, dx: number, dy: number): Promise<boolean> {
  const s = g.s;
  if ((s.partyTile & 0xfc) === 0x24) g.say(0x2982); // "Rowing!\n"
  let ok = true;
  const other = actorTileAt(g, dx + s.x, dy + s.y, s.level);
  if (other !== 0) {
    ok = false;
    if (s.partyTile >= 0x30 || s.partyTile < 0x20) {
      if ((other >= 0x24 && other < 0x2c) || other === 0x1b || (other & 0xfe) === 0x10) ok = true;
    } else if (s.partyTile >= 0x28 && other >= 0x24 && other < 0x28) {
      ok = true;
    }
  }
  const ahead = g.view[(dy + 5) * 32 + dx + 5];
  ok = ok && canEnter(g, s.partyTile, ahead);
  if (!ok) {
    if (s.sailing !== 0) {
      if (ahead === T.Water3)
        g.say(0x298b); // "BREAKING UP!\n"
      else if (ahead !== T.T47) g.say(0x2999); // "COLLISION!\n"
      if (ahead === T.T47) {
        g.say(0x29a5); // "Docked!\n"
        s.partyTile += 4;
      } else {
        if (!g.soundOff) await g.sound.noise(100, 2000, 300);
        await hullDamage(g);
      }
      s.sailing = 0;
      s.newline = 1;
    } else if ((other & 0xfc) === 0xb4) {
      // Bump to act (the port's): walking into a shard, the Crown, the Sceptre or the Amulet where it lies picks it up.
      bumpInto(g, 0x47, dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down);
    } else if (
      ((other >= 0x80 && other !== 0xfc && (other < 0xe8 || other > 0xef)) || (other & 0xfc) === 0x2c) &&
      !(tileAt(g, s.x, s.y) < T.Poison && ((s.partyTile & 0xfc) === 0x28 || (s.partyTile & 0xfe) === 0x14))
    ) {
      // Bump to act (the port's): walking into a creature attacks it (where Attack would: not from a skiff or carpet on water).
      bumpInto(g, 0x41, dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down);
    } else if ((s.partyTile < 0x20 || s.partyTile >= 0x2c) && bumpOther(g, other, dx, dy)) {
      // Bump to act (the port's): anything else there is to do with it, off the water (bumpAct.ts).
    } else if (s.partyTile < 0x20 || (other & 0xfc) !== 0xec) {
      g.say(0x29ae); // "Blocked!\n"
      if (ahead === T.T2F) {
        g.say(0x29b8); // "OUCH!\n"
        await cue(g, 'Ouch');
        await damageParty(g);
      } else if (!g.soundOff) {
        void g.sound.tone(0xa5, 200);
      }
      g.p.flushKeys();
    }
  }
  return ok;
}

/** MAINOUT_0354: move the party by (dx, dy), sliding the chunk window when near its edge. */
export function stepParty(g: Game, dx: number, dy: number): void {
  const s = g.s;
  s.x = (s.x + dx) & 0xff;
  s.y = (s.y + dy) & 0xff;
  g.viewDirty = 1;
  const rx = (s.x - s.chunkX) & 0x1f;
  const ry = (s.y - s.chunkY) & 0x1f;
  if (rx < 5 || rx > 0x1a || ry < 5 || ry > 0x1a) {
    shiftChunks(g, dx, dy);
    s.chunkX = (dx * 16 + s.chunkX) & 0xf0;
    s.chunkY = (dy * 16 + s.chunkY) & 0xf0;
    loadChunks(g, dx, dy);
    buildLightMap(g);
  }
}

/** MAINOUT_03e0: swamp, brush and hills slow the party: the world moves on meanwhile. */
async function terrainDelay(g: Game): Promise<void> {
  const s = g.s;
  const t = tileAt(g, s.x, s.y);
  let kind: number;
  if (t === T.Grass) kind = 0;
  else if (t === T.T1E || t === T.T1F) kind = 1;
  else if (t < T.Poison || t >= T.Hut) kind = 0;
  else if (t >= T.T9) kind = 2;
  else kind = 1;
  let n = 0;
  if (kind === 1) {
    n += await monstersTurn(g);
    await monsterPause(g);
    if (n === 0) g.say(0x29bf); // "Slow progress!\n"
    passTime(g, 2);
  } else if (kind === 2) {
    n += await monstersTurn(g);
    await monsterPause(g);
    n += await monstersTurn(g);
    await monsterPause(g);
    if (n === 0) g.say(0x29cf); // "Very slow!\n"
    passTime(g, 4);
  }
}

/** MAINOUT_007a: a moment's pause when a monster is near (the original's loop only ever looks at actor 1). */
export async function monsterPause(g: Game): Promise<void> {
  const s = g.s;
  const a = s.actors[1];
  if (a.tile !== 0 && a.z === s.level && Math.abs(s.x - a.x) < 6 && Math.abs(s.y - a.y) < 6) await sleepTicks(g, 1);
}

/** MAINOUT_0490: a move key: turn, check, step; returns whether the turn is spent. */
async function moveKey(g: Game, key: number, sailingOnly: boolean): Promise<boolean> {
  const s = g.s;
  if ((s.partyTile & 0xfc) === 0x20) {
    if (key !== s.sailing) {
      s.sailing = key;
      s.sailTurns = 0;
    }
    s.newline = 0;
  }
  if (s.partyTile === 0x1c || (s.partyTile & 0xfe) === 0x12) void footstep(g);
  const dirs: Record<number, [number, number, number, number]> = {
    [K.Up]: [0, -1, 0, 0x29db],
    [K.Down]: [0, 1, 2, 0x29e2],
    [K.Right]: [1, 0, 1, 0x29e9],
    [K.Left]: [-1, 0, 3, 0x29ef],
  };
  const d = dirs[key];
  if (!d) return true;
  g.text.moving = true; // a move: said again, it folds with a count (text.ts)
  const [dx, dy] = d;
  if (turnParty(g, d[2])) return true;
  if (s.sailing === 0) g.say(d[3]); // "North" etc.
  // The Underworld's dark (the black squares round Doom): without the Amulet worn the party cannot move about in it
  // (MAINOUT_0a84, `sailingOnly`). The port keeps it from stepping in at all, and lets a party caught there step back
  // out to the light - where 1988 let it walk or fly one square in and held it there for good.
  const intoDark = tileAt(g, s.x + dx, s.y + dy) === 0xff && g.regalia !== 0x0e;
  if (intoDark) {
    g.say(0x29ae); // "Blocked!\n"
    return false;
  }
  const ok = await mayMove(g, dx, dy);
  if (ok && (!sailingOnly || tileAt(g, s.x + dx, s.y + dy) !== 0xff)) {
    if ((s.partyTile & 0xfe) === 0x12) void footstep(g);
    stepParty(g, dx, dy);
    await terrainDelay(g);
  }
  return ok;
}

/**
 * MAINOUT_0598: the next command. A ship under sail keeps sailing on the
 * wind until a key (other than its heading) is pressed; how often it
 * moves depends on the wind against the heading.
 */
export async function nextCommand(g: Game): Promise<number> {
  const s = g.s;
  updateFrame(g);
  if (g.vitalsDirty !== 0) {
    drawVitals(g);
    g.vitalsDirty = 0;
  }
  if ((g.view[6 * 32 + 5] & 0xfc) === 0xd4) {
    await falls(g);
    return 0;
  }
  if (s.newline !== 0) commandPrompt(g);
  s.newline = 1;
  let key = 0;
  while (s.sailing !== 0) {
    const raw = g.p.pollKey();
    // A keyboard read as a controller is one under sail too (a letter that is no button, nothing), and a button is
    // the command prompt's, as it is on foot - B the space bar's "Sheets in irons!", A the menu, X Cast, Y Look,
    // Start the Pause menu - where a button went on to the commands as a key none knew ("What?"), the ship sailing on.
    key = raw === 0 ? 0 : asPad(g, raw);
    const prompts = key >= 0x100 || key === K.Escape || (g.options.input === 'controller' && (key === K.Enter || key === K.Tab));
    if (prompts) {
      queueKeys(key);
      return getCommandKey(g, 'outdoors');
    }
    key = key >= 0x61 && key <= 0x7a ? key - 0x20 : key;
    if (key !== 0 && key !== s.sailing) break;
    key = s.sailing;
    if (s.wind !== 0) {
      let dy = 0;
      let dx = 0;
      if (key === K.Up) dy = -1;
      else if (key === K.Down) dy = 1;
      else if (key === K.Right) dx = 1;
      else if (key === K.Left) dx = -1;
      let against = 1;
      if (g.data.sbytes(0x29f6, 4)[s.wind - 1] !== dx) against++;
      if (g.data.sbytes(0x29fa, 4)[s.wind - 1] !== dy) against++;
      if (against % 3 <= s.sailTurns) {
        s.sailTurns = 0;
        break;
      }
    }
    if (s.hmsCapePlans > 0x7f) {
      g.shipHalf = g.shipHalf === 0 ? 1 : 0;
      passTime(g, 1);
    } else {
      passTime(g, 2);
    }
    if (g.shipHalf === 0 || s.hmsCapePlans < 0x80) await monstersTurn(g);
    await sleepTicks(g, 1);
    s.sailTurns++;
  }
  if (s.sailing === 0) key = await getCommandKey(g, 'outdoors');
  return key;
}

// --- Entering places ---------------------------------------------------------------

/** OUTSUBS_0388: into the settlement at the party's square, stashing the world's actors. */
function enterSettlement(g: Game, kind: string): boolean {
  const s = g.s;
  g.print(kind);
  const locs = g.data.locations;
  let i = 0;
  for (; i < 0x20; i++) if (locs[i].x === s.x && locs[i].y === s.y) break;
  if (i >= 0x20) {
    g.say(0x39a8); // "\nWhat town?\n"
    return true;
  }
  if (i < 0xd || i > 0x11) {
    g.say(0x399c); // "\n\n"
    g.printChar(0xfc);
    g.print(g.data.table(0x1e3a, 0x28)[i]);
    g.printChar(0xfb);
  }
  g.printChar('\n');
  autosave(g); // outside the place, before going in (storage.ts)
  stashWorldActors(g);
  s.mapId = i + 1;
  s.level = 0;
  s.x = 0xf;
  s.y = 0x1e;
  return false;
}

/** MAINOUT_0790: into the dungeon at the party's square (on foot only; the Shadowlords guard Doom). */
async function enterDungeon(g: Game, kind: string): Promise<boolean> {
  const s = g.s;
  g.print(kind);
  const locs = g.data.locations;
  let i = 0x20;
  for (; i < 0x28; i++) if (locs[i].x === s.x && locs[i].y === s.y) break;
  if (i >= 0x28) {
    g.say(0x2a5f); // "\nWhat dungeon?\n"
    return true;
  }
  if (s.partyTile !== 0x1c) {
    g.say(0x2a24); // "\nOn foot!\n"
    return false;
  }
  if (i === 0x27) {
    if ((s.shadowlords[0] & s.shadowlords[1] & s.shadowlords[2]) < 0x80) {
      g.say(0x2a2f); // "\nAttacked at entrance!\n"
      const a = freeActor(g);
      s.actors[a].tile = 0xfc;
      await attackCombat(g, a);
      return false;
    }
  } else {
    g.say(0x2a47); // "\n\n"
    g.printChar(0xfc);
    g.print(g.data.table(0x1e3a, 0x28)[i]);
    g.printChar(0xfb);
  }
  g.printChar('\n');
  autosave(g); // outside the place, before going in (storage.ts)
  stashWorldActors(g);
  s.dungeon.set(g.data.files.get('DUNGEON.DAT').subarray((i - 0x20) * 0x200, (i - 0x20) * 0x200 + 0x200));
  s.mapId = i + 1;
  if (s.level !== 0 && i + 1 !== 0x28) {
    s.level = 7;
    s.facing = 3;
    s.d6602 = 4;
    s.x = s.y = 7;
  } else {
    s.level = 0;
    s.x = s.y = 1;
    s.facing = 1;
    s.d6602 = 5;
  }
  return true;
}

/** MAINOUT_08de: Enter. */
export async function enterCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x2a6f); // "Enter "
  const t = tileAt(g, s.x, s.y);
  enteredPlace(g, s.x, s.y); // its name learnt, for the map (the port's)
  const kinds: Record<number, number> = {
    [T.Hut]: 0x2a85,
    [T.Keep]: 0x2aa3,
    [T.Village]: 0x2aa8,
    [T.Towne]: 0x2ab0,
    [T.Castle]: 0x2ab6,
    [T.Lighthouse]: 0x2ad5,
    [T.PalaceBlackthorn]: 0x2ae0,
    [T.CastleLB]: 0x2afa,
  };
  switch (t) {
    case T.Shrine: {
      g.say(0x2a76); // "the shrine of\n"
      const xs = g.data.bytes(0x1f6e, 8);
      const ys = g.data.bytes(0x1f76, 8);
      let i = 0;
      for (; i < 8; i++) if (xs[i] === s.x && ys[i] === s.y) break;
      g.print(g.data.table(0x1f4e, 8)[i] ?? '');
      g.printChar('\n');
      await shrine(g);
      return 1;
    }
    case T.Codex:
      g.say(0x2a89); // "the Shrine of the Codex!\n"
      await shrine(g);
      return 1;
    case T.Cave:
      return (await enterDungeon(g, g.t(0x2abd))) ? 1 : 0;
    case T.Mine:
      return (await enterDungeon(g, g.t(0x2ac2))) ? 1 : 0;
    case T.Dungeon:
      return (await enterDungeon(g, g.t(0x2ac7))) ? 1 : 0;
    case T.Ruins:
      g.say(0x2acf); // "ruins"
      return 1;
    default:
      if (kinds[t] !== undefined) return enterSettlement(g, g.t(kinds[t])) ? 1 : 0;
      g.say(0x2b16); // "What?\n"
      return 0;
  }
}

/** MAINOUT_06ec: Attack outdoors. */
export async function attackOutdoors(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x29fe); // "Attack-"
  if (tileAt(g, s.x, s.y) < T.Poison && ((s.partyTile & 0xfc) === 0x28 || (s.partyTile & 0xfe) === 0x14)) {
    g.say(0x2a06); // "On foot!\n"
    return 0;
  }
  if (await selectDirection(g)) {
    const x = s.x + s.dx;
    const y = s.y + s.dy;
    const dir = s.dx;
    const target = actorTileAt(g, x, y, s.level) & 0xfc;
    if (target === 0x2c || (target !== 0xb4 && target !== 0xe8 && target >= 0x40)) await attackCombat(g, s.dx === 32 ? dir : s.dx);
    else g.say(0x2a10); // "Nothing to attack!\n"
  }
  return 0;
}

// --- The world's creatures ---------------------------------------------------------

/** MAINOUT_0d8c: how likely a monster is to appear here: by terrain, more at night, always below. */
function spawnOdds(g: Game): number {
  const s = g.s;
  if (s.level > 0x7f) return 3;
  const t = tileAt(g, s.x, s.y);
  let odds: number;
  if (t >= T.T20 && t <= T.T26) odds = 0;
  else if (t === T.Poison || (t >= T.T9 && t <= T.F)) odds = 2;
  else odds = 1;
  return s.hour >= 0x20 || s.hour < 5 ? odds + 3 : odds;
}

/** MAINOUT_0e04: pick from a table of weights out of 256. */
function weighted(g: Game, weights: Uint8Array): number {
  let r = g.random(0, 0xff);
  let i = 0;
  while (weights[i] <= r) {
    r -= weights[i];
    i++;
  }
  return i;
}

/** MAINOUT_0e4e: what monster (if any) appears on this tile. */
function spawnFor(g: Game, t: number): number {
  const s = g.s;
  if (t < T.Poison || (t >= T.T60 && t <= T.T6F) || (t >= T.Waterfall && t <= T.Waterfall + 3) || (t >= T.WaterE4 && t <= T.WaterE7)) {
    if (g.random(0, 0x40) < 0x10) {
      if (s.level < 0x80) {
        if (t === 1 && g.random(0, 7) === 7) return 0xec;
        return g.data.bytes(0x2bd4, 6)[weighted(g, g.data.bytes(0x2bf0, 6))];
      }
      return g.data.bytes(0x2bda, 2)[weighted(g, g.data.bytes(0x2bf6, 2))];
    }
  } else if (t === T.T7) {
    if (g.random(0, 3) === 0) return 0xe0;
  } else {
    if (t === T.Poison && s.level === 0xff) return 0xf8;
    if (t === T.C || t === T.D) return 0;
    if (t < T.Hut || (t & 0xfc) === T.T30) {
      if (s.level < 0x80) return g.data.bytes(0x2bc0, 0xc)[weighted(g, g.data.bytes(0x2bdc, 0xc))];
      return g.data.bytes(0x2bcc, 8)[weighted(g, g.data.bytes(0x2be8, 8))];
    }
  }
  return 0;
}

/** MAINOUT_0f4e: a random square in the chunk window, out of sight (more than 6 away). */
function spawnSquare(g: Game): void {
  const s = g.s;
  do {
    s.dx = (g.random(0, 0x1f) + s.chunkX) & 0xff;
    s.dy = (g.random(0, 0x1f) + s.chunkY) & 0xff;
  } while (Math.abs(s.dx - s.x) <= 6 || Math.abs(s.dy - s.y) <= 6 || Math.abs(s.dx - s.x) >= 0xfa || Math.abs(s.dy - s.y) >= 0xfa);
}

/** MAINOUT_0fc4: try to bring a monster into the world. */
function spawn(g: Game): void {
  const s = g.s;
  let tile = 0;
  let x = 0;
  let y = 0;
  let tries = 0;
  for (; tries < 0x80; tries++) {
    spawnSquare(g);
    x = s.dx;
    y = s.dy;
    tile = spawnFor(g, tileAt(g, x, y));
    if (tile !== 0 && (tile !== 0x2c || (tileAt(g, x, y) & 0xf0) !== T.T60)) break;
  }
  if (tries === 0x80) return;
  const i = freeActor(g);
  setActor(g, i, tile, tile, x, y, s.level, 0);
  if (tile === 0x2c) s.actors[i].b5 = 100;
}

/** MAINOUT_105c: actors that move and fight (pirates, and monsters but not shards, crowns or the like). */
function isCreature(t: number): boolean {
  if (t >= 0x2c && t <= 0x2f) return true;
  if (t < 0x80) return false;
  if ((t >= 0xb4 && t <= 0xb7) || (t >= 0xe8 && t <= 0xeb)) return false;
  return true;
}

/** MAINOUT_109e: damage to the ship's hull (sunk: to the skiffs, a carpet, or the sea), or to the party. */
export async function hullDamage(g: Game): Promise<void> {
  const s = g.s;
  if ((s.partyTile & 0xf8) !== 0x20) {
    await damageParty(g);
    return;
  }
  const hit = g.random(1, 0x1e);
  const ship = s.actors[0];
  if (hit < ship.b5) {
    ship.b5 -= hit;
    drawVitals(g);
    return;
  }
  g.say(0x6ada); // "Ship sunk!\n"
  const skiffs = ship.b7;
  if (skiffs > 0 || s.carpets !== 0) {
    g.say(0x6ae6); // "Abandon ship!\n"
    if (skiffs > 0) {
      s.partyTile = (s.partyTile & 3) + 0x28;
    } else {
      s.carpets--;
      s.partyTile = g.random(0, 1) + 0x14;
    }
    g.vitalsDirty = 1;
    return;
  }
  s.partyTile = 0;
  drawVitals(g);
  updateFrame(g);
  if (!g.soundOff) await g.sound.sweep(0x294, 0x96, 0x28, 0x1e78);
  g.say(0x6af6); // "DROWNING!!!\n"
  while (firstActive(g) !== -1) {
    await explosion(g, s.x, s.y);
    await damageParty(g);
  }
}

/** MAINOUT_1168: a pirate ship's broadside. */
async function broadside(g: Game, i: number, dx: number, dy: number): Promise<void> {
  const s = g.s;
  const a = s.actors[i];
  if (dx === 0 && (a.anim === 0x2c || a.anim === 0x2e)) a.anim = (g.random(0, 3) & 2) + 0x2d;
  if (dy === 0 && (a.anim === 0x2d || a.anim === 0x2f)) a.anim = (g.random(0, 3) & 2) + 0x2c;
  updateFrame(g);
  if (!g.soundOff) await g.sound.sweep(0x514, 300, 5, 100);
  const vx = (a.x - s.x + 5) & 0xff;
  const vy = (a.y - s.y + 5) & 0xff;
  if (await shoot(g, vx, vy, 5, 5, 1)) {
    updateFrame(g);
    await explosion(g, s.x, s.y);
    await hullDamage(g);
  }
}

/** MAINOUT_1248: a creature next to the party: a whirlpool swallows, sand traps and bridges bite, others fight. */
async function creatureReaches(g: Game, i: number): Promise<void> {
  const s = g.s;
  const a = s.actors[i];
  if ((a.tile & 0xfc) === 0xec) {
    if (s.partyTile === 0x1c) {
      await hullDamage(g);
      return;
    }
    a.tile = a.anim = 0;
    g.say(0x6b04); // "\nWHIRLPOOL!\n"
    const tile = s.partyTile;
    s.partyTile = 0xec;
    updateFrame(g);
    if (!g.soundOff) await g.sound.sweep(0x294, 0x96, 0x28, 0x1e78);
    s.partyTile = tile;
    await hullDamage(g);
    g.sound.music(0);
    s.level = 0xff;
    s.x = 0x22;
    s.y = 0x12;
    enterWorld(g);
    musicForMap(g);
  } else if ((a.tile & 0xfc) !== 0xe0) {
    updateFrame(g);
    g.say(0x6b12); // "\nAttacked!\n"
    if (tileAt(g, s.x, s.y) < T.Poison && ((s.partyTile & 0xfe) === 0x14 || (s.partyTile & 0xfc) === 0x28)) {
      await hullDamage(g);
      return;
    }
    await attackCombat(g, i);
  } else {
    await hullDamage(g);
  }
}

/** MAINOUT_131a: does creature `i` act on the party this turn (reach it, spit fire, fire cannon)? */
async function creatureActs(g: Game, i: number): Promise<number> {
  const s = g.s;
  const a = s.actors[i];
  const tile = a.tile;
  let dx = Math.abs(a.x - s.x);
  if (dx > 0x7f) dx = 0x100 - dx;
  let dy = Math.abs(a.y - s.y);
  if (dy > 0x7f) dy = 0x100 - dy;
  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    await creatureReaches(g, i);
    return 1;
  }
  if (tile === 0x88 || tile === 0xdc) {
    if (dx <= 3 && dy <= 3 && g.random(0, 7) === 0) {
      updateFrame(g);
      if (!g.soundOff) await g.sound.sweep(0x514, 300, 5, 100);
      const vx = (a.x - s.x + 5) & 0xff;
      const vy = (a.y - s.y + 5) & 0xff;
      if (await shoot(g, vx, vy, 5, 5, 3)) {
        await explosion(g, s.x, s.y);
        await hullDamage(g);
      }
      return 1;
    }
  } else if ((tile & 0xfc) === 0x2c && ((dx === 0 && dy < 4) || (dy === 0 && dx < 4))) {
    g.say(0x6b1e); // "* BOOOM! *\n\n"
    await broadside(g, i, dx, dy);
    return 1;
  }
  return 0;
}

/** MAINOUT_1482: can creature `i` go to (x, y). */
function creatureCanGo(g: Game, i: number, x: number, y: number): boolean {
  const s = g.s;
  if (!canEnter(g, s.actors[i].tile, tileAt(g, x, y))) return false;
  return actorTileAtRev(g, x, y, s.level) === 0;
}

/** MAINOUT_14c8: not back where it just was. */
const notBack = (g: Game, x: number, y: number): boolean => !(x === g.a526 && y === g.a527);

/** MAINOUT_14ea: is the party in a Shadowlord's sight (D_2c18). */
function seesParty(g: Game, i: number): number {
  const s = g.s;
  const a = s.actors[i];
  let dx = Math.abs(a.x - s.x);
  if (dx > 0x7f) dx = 0x100 - dx;
  let dy = Math.abs(a.y - s.y);
  if (dy > 0x7f) dy = 0x100 - dy;
  if (dx < 6 && dy < 6) return g.data.bytes(0x2c18, 0x3c)[dx + dy * 0xb];
  return 0;
}

/** MAINOUT_1578: creature `i` steps by (dx, dy); rough ground may stop it; pirates turn to face. */
function creatureStep(g: Game, i: number, dx: number, dy: number): void {
  const s = g.s;
  const a = s.actors[i];
  const tile = a.tile;
  const x = (a.x + dx) & 0xff;
  const y = (a.y + dy) & 0xff;
  const under = tileAt(g, x, y);
  if ((tile & 0xfc) === 0x2c) {
    let facing = 0;
    if (dx === 0 && dy === -1) facing = 0;
    else if (dx === 1 && dy === 0) facing = 1;
    else if (dx === 0 && dy === 1) facing = 2;
    else if (dx === -1 && dy === 0) facing = 3;
    a.tile = a.anim = facing + 0x2c;
  } else if (tile !== 0xdc && tile !== 0x94 && tile !== 0xd8 && tile !== 0xf0) {
    switch (under) {
      case T.Poison:
      case T.T6:
      case T.T7:
      case T.T8:
      case T.T1E:
      case T.T1F:
        if (g.random(0, 1) === 0) return;
        break;
      case T.T9:
      case T.A:
      case T.B:
      case T.C:
      case T.D:
      case T.E:
      case T.F:
        if (g.random(0, 2) !== 2) return;
        break;
    }
  }
  g.a526 = a.x;
  g.a527 = a.y;
  a.x = x;
  a.y = y;
  g.viewDirty |= 2;
  if (tileAt(g, x, y) === T.Moongate) a.tile = a.anim = 0;
}

/** MAINOUT_16fc: a random step. */
function randomStep(g: Game, i: number): void {
  const a = g.s.actors[i];
  const x = a.x;
  const y = a.y;
  switch (g.random(0, 3)) {
    case 0:
      if (creatureCanGo(g, i, x, y - 1)) creatureStep(g, i, 0, -1);
      return;
    case 1:
      if (creatureCanGo(g, i, x + 1, y)) creatureStep(g, i, 1, 0);
      return;
    case 2:
      if (creatureCanGo(g, i, x, y + 1)) creatureStep(g, i, 0, 1);
      return;
    default:
      if (creatureCanGo(g, i, x - 1, y)) creatureStep(g, i, -1, 0);
  }
}

/** MAINOUT_17d4: step toward the party, one axis or the other, else at random. */
function chase(g: Game, i: number): void {
  const s = g.s;
  const a = s.actors[i];
  const x = a.x;
  const y = a.y;
  let rx = (a.x - s.x) & 0xff;
  if (rx > 0x7f) rx -= 0x100;
  let ry = (a.y - s.y) & 0xff;
  if (ry > 0x7f) ry -= 0x100;
  const sx = rx === 0 ? 0 : rx > 0 ? -1 : 1;
  const sy = ry === 0 ? 0 : ry > 0 ? -1 : 1;
  const tryX = (): boolean => {
    if (sx !== 0 && creatureCanGo(g, i, x + sx, y) && notBack(g, x + sx, y)) {
      creatureStep(g, i, sx, 0);
      return true;
    }
    return false;
  };
  const tryY = (): boolean => {
    if (sy !== 0 && creatureCanGo(g, i, x, y + sy) && notBack(g, x, y + sy)) {
      creatureStep(g, i, 0, sy);
      return true;
    }
    return false;
  };
  if (g.random(0, 1) === 1) {
    if (tryX() || tryY()) return;
  } else if (tryY() || tryX()) {
    return;
  }
  randomStep(g, i);
}

/** MAINOUT_198c: how creature `i` moves: whirlpools drift, Shadowlords pursue a while, pirates need a wind. */
function creatureMoves(g: Game, i: number): void {
  const s = g.s;
  const a = s.actors[i];
  const tile = a.tile;
  if ((tile & 0xfc) === 0xec) {
    a.b5 ^= 1;
    if (a.b5 === 0) return;
    if (g.random(0, 1) === 0) {
      randomStep(g, i);
      return;
    }
  } else if (tile === 0xfc) {
    if (seesParty(g, i) !== 0 && a.b5++ < 0x14) {
      chase(g, i);
      return;
    }
  } else if ((tile & 0xfc) === 0x2c) {
    if (s.wind === 0) return;
    const speed = g.data.bytes(0x2bf8, 0x20)[((a.tile - 0x2c) * 4 + (s.wind - 1)) * 2];
    if (speed !== 4 && speed < ++a.b7) {
      a.b7 = 0;
      return;
    }
  }
  chase(g, i);
}

/** MAINOUT_1a60: the world's turn: perhaps a new monster, then each creature acts or moves; those far away vanish. */
export async function monstersTurn(g: Game): Promise<number> {
  const s = g.s;
  let acted = 0;
  if (s.icon === 0x54) return 0;
  if (s.icon === 0x51) {
    quickTurn ^= 1;
    if (quickTurn !== 0) return 0;
  }
  if ((s.partyTile & 0xfe) === 0x12 || (s.partyTile & 0xfe) === 0x14) {
    mountTurn ^= 1;
    if (mountTurn !== 0) return 0;
  }
  if (spawnOdds(g) > g.random(1, 0x1e)) spawn(g);
  for (let i = 0x1f; i > 0; i--) {
    if (!isCreature(s.actors[i].tile)) continue;
    acted += await creatureActs(g, i);
    if (acted === 0) creatureMoves(g, i);
  }
  for (let i = 0x1f; i > 0; i--) {
    const a = s.actors[i];
    if (isCreature(a.tile) && (((a.x - s.chunkX) & 0xff) > 0x1f || ((a.y - s.chunkY) & 0xff) > 0x1f)) setActor(g, i, 0, 0, 0, 0, 0, 0);
  }
  return acted;
}

// --- Hazards --------------------------------------------------------------------------

/** OUTSUBS_0458: over the falls: bruises, and at one place, down into the Underworld. */
export async function falls(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x39b5); // "F-A-L-L-S!!!\n"
  stepParty(g, 0, 1);
  await sleepTicks(g, 1);
  stepParty(g, 0, 1);
  if (!g.soundOff) await g.sound.sweep(0x9c4, 800, 1, 300);
  const tile = s.partyTile;
  s.partyTile = 0;
  await sleepTicks(g, 1);
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.status !== Status.Dead && m.dex <= roll30(g)) await damageMember(g, i, 1);
  }
  await sleepTicks(g, 2);
  s.partyTile = tile;
  if (s.x === 0x36 && s.y === 0x8a) {
    g.say(0x39c3); // "Falling into underworld!!\n"
    g.sound.music(0);
    s.level = 0xff;
    g.ool.brit.set(s.b.subarray(0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100));
    s.b.set(g.ool.under, 0x5c5a - 0x55a6);
    enterWorld(g);
    musicForMap(g);
  }
}

/** ULTIMA_3abe: a roll of 1-30. */
export function roll30(g: Game): number {
  const n = Math.trunc(g.rng.upTo(0x3c) / 2);
  return n === 0 ? 1 : n;
}

/** OUTSUBS_05fc: poison fields. */
function poisonField(g: Game): void {
  const s = g.s;
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.status !== Status.Dead && m.status !== Status.Poisoned && m.dex < g.random(1, 0x1e)) {
      m.status = Status.Poisoned;
      g.say(0x3a1b); // "Poisoned!\n"
    }
  }
}

/** MAINOUT_1b3e: the trolls' toll, or a fight. */
async function trollToll(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x6b2c); // "Caught!\n\nThe trolls demand a "
  firstActive(g);
  const toll = -(s.members[s.dx].str * 3 - 99);
  g.printNumber(toll, 2, ' ');
  g.say(0x6b4a); // " gp toll!\n\nDost thou pay?"
  let k: number;
  do k = await getCharYN(g);
  while (k !== 0x59 && k !== 0x4e);
  g.printChar(k);
  g.printChar('\n');
  if (k === 0x59) {
    s.gold -= toll;
    g.vitalsDirty = 1;
    if (s.gold >= 0) return;
    s.gold += toll;
  }
  const i = freeActor(g);
  setActor(g, i, 0xe4, 0, s.x, s.y, 0, 0);
  await attackCombat(g, i);
}

/** MAINOUT_1be8: trolls under the bridge, one time in eight, for a party on foot. */
async function bridgeTrolls(g: Game): Promise<void> {
  const s = g.s;
  if (g.random(0, 7) !== 0 || s.partyTile !== 0x1c) return;
  updateFrame(g);
  g.say(0x6b64); // "\nThou spieth trolls under the bridge!\n\n"
  await sleepTicks(g, 10);
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    if (m.status === Status.Dead || m.status === Status.Sleeping) continue;
    g.print(m.name);
    g.say(0x6b8c); // " sneaks across"
    for (let k = 0; k < 3; k++) {
      await sleepTicks(g, 5);
      g.printChar('.');
    }
    g.say(0x6b9c); // "\n\n"
    if (m.dex < g.random(1, 0x1e)) {
      await trollToll(g);
      return;
    }
  }
  g.say(0x6ba0); // "Trolls evaded!\n"
}

/** MAINOUT_0a1a: on a black square (the Underworld's dark), the light goes out. */
function darkSquare(g: Game, dark: boolean): boolean {
  const s = g.s;
  if (tileAt(g, s.x, s.y) === 0xff && g.regalia !== 0x0e) {
    // the Amulet worn keeps the light
    s.light = 0;
    if (!dark) {
      updateFrame(g);
      return true;
    }
    return dark;
  }
  passTime(g, 0);
  return false;
}

/** MAINOUT_0a60: rumblings in the Underworld. */
async function earthquake(g: Game): Promise<void> {
  if (g.s.level !== 0 && g.random(0, 0xff) === 0x69) {
    g.say(0x2b1d); // "EARTHQUAKE!\n"
    await shakeScreen(g);
    await damageParty(g);
  }
}

/** MAINOUT_0a84_MainLoop. */
export async function outdoorsLoop(g: Game): Promise<void> {
  const s = g.s;
  let dark = false;
  let done = false;
  while (!done) {
    let spent = true;
    dark = darkSquare(g, dark);
    const state = firstActive(g);
    if (state === 1) {
      g.printChar('\n');
      leftArrow(g);
      g.say(0x2b2a); // "Zzzzzz...\n"
    } else if (state === -1) {
      stashWorldActors(g);
      await death(g);
      done = true;
      spent = false;
    } else {
      if (await moongateTravel(g)) await shrine(g);
      if (s.mapId !== 0) return;
      const key = await nextCommand(g);
      if (key < 0x20) {
        switch (key) {
          case K.CtrlK:
            g.printNumber(s.karma);
            g.printChar('\n');
            spent = false;
            break;
          case K.CtrlV:
            g.say(0x2b4f);
            g.printChar('\n');
            spent = false;
            break;
          case K.CtrlS:
            g.say(0x2b54); // "Sound "
            g.say(g.soundOff ? 0x2b5b : 0x2b60); // "Off\n" : "On\n"
            g.soundOff = !g.soundOff;
            break;
          case K.Left:
          case K.Right:
          case K.Up:
          case K.Down:
            spent = await moveKey(g, key, dark);
            break;
          case 0:
            spent = false;
            break;
          default:
            g.say(0x2b64); // "What?\n"
            break;
        }
      } else if (key < 0x30 || key > 0x39) {
        spent = (await processCommand(g, key)) !== 0;
      } else {
        spent = (await setActivePlayer(g, key)) !== 0;
      }
    }
    if ((s.partyTile & 0xfc) !== 0x20) s.sailing = 0;
    if (s.mapId !== 0) {
      done = true;
    } else if (spent) {
      passTime(g, 2);
      const t = tileAt(g, s.x, s.y);
      if ((t & 0xfe) === T.T6A) {
        await bridgeTrolls(g);
      } else if (t === T.Poison && s.partyTile === 0x1c) {
        poisonField(g);
        await sleepTicks(g, 1);
      } else if (t === T.Lava) {
        updateFrame(g);
        g.say(0x3a11); // "Burning!\n"
        await damageParty(g);
      } else if (s.x === 0xe9 && s.y === 0xeb && s.level === 0 && s.mapId === 0) {
        g.say(0x2b6b); // "\n\""
        if (s.questActive !== 0) {
          g.say(0x2b6e); // "Pass, Seeker!\"\n"
        } else {
          g.say(0x2b7e); // "Thou art not upon a Sacred Quest!\n"
          g.say(0x2ba1); // "Passage denied!\"\n"
          s.y++;
        }
      }
      await earthquake(g);
      await endTurn(g);
      if (t === 1 && ((s.partyTile & 0xfc) === 0x28 || (s.partyTile & 0xfe) === 0x14)) {
        g.say(0x2bb3); // "Rough seas!\n"
        await explosion(g, s.x, s.y);
        await hullDamage(g);
      }
      if ((t & 0xfc) === T.Waterfall) await falls(g);
      await monstersTurn(g);
    }
  }
}
