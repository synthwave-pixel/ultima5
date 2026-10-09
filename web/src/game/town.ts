/**
 * town.ts
 *
 * Settlements (u5d town.c): entering and leaving, stairs and ladders,
 * drawbridges by the hour, felled trees and picked crops where a
 * Shadowlord walks, trapdoors and fireplaces, the guards, and the main
 * loop that reads a command and gives the people their turn.
 */

import { actorTileAt, canEnter, freeActor, actorTileAtRev } from './actors.ts';
import { attackCombat } from './combat.ts';
import { processCommand, setActivePlayer } from './commands.ts';
import { commandPrompt, drawVitals, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { bumpCommand, jimmyWho } from './bumpAct.ts';
import { bumpInto, getCharYN, getCommandKey, selectDirection } from './input.ts';
import { HARPSICHORD, K } from './io.ts';
import { HARPSICHORD_TILE, openTheWay, strike } from './harpsichord.ts';
import { moongateTravel } from './moongate.ts';
import { loadNpcs, moveNpcs, placeNpcs, putNpc, scheduleSlot } from './npc.ts';
import { Status } from './save.ts';
import { blackthornCapture, death } from './story.ts';
import { counter, talkToNpc } from './talk.ts';
import { damageParty, endTurn, firstActive, passTime } from './time.ts';
import { DosRandom } from './rng.ts';
import { T } from './tiles.ts';
import { buildLightMap, setTownTile, tileAt, tileCell, setTileAt } from './world.ts';
import { drawMoons, drawMapName, setWind } from './frame.ts';
import { shrine } from './shrine.ts';
import { cue } from './cues.ts';

const decrease = (v: number, n: number): number => (v > n ? v - n : 0);

// --- The dead and the missing ---------------------------------------------------

/** TOWN_0000: has NPC `i` been killed here (people and the sandalwood box are remembered). */
export function npcKilled(g: Game, i: number): boolean {
  const s = g.s;
  if (s.npcTypes[i] !== 0x0e && s.npcTypes[i] < 0x40) return false;
  const base = (s.mapId - 1) * 4;
  return (s.npcKilled[base + (i >> 3)] & (1 << (i & 7))) !== 0;
}

/** TOWN_0052: remember that NPC `i` was killed (not guards or monsters). */
export function setNpcKilled(g: Game, i: number): void {
  const s = g.s;
  if (i < 0 || i > 0x1f) return;
  const kind = s.npcTypes[i] & 0xfc;
  if ((kind !== 0x70 && kind < 0x80) || kind === 0xb4) {
    const base = (s.mapId - 1) * 4;
    s.npcKilled[base + (i >> 3)] |= 1 << (i & 7);
  }
}

/** TOWN_00b0: take NPC `i` out of the settlement. */
export function removeNpc(g: Game, i: number): void {
  const s = g.s;
  const n = s.npcs[i];
  const a = s.actors[n.actor];
  a.tile = a.anim = a.x = a.y = a.z = a.b6 = a.b7 = 0;
  n.f0 = n.x = n.y = n.z = n.fa = 0;
  const sch = s.schedules[i];
  sch.setType(0, 0);
  sch.setType(1, 0);
  sch.setType(2, 0);
  s.npcTypes[i] = 0;
  g.viewDirty |= 2;
}

/** TOWN_011e: the NPC whose actor this is, or -1. */
export function npcOfActor(g: Game, actor: number): number {
  const s = g.s;
  for (let i = 0; i < 0x20; i++) if (s.npcs[i].actor === actor && s.npcTypes[i] !== 0 && s.npcs[i].f0 !== 0) return i;
  return -1;
}

// --- The settlement by the hour --------------------------------------------------

/** TOWN_0170: lamps (0x87) light the square below; drawbridges come down at five and go up at other changes. */
export function hourTiles(g: Game): void {
  const s = g.s;
  for (let x = 0; x < 0x20; x++) {
    for (let y = 0; y < 0x20; y++) {
      if (tileAt(g, x, y) === T.T87) {
        const [b, i] = tileCell(g, x, y + 1);
        b[i] ^= T.DD;
      }
    }
  }
  if ((tileAt(g, s.x, s.y) & 0xfe) !== T.T48) {
    for (let i = 0; i < s.doorCount; i++) setTileAt(g, s.doorXs[i], s.doorYs[i], s.hour === 5 ? s.doorTiles[i] : T.Water3);
  }
  g.viewDirty |= 2;
}

/** TOWN_0212: where a Shadowlord is, trees are felled and crops picked (the same way each day). */
function blight(g: Game): void {
  const s = g.s;
  if (s.townAir === 0xff) return;
  const day = new DosRandom(s.day); // the same felling each day, as the game seeds it
  for (let y = 0; y < 0x20; y++) {
    for (let x = 0; x < 0x20; x++) {
      const t = g.map[y * 32 + x];
      if (t === T.Tree && day.range(0, 7) !== 0) g.map[y * 32 + x] = T.Stump;
      else if (t === T.Crops && day.range(0, 7) !== 0) g.map[y * 32 + x] = T.CropsPicked;
    }
  }
  g.viewDirty |= 2;
}

/** TOWN_02ae: if a Shadowlord is in this towne, it stands at the gate. */
function shadowlordArrives(g: Game): void {
  const s = g.s;
  s.townAir = 0xff;
  if (s.y !== 4) {
    for (let i = 0; i < 3; i++) {
      if (s.shadowlords[i] === s.mapId) {
        s.townAir = i;
        break;
      }
    }
  }
  if (s.townAir === 0xff) return;
  blight(g);
  for (const a of s.actors) if (a.tile === 0xfc) return;
  const slot = freeActor(g);
  const a = s.actors[slot];
  let npc = 0x1f;
  for (let i = 0x1f; i >= 0; i--) {
    if (s.npcTypes[i] === 0) {
      npc = i;
      break;
    }
  }
  const n = s.npcs[npc];
  const gateY = g.data.bytes(0x13a6, 8)[s.mapId - 1];
  n.f0 = 1;
  n.actor = slot;
  n.x = a.x = 0xf;
  n.y = a.y = gateY;
  n.z = 0;
  a.b6 = a.b5 = a.z = a.b7 = 0;
  a.tile = a.anim = 0xfc;
  const sch = s.schedules[npc];
  for (let i = 0; i < 4; i++) sch.setTime(i, 0);
  for (let i = 0; i < 3; i++) {
    sch.setType(i, 6);
    sch.setPlace(i, 0xf, gateY, 0);
  }
  s.npcTypes[npc] = 0xfc;
}

/** TOWN_0408: load the level the party is on; find its drawbridges and lighthouses; place the people if asked. */
export function loadLevel(g: Game, placePeople: boolean): void {
  const s = g.s;
  g.bumped.clear(); // a level come to afresh: its chests and barrels unsearched
  g.trail = []; // everyone stands on the one square until the leader walks
  drawMapName(g);
  drawMoons(g);
  setWind(g, -1);
  s.openDoor = 0;
  s.chunkX = s.chunkY = 0;
  const loc = g.data.locations[s.mapId - 1];
  let index = (loc.firstLevel ?? 0) + s.level;
  if (s.level > 0x7f) index -= 0x100;
  g.map.set(g.data.files.get(loc.file!).subarray(index * 1024, index * 1024 + 1024));
  s.doorCount = 0;
  const l = g.lighthouse;
  l.x1 = l.y1 = l.x2 = l.y2 = -1;
  for (let x = 0; x < 0x20; x++) {
    for (let y = 0; y < 0x20; y++) {
      const t = tileAt(g, x, y);
      if ((t & 0xfe) === T.T48) {
        s.doorXs[s.doorCount] = x;
        s.doorYs[s.doorCount] = y;
        s.doorTiles[s.doorCount] = t;
        s.doorCount++;
      }
      if (t === T.T2A) {
        if (l.x1 === -1) {
          l.x1 = x;
          l.y1 = y;
        } else {
          l.x2 = x;
          l.y2 = y;
        }
      }
    }
  }
  if (s.hour < 5 || s.hour > 0x13) hourTiles(g);
  buildLightMap(g);
  passTime(g, 0);
  shadowlordArrives(g);
  if (placePeople) placeAllNpcs(g);
  g.viewDirty = 1;
}

/** TOWN_1694: every actor cleared, every NPC put where its schedule says. */
export function placeAllNpcs(g: Game): void {
  const s = g.s;
  for (let i = 1; i < 0x20; i++) {
    s.actors[i].clear();
    s.npcs[i].actor = 0;
  }
  for (let i = 1; i < 0x20; i++) {
    if (s.npcTypes[i] === 0) continue;
    const slot = scheduleSlot(g, i, s.hour);
    const sch = s.schedules[i];
    putNpc(g, i, sch.x(slot), sch.y(slot), sch.z(slot));
    s.npcs[i].f0 = 1;
    s.npcs[i].fe = slot;
    s.setMovePtr(i, -1);
  }
}

/** TOWN_052e: on stairs facing the right way, the party goes up or down. */
function stairs(g: Game, facing: number, tile: number): void {
  const s = g.s;
  if ((tile & 0xfc) !== T.Stair) return;
  updateFrame(g);
  if (tile - T.Stair === facing) {
    s.level = (s.level + 1) & 0xff;
    g.say(0x265a); // "Up!\n"
  } else if (tile - T.Stair === (facing ^ 2)) {
    s.level = (s.level - 1) & 0xff;
    g.say(0x265f); // "Down!\n"
  } else {
    return;
  }
  loadLevel(g, true);
}

/** TOWN_057c: turn the party's figure (horse, carpet, skiff, ship) to face the move. */
function face(g: Game, dir: number): void {
  const s = g.s;
  switch (s.partyTile & 0xfc) {
    case 0x10:
      g.say(0x2666); // "Ride "
      if (dir === 1) s.partyTile = 0x12;
      else if (dir === 3) s.partyTile = 0x13;
      break;
    case 0x14:
      g.say(0x266c); // "Fly "
      if (dir === 1) s.partyTile = 0x14;
      else if (dir === 3) s.partyTile = 0x15;
      break;
    case 0x28:
      g.say(0x2671); // "Row "
      s.partyTile = dir + (s.partyTile & 0xfc);
      break;
    case 0x20:
    case 0x24:
      s.partyTile = dir + (s.partyTile & 0xfc);
      break;
  }
}

/**
 * Bump to act (the port's, from the ultima3 port): walking into someone
 * talks to them, into a door opens it (jimmies it when locked and there are
 * keys), into a creature attacks it; into anything else, what bumpAct.ts says. The command's keys are queued, so it
 * runs as if typed; true if something was queued.
 */
function bump(g: Game, other: number, ahead: number, dir: number, dx: number, dy: number): boolean {
  const s = g.s;
  // One of the place's own people is spoken to whatever they look like (Sin Vraal is a daemon, and has a tale); so is
  // one of its daemons with nothing to say (Blackthorn's palace, Windemere: "No response!"), since striking a daemon in
  // a settlement calls the guards (attackInTown). The place's rats, bats and gargoyles, and a creature that is nobody's,
  // are fought. actorTileAt leaves the actor's index in dx.
  const npc = other !== 0 ? npcOfActor(g, s.dx) : -1;
  const someone = npc >= 0 && (s.npcs[npc].fa !== 0 || (other & 0xfc) === 0xd8);
  const beyond = actorTileAt(g, s.x + dx * 2, s.y + dy * 2, s.level);
  // The Crown where it lies (an actor of the place, as the shards are outdoors) is picked up, not attacked.
  const field = other >= 0xe8 && other <= 0xef;
  // The harpsichord, walked into from any side: its keyboard (harpsichord.ts).
  if (other === 0 && ahead === HARPSICHORD_TILE) bumpInto(g, HARPSICHORD, dir);
  else if ((other & 0xfc) === 0xb4) bumpInto(g, 0x47, dir);
  else if (other >= 0x80 && other !== 0xfc && !field && !someone) bumpInto(g, 0x41, dir);
  else if (other >= 0x80 && someone) bumpInto(g, 0x54, dir);
  else if (other === 0 && beyond >= 0x40 && beyond < 0x80 && counter(g, s.x + dx, s.y + dy)) bumpInto(g, 0x54, dir);
  else if (other >= 0x40 && other < 0x80) bumpInto(g, 0x54, dir);
  else if ((ahead === T.DoorB9 || ahead === T.DoorBB) && other === 0 && g.s.keys > 0) {
    jimmyWho(g);
    bumpInto(g, 0x4a, dir);
  } else if ((ahead === T.DoorB8 || ahead === T.DoorBA) && other === 0) bumpInto(g, 0x4f, dir);
  else {
    // Anything else there is to do with it (bumpAct.ts), or "Blocked!".
    const command = bumpCommand(g, 'town', other, ahead, s.x + dx, s.y + dy);
    if (command === 0) return false;
    bumpInto(g, command, dir);
  }
  return true;
}

/** TOWN_0600: move the party; true if it walked off the edge and chose to leave. */
async function move(g: Game, key: number): Promise<boolean> {
  const s = g.s;
  if (s.partyTile === 0x1c || (s.partyTile & 0xfe) === 0x12) void footstep(g);
  let dx = 0;
  let dy = 0;
  let edge = false;
  let dir = 0;
  g.text.moving = true; // a move: said again, it folds with a count (text.ts)
  switch (key) {
    case K.Up:
      dy--;
      edge = s.y < 1;
      dir = 0;
      face(g, 0);
      g.say(0x2676); // "North\n"
      break;
    case K.Down:
      dy++;
      edge = s.y > 0x1e;
      dir = 2;
      face(g, 2);
      g.say(0x267d); // "South\n"
      break;
    case K.Right:
      dx++;
      edge = s.x > 0x1e;
      dir = 1;
      face(g, 1);
      g.say(0x2684); // "East\n"
      break;
    case K.Left:
      dx--;
      edge = s.x < 1;
      dir = 3;
      face(g, 3);
      g.say(0x268a); // "West\n"
      break;
  }
  let free = true;
  const ahead = g.view[(dy + 5) * 32 + dx + 5];
  const other = actorTileAt(g, dx + s.x, dy + s.y, s.level);
  if (other !== 0) {
    free = false;
    if (s.partyTile >= 0x30 || s.partyTile < 0x20) {
      // A corpse (0x1f) is walked into, and searched (bumpAct.ts); a fallen member's (0x1e) is walked over.
      if ((other >= 0x24 && other < 0x2c) || other === 0x1b || (other & 0xfe) === 0x10 || other === 0x1e) free = true;
    } else if (s.partyTile >= 0x28 && other >= 0x24 && other < 0x28) {
      free = true;
    }
  }
  if (free && canEnter(g, s.partyTile, ahead)) {
    if (edge) {
      g.say(0x2690); // "\nDost thou wish to leave? "
      let k: number;
      do k = await getCharYN(g);
      while (k !== 0x59 && k !== 0x4e && k !== K.Escape);
      if (k === 0x59) {
        g.say(0x26ab); // "Yes\n\nExit to\n"
        if (s.mapId === 0x19) {
          g.say(0x26b9); // "Underworld!\n"
          s.level = 0xff;
        } else {
          g.say(0x26c6); // "Britannia!\n"
          s.level = 0;
        }
        s.openDoor = 0;
        s.x = g.data.locations[s.mapId - 1].x;
        s.y = g.data.locations[s.mapId - 1].y;
        s.mapId = 0;
      } else {
        g.say(0x26d2); // "No\n"
        edge = false;
      }
    } else {
      // The members after the leader follow in a line, each on the square the one before stood on.
      g.trail = [{ x: s.x, y: s.y, z: s.level }, ...g.trail].slice(0, 5);
      s.x += dx;
      s.y += dy;
      g.viewDirty = 1;
      if ((s.partyTile & 0xfe) === 0x12) void footstep(g);
      stairs(g, dir, ahead);
    }
  } else if (bump(g, other, tileAt(g, s.x + dx, s.y + dy), key, dx, dy)) {
    edge = false;
  } else {
    g.say(0x26d6); // "Blocked!\n"
    if (!g.soundOff) void g.sound.tone(0xa5, 200);
    g.p.flushKeys();
    edge = false;
  }
  return edge;
}

/** ULTIMA_433e: a footstep - a horse's hooves, in the Standard set, with the party riding (game/cues.ts). */
export async function footstep(g: Game): Promise<void> {
  if (g.soundOff) return;
  const hooves = async (): Promise<void> => {
    await g.sound.noise(1, 0x19, 1000);
    await g.sound.noise(1, 0x19, 1500);
  };
  if ((g.s.partyTile & 0xfe) === 0x12) await cue(g, 'HorseWalk', hooves);
  else await hooves();
}

// --- The guards -----------------------------------------------------------------

/** TOWN_085e: NPC `i` turns on the party (kinds 6, or 7 for the bigger ones), at all hours. */
function turnHostile(g: Game, i: number): void {
  const s = g.s;
  const kind = s.npcTypes[i] >= 0x2f ? 7 : 6;
  const sch = s.schedules[i];
  for (let k = 0; k < 4; k++) sch.setTime(k, 0);
  for (let k = 0; k < 3; k++) sch.setType(k, kind);
}

/** TOWN_08d4: a townsperson flees the party (kind 3) and won't talk. */
function turnAfraid(g: Game, i: number): void {
  const s = g.s;
  const sch = s.schedules[i];
  let scheduled = false;
  for (let k = 0; k < 4; k++) if (sch.time(k) !== 0) scheduled = true;
  if (s.npcTypes[i] < 0x74 && s.npcTypes[i] >= 0x40 && (s.npcs[i].fa === 0xfe || scheduled)) {
    s.npcs[i].fa = 0xfd;
    for (let k = 0; k < 3; k++) sch.setType(k, 3);
  }
}

/** TOWN_0958: the alarm: guards (and worse) come for the party, and townsfolk scatter. */
export function callGuards(g: Game): void {
  const s = g.s;
  void cue(g, 'Alarm');
  for (let i = 0; i < 0x20; i++) {
    if (s.npcs[i].f0 === 0) continue;
    const t = s.npcTypes[i];
    if (t === 0xfc || t === 0xd8 || t === 0x70) turnHostile(g, i);
    else if (g.random(0, 0xff) < 0x80) turnAfraid(g, i);
  }
}

/** TOWN_09bc: fight NPC `i`. */
async function fightNpc(g: Game, i: number): Promise<void> {
  setNpcKilled(g, i);
  await attackCombat(g, g.s.npcs[i].actor);
  removeNpc(g, i);
  loadLevel(g, false);
  shadowlordArrives(g);
}

/** TOWN_09e6: Attack in a settlement. */
export async function attackInTown(g: Game): Promise<number> {
  const s = g.s;
  g.say(0x26e0); // "Attack-"
  if (tileAt(g, s.x, s.y) < T.Poison && s.partyTile !== 0x1c) {
    g.say(0x26e8); // "On foot!\n"
    return 0;
  }
  if (!(await selectDirection(g))) return 1;
  const x = s.x + s.dx;
  const y = s.y + s.dy;
  if (tileAt(g, x, y) === T.Mirror) {
    setTileAt(g, x, y, T.MirrorBroken);
    g.say(0x26f2); // "Broken!\n"
    for (let f = 2000; f < 20000; f += 1000) if (!g.soundOff) await g.sound.noise(0x28, 0x78, f);
    g.viewDirty |= 2;
    return 1;
  }
  const target = actorTileAt(g, x, y, s.level);
  let nothing = true;
  let npc = -1;
  if (target !== 0) {
    npc = npcOfActor(g, s.dx);
    if (target >= 0x40 && (target < 0xe8 || target >= 0xf0) && (target & 0xfc) !== 0xb4) nothing = false;
  }
  if (nothing) {
    g.say(0x26fb); // "Nothing to attack!\n"
    return 1;
  }
  if (target < 0x80) {
    s.karma = decrease(s.karma, 5);
    callGuards(g);
  } else if ((target & 0xfc) === 0xd8) {
    callGuards(g);
  }
  switch (tileAt(g, x, y)) {
    case T.T84:
    case T.T85:
    case T.MirrorBroken:
    case T.Bed:
      if (target === 0x78) {
        g.say(0x270f); // "Missed!\n"
      } else {
        g.say(0x2718); // "Murdered!\n"
        s.karma = decrease(s.karma, 5);
        const { explosion } = await import('./effects.ts');
        await explosion(g, x, y);
        if (npc >= 0) {
          setNpcKilled(g, npc);
          removeNpc(g, npc);
        }
      }
      break;
    default:
      if (npc >= 0) {
        setNpcKilled(g, npc);
        await fightNpc(g, npc);
      }
      break;
  }
  return 1;
}

/** TOWN_0b82: Klimb: ladders, and over fences and the like. */
export async function klimbInTown(g: Game): Promise<number> {
  const s = g.s;
  let done = 0;
  g.say(0x2723); // "Klimb-"
  if ((s.partyTile & 0xfe) === 0x12) {
    g.say(0x272a); // "-On foot!\n"
    return 0;
  }
  switch (tileAt(g, s.x, s.y)) {
    case T.LadderUp:
      void cue(g, 'Upwards');
      stairs(g, 0, T.Stair);
      done = 1;
      break;
    case T.T86:
    case T.LadderDown:
      void cue(g, 'Downwards');
      stairs(g, 2, T.Stair);
      done = 1;
      break;
  }
  if (done === 0 && (await selectDirection(g))) {
    switch (tileAt(g, s.x + s.dx, s.y + s.dy)) {
      case T.T4C:
      case T.CA:
      case T.CB:
        s.x += s.dx;
        s.y += s.dy;
        g.viewDirty = 1;
        updateFrame(g);
        done = 1;
        break;
      default:
        g.say(0x2735); // "What?\n"
        break;
    }
  }
  return done;
}

// --- Horses, harpsichords and hazards ---------------------------------------------

/** TOWN_0c4a: hitching posts and troughs (0xa2, 0x43) keep a horse. */
const tethered = (g: Game, x: number, y: number): boolean => {
  const t = tileAt(g, x, y);
  return t === T.A2 || t === T.T43;
};

/** TOWN_0c78: loose horses wander. */
function horses(g: Game): void {
  const s = g.s;
  for (const a of s.actors) {
    let tile = a.tile;
    if ((tile & 0xfe) !== 0x10 || a.z !== s.level || g.random(0, 1) !== 0) continue;
    let x = a.x;
    let y = a.y;
    if (tethered(g, x, y + 1) || tethered(g, x + 1, y) || tethered(g, x, y - 1) || tethered(g, x - 1, y)) continue;
    if (g.random(0, 1) !== 0) {
      const d = g.random(0, 1) * 2 - 1;
      x += d;
      tile = d > 0 ? 0x10 : 0x11;
    } else {
      y += g.random(0, 1) * 2 - 1;
    }
    if (x <= 0x1f && y <= 0x1f && x >= 0 && y >= 0 && canEnter(g, 0x10, tileAt(g, x, y)) && actorTileAtRev(g, x, y, s.level) === 0) {
      a.tile = a.anim = tile;
      a.x = x;
      a.y = y;
      g.viewDirty |= 2;
    }
  }
}

/** TOWN_0dc4: the prompt and the next key; a drunk party sometimes staggers instead. */
async function readCommand(g: Game, prompt: boolean): Promise<number> {
  const s = g.s;
  if (prompt) {
    updateFrame(g);
    if (g.vitalsDirty !== 0) {
      drawVitals(g);
      g.vitalsDirty = 0;
    }
    commandPrompt(g);
  }
  let key = await getCommandKey(g, 'town');
  if (s.drunk !== 0 && g.random(0, 1) !== 0) {
    callGuards(g);
    s.drunk--;
    g.say(0x273c); // "Hic!\n"
    key = g.data.bytes(0x2742, 4)[g.random(0, 3)];
  }
  return key;
}

/** TOWN_0e34: a number key: a note at the harpsichord (harpsichord.ts), seated at it as 1988 has it, else Set Active Player. */
async function numberKey(g: Game, key: number): Promise<number> {
  if (g.view[6 * 32 + 5] !== HARPSICHORD_TILE) return setActivePlayer(g, key);
  if (strike(g, key - 0x30)) await openTheWay(g);
  return 3;
}

/** TOWN_0f02: after the move: sleepers wake, trapdoors, poison fields, fires; then the turn ends. */
async function afterMove(g: Game): Promise<void> {
  const s = g.s;
  for (let i = 0; i < s.partySize; i++) {
    if (s.members[i].status === Status.Sleeping && g.random(0, 0xf) === 0xf) s.members[i].status = Status.Good;
  }
  let again: boolean;
  do {
    again = false;
    const t = tileAt(g, s.x, s.y);
    if (t === T.Trapdoor && (s.partyTile & 0xfe) !== 0x14) {
      g.say(0x2768); // "A TRAPDOOR!\n"
      const tile = s.partyTile;
      s.partyTile = 0;
      updateFrame(g);
      await damageParty(g);
      s.partyTile = tile;
      if (s.mapId === 0x1d) {
        // The Stonegate trapdoor: into the lava.
        g.draw.pen = 0;
        g.draw.fill(8, 8, 0xb7, 0xb7);
        if (!g.soundOff) await g.sound.sweep(1000, 250, 0x28, 30000);
        g.map.fill(T.Lava);
        g.viewDirty = 1;
        s.b.fill(0, 0x5c5a - 0x55a6, 0x5c5a - 0x55a6 + 0x100);
        for (let i = 0; i < s.partySize; i++) {
          s.members[i].hp = 0;
          s.members[i].status = Status.Dead;
          if (!g.soundOff) await g.sound.noise(0x28, 3000, 500);
          drawVitals(g);
        }
      } else {
        s.level = (s.level - 1) & 0xff;
        loadLevel(g, true);
        again = true;
      }
    } else if (t === T.Poison && s.partyTile === 0x1c) {
      for (let i = 0; i < s.partySize; i++) {
        const m = s.members[i];
        if (m.status !== Status.Dead && m.status !== Status.Poisoned && m.dex < g.random(0, 0x1d)) {
          g.say(0x2775); // "Poisoned!\n"
          m.status = Status.Poisoned;
          drawVitals(g);
        }
      }
    } else if (t === T.Fireplace || t === T.Lava) {
      updateFrame(g);
      g.say(0x2780); // "Burning!\n"
      await damageParty(g);
    }
  } while (again);
  await endTurn(g);
}

/** TOWN_10da. */
export async function begone(g: Game, i: number): Promise<void> {
  g.say(0x278a); // "\"Begone,\nvermin!\"\n"
  await damageParty(g);
  turnAfraid(g, i);
}

/** TOWN_10f2: will NPC `i` be swayed by the air about the Shadowlord (townsfolk only, half of them). */
function swayed(g: Game, i: number): boolean {
  const s = g.s;
  let scheduled = false;
  for (let k = 0; k < 4; k++) if (s.schedules[i].time(k) !== 0) scheduled = true;
  // The original reads the type of NPC 4 here (its loop counter), not of NPC i.
  const kind = s.npcTypes[4];
  if (kind < 0x40 || kind >= 0x74) scheduled = false;
  if (g.random(0, 1) !== 0) scheduled = false;
  return scheduled;
}

/** TOWN_1156: Falsehood turns folk hostile; Hatred makes them afraid. */
function sway(g: Game): void {
  const s = g.s;
  if (s.townAir === 1) {
    for (let i = 0; i < 0x20; i++) {
      if (swayed(g, i)) {
        turnHostile(g, i);
        s.npcs[i].fa = 0xfe;
      }
    }
  } else if (s.townAir === 2) {
    for (let i = 0; i < 0x20; i++) {
      if (swayed(g, i)) {
        turnAfraid(g, i);
        s.npcs[i].fa = 0xfd;
      }
    }
  }
}

/** TOWN_11b8: "An air of <evil> doth surround thee...". */
async function airOf(g: Game, which: number): Promise<void> {
  g.say(0x27b8); // "\nAn air of\n"
  g.print(g.data.table(0x27dc, 3)[which]);
  g.say(0x27c4); // " doth surround thee...\n"
  if (!g.soundOff) await g.sound.pulse(0x19c8, 1, 60000, 2000, 1);
}

/** TOWN_11f0: into the settlement (or back to it from combat): people, the dead, the Shadowlords' air. */
export async function enterTown(g: Game, fresh: boolean): Promise<void> {
  const s = g.s;
  g.sound.music(0);
  g.a9bc = g.viewDirty = 1;
  if (fresh) {
    for (let i = 1; i < 0x20; i++) s.actors[i].tile = 0;
    s.drunk = 0;
    s.drawMap = 1;
    loadNpcs(g);
    placeNpcs(g, s.hour);
  }
  s.townAir = 0xff;
  loadLevel(g, fresh);
  shadowlordArrives(g);
  for (let i = 0; i < 0x20; i++) if (npcKilled(g, i)) removeNpc(g, i);
  if (s.mapId === 29 && s.sceptre !== 0) removeNpc(g, 9);
  drawVitals(g);
  if (firstActive(g) >= 0) {
    updateFrame(g);
    if (s.mapId === 29) {
      for (let i = 2; i >= 0; i--) if (s.shadowlords[i] < 0x80) await airOf(g, i);
    } else if (s.townAir !== 0xff) {
      await airOf(g, s.townAir);
      sway(g);
    }
  }
  playTownMusic(g);
}

/** AUDIO_PlayBgmPerMap for settlements. */
function playTownMusic(g: Game): void {
  // A chunk that cannot be fetched (offline before it was cached, or a newer build's names) leaves the town silent.
  void import('./music.ts').then((m) => m.musicForMap(g)).catch(() => undefined);
}

/** TOWN_12ae: a guard's arrest, or Blackthorn's; true if the party chose to fight. */
async function arrest(g: Game): Promise<boolean> {
  const s = g.s;
  if (s.mapId === 0x12) {
    if (firstActive(g) >= 0) {
      await blackthornCapture(g);
      await enterTown(g, true);
    }
    return false;
  }
  g.say(0x27e2); // "\n\"Thou art under arrest!\"\n\n"
  g.say(0x27fe); // "\"Wilt thou come quietly?\"\n\n:"
  let k: number;
  do k = await getCharYN(g);
  while (k !== 0x4e && k !== 0x59);
  if (k === 0x59) {
    g.say(0x281b); // "Yes\n\nThe guard strikes thee unconscious!\n"
    g.draw.pen = 0;
    g.say(0x2845); // "\nThou dost awaken to...\n"
    s.mapId = 4;
    s.x = 0x19;
    s.y = 4;
    g.viewDirty = 1;
    while (s.hour !== 8) passTime(g, 0x14);
    s.level = s.keys = 0;
    await enterTown(g, true);
    return false;
  }
  g.say(0x285e); // "No\n\n\"Then defend thyself, rogue!\"\n"
  callGuards(g);
  return true;
}

/** TOWN_1352: an NPC next to the party acts: a hostile one attacks or arrests, a friendly one talks. */
async function npcActs(g: Game, talked: number): Promise<void> {
  const s = g.s;
  let fight = false;
  const npc = s.d65bf;
  const actor = s.actors[s.npcs[npc].actor];
  updateFrame(g);
  if (s.d65be === 0x61) {
    if (s.npcs[npc].fa === 0xfe) {
      g.printChar('\n');
      await begone(g, npc);
    } else if (actor.tile !== 0x70) {
      fight = true;
    } else {
      fight = await arrest(g);
    }
  } else if (talked === 0) {
    if (s.npcs[npc].fa !== 0 && (await talkToNpc(g, npc)) !== 0) fight = await arrest(g);
  } else {
    fight = await arrest(g);
  }
  if (!fight) return;
  if (s.actors[s.npcs[npc].actor].tile >= 0x40) {
    g.say(0x2881); // "\nAttacked!\n"
    await fightNpc(g, npc);
  } else {
    removeNpc(g, npc);
  }
}

/** TOWN_141e_MainLoop: until the party leaves. */
export async function townLoop(g: Game): Promise<void> {
  const s = g.s;
  let horseTurn = false;
  let quickTurn = false;
  let left = false;
  do {
    let result = 1;
    let key = 0;
    const state = firstActive(g);
    if (state === 1) {
      commandPrompt(g);
      g.say(0x288d); // "Zzzzzz...\n"
    } else if (state === -1) {
      await death(g);
      result = 0;
    } else {
      if (g.a9bc !== 0) g.a9bc = 0;
      else if (await moongateTravel(g)) await shrine(g);
      if (s.mapId === 0) return;
      let prompt = true;
      do {
        key = await readCommand(g, prompt);
        prompt = false;
        if (key < 0x20) {
          switch (key) {
            case K.CtrlK:
              g.printNumber(s.karma);
              g.printChar('\n');
              result = 0;
              break;
            case K.CtrlV:
              g.say(0x28a9); // the version
              g.printChar('\n');
              result = 0;
              break;
            case K.CtrlS:
              g.say(0x28ae); // "Sound "
              g.say(g.soundOff ? 0x28b5 : 0x28ba); // "Off\n" : "On\n"
              g.soundOff = !g.soundOff;
              result = 0;
              break;
            case K.Left:
            case K.Right:
            case K.Up:
            case K.Down:
              left = await move(g, key);
              result = left ? 0 : 1;
              break;
            default:
              g.say(0x28be); // "What?\n"
              result = 0;
              break;
          }
        } else if (key < 0x30 || key > 0x39) {
          result = await processCommand(g, key);
        } else {
          result = await numberKey(g, key);
        }
      } while (result === 3);
    }
    if (s.mapId === 0) {
      left = true;
    } else if (result !== 0 && firstActive(g) !== -1) {
      const hour = s.hour;
      passTime(g, 1);
      if (s.hour !== hour && (s.hour === 20 || s.hour === 5)) hourTiles(g);
      await afterMove(g);
      if (s.openDoor !== 0 && --s.doorTurns === 0) {
        // The door swings shut: heard where it is in view, and only if it stood open.
        const open = tileAt(g, s.doorX, s.doorY) !== s.openDoor;
        const near = Math.abs(s.doorX - s.x) <= 5 && Math.abs(s.doorY - s.y) <= 5;
        setTownTile(g, s.openDoor, s.doorX, s.doorY);
        if (open && near) void cue(g, 'DoorClose');
      }
      const a0 = s.actors[0];
      a0.x = s.x;
      a0.y = s.y;
      a0.z = s.level;
      const mounted = s.partyTile >= 0x12 && s.partyTile < 0x16;
      let peopleMove = true;
      if (mounted && key !== 0x20) {
        horseTurn = !horseTurn;
        peopleMove = !horseTurn;
      }
      if (peopleMove && s.icon !== 0x54 && s.icon === 0x51) {
        quickTurn = !quickTurn;
        peopleMove = !quickTurn;
      }
      if (peopleMove && s.icon !== 0x54) {
        horses(g);
        if (result < 2) moveNpcs(g, s.hour);
        if (s.d65bf !== 0 || result === 2) await npcActs(g, result - 1);
      }
    }
  } while (!left);
}

export { tileCell };
