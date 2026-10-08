/**
 * cmds.ts
 *
 * The rest of the everyday commands (u5d cmds.c): Board and X-it (horses,
 * carpets, skiffs, ships), Fire (broadsides and cannon), Ignite a torch,
 * New order, Yell (sails, Words of Power at the dungeons, the
 * Shadowlords' names at their shrines), Meditate at a ruined shrine,
 * Push and pull furniture, Klimb with a grapple, and Hole up in a bed.
 */

import { actorTileAt, actorTileAtRev, canEnter, freeActor, setActor } from './actors.ts';
import { shoot } from './combat.ts';
import { reveal, shakeScreen, explosion } from './effects.ts';
import { drawMoons, drawVitals, updateFrame } from './frame.ts';
import { Game } from './game.ts';
import { getHours, selectDirection, selectMember } from './input.ts';
import { restOutcome, restTimer } from './rest.ts';
import { askWord } from './menu.ts';
import { musicForMap } from './music.ts';
import { moveNpcs } from './npc.ts';
import { stepParty } from './outdoors.ts';
import { Status } from './save.ts';
import { damageMember, damageParty, endTurn, passTime } from './time.ts';
import { T } from './tiles.ts';
import { callGuards, hourTiles, npcOfActor, removeNpc, setNpcKilled, placeAllNpcs } from './town.ts';
import { setTileAt, setTownTile, tileAt } from './world.ts';
import { cue } from './cues.ts';

const decrease = (v: number, n: number): number => (v > n ? v - n : 0);

/** ULTIMA_6f1e: typed words (upper case) match a word from the game when they begin with all of it. */
export function saysWord(word: string, typed: string): boolean {
  // Words of nine letters or more are compared on their first eight (the original's loop stops a letter short).
  const w = (word.length >= 9 ? word.slice(0, 8) : word).toUpperCase();
  // What is said may come from the keyboard (capitals, as the original reads it) or from the list of words heard
  // (as they were heard): it is the word that matters, not its case.
  return typed.slice(0, w.length).toUpperCase() === w;
}

// --- Board and X-it -----------------------------------------------------------------

/** CMDS_06ee: only on foot. */
function onFoot(g: Game): boolean {
  if (g.s.partyTile !== 0x1c && g.s.partyTile !== 0x1d) {
    g.say(0x423e); // "\nOn foot\n"
    return false;
  }
  return true;
}

/** CMDS_070c: boarding a ship from foot, carpet or skiff. */
function canBoardShip(g: Game): boolean {
  switch (g.s.partyTile) {
    case 0x14:
    case 0x15:
    case 0x1c:
    case 0x1d:
    case 0x28:
    case 0x29:
    case 0x2a:
    case 0x2b:
      return true;
    default:
      g.say(0x4248); // "\nOn foot\n"
      return false;
  }
}

/** CMDS_0788: can one land at viewport cell (col, row). */
function landAt(g: Game, row: number, col: number): boolean {
  const v = g.view[row * 32 + col];
  if (v !== 0) return canEnter(g, 0x1c, v);
  const a = g.actorMap[row * 16 + col];
  if (a === 0x1b) return true;
  const k = a & 0xfc;
  return k === 0x1c || k === 0x24 || k === 0x10 || k === 0x28;
}

/** CMDS_073e: land beside the party. */
const landNearby = (g: Game): boolean => landAt(g, 4, 5) || landAt(g, 6, 5) || landAt(g, 5, 6) || landAt(g, 5, 4);

/** CMDS_07f6: Board what the party stands on. */
export async function boardCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa13a); // "Board "
  if (g.inDungeon) {
    g.say(0x4252); // "\nNot here!\n"
    return 1;
  }
  const tile = actorTileAt(g, s.x, s.y, s.level);
  const i = s.dx;
  if ((tile & 0xfe) === 0x10) {
    if (s.mapId !== 0) {
      const npc = npcOfActor(g, i);
      if (npc !== -1 && s.npcs[npc].fa !== 0) {
        g.say(0x425e); // "\"Nay!\"\n"
        return 1;
      }
    }
    if (!onFoot(g)) return 1;
    g.say(0x4266); // "horse\n"
    s.partyTile = tile + 2;
    await cue(g, 'MountHorse');
  } else if (tile === 0x1b) {
    if (!onFoot(g)) return 1;
    g.say(0x426d); // "carpet\n"
    s.partyTile = 0x14;
  } else if ((tile & 0xfc) === 0x28) {
    if (!onFoot(g)) return 1;
    g.say(0x4275); // "skiff\n"
    s.partyTile = tile;
  } else if ((tile & 0xfc) === 0x24) {
    if (!canBoardShip(g)) return 1;
    g.say(0x427c); // "Ship\n"
    const hull = s.actors[i].b5;
    if (hull < 10) g.say(0x4282); // "\nDANGER: SHIP BADLY DAMAGED!\n"
    s.actors[0].b5 = hull;
    let skiffs = s.actors[i].b7;
    if ((s.partyTile & 0xfe) === 0x14) s.carpets++;
    if ((s.partyTile & 0xfc) === 0x28) skiffs++;
    if (skiffs === 0) g.say(0x42a0); // "\nWARNING: NO SKIFFS ON BOARD!\n"
    s.partyTile = tile;
    s.actors[0].b7 = skiffs;
    g.vitalsDirty = 1;
  } else {
    g.say(0x42bf); // "What?\n"
    return 0;
  }
  setActor(g, i, 0, 0, 0, 0, 0, 0);
  g.viewDirty |= 2;
  musicForMap(g);
  return 1;
}

/** CMDS_0eb4: X-it: step off or out of whatever carries the party. */
export async function xitCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa280); // "X-it "
  const under = tileAt(g, s.x, s.y);
  let left: number;
  let skiffs = 0;
  switch (s.partyTile & 0xfc) {
    case 0x1c:
      g.say(0x4368); // "what?\n"
      return 1;
    case 0x20:
      g.say(0x436f); // "\nUnder sail!\n"
      return 1;
    case 0x14:
      if (landNearby(g) || canEnter(g, 0x1c, under)) {
        g.say(0x437d); // "carpet!\n"
        left = 0x1b;
        s.partyTile = 0x1c;
        break;
      }
      g.say(landNearby(g) ? 0x4398 : 0x4386); // "\nNot here!\n" : "\nNo land nearby!\n"
      return 1;
    case 0x10:
      g.say(0x43a4); // "horse!\n"
      left = s.partyTile - 2;
      s.partyTile = 0x1c;
      break;
    case 0x28:
      if (!landNearby(g)) {
        g.say(0x43ac); // "\nNo land nearby!\n"
        return 1;
      }
      if ((under & 0xfe) === T.T6A) {
        g.say(0x43be); // "\nNot here!\n"
        return 1;
      }
      g.say(0x43ca); // "skiff!\n"
      left = s.partyTile;
      s.partyTile = 0x1c;
      break;
    case 0x24:
      g.say(0x43d2); // "ship!\n"
      if (landNearby(g)) {
        left = s.partyTile;
        s.partyTile = 0x1c;
        skiffs = s.actors[0].b7;
      } else if (s.actors[0].b7 !== 0) {
        left = s.partyTile;
        s.partyTile += 4;
        skiffs = s.actors[0].b7 - 1;
      } else if (s.carpets !== 0) {
        s.carpets--;
        left = s.partyTile;
        s.partyTile = 0x14;
        skiffs = s.actors[0].b7;
      } else {
        g.say(0x43d9); // "\nNo skiffs on board!\n"
        return 1;
      }
      break;
    default:
      return 1;
  }
  const i = freeActor(g);
  setActor(g, i, left, left, s.x, s.y, s.level, s.actors[0].b5);
  s.actors[i].b7 = skiffs;
  drawVitals(g);
  musicForMap(g);
  return 1;
}

// --- Fire ---------------------------------------------------------------------------

/** CMDS_0962: a ship's broadside, three squares out. */
async function broadside(g: Game): Promise<void> {
  const s = g.s;
  if (s.partyTile < 0x20 || s.partyTile > 0x27) {
    g.say(0x42c6); // "What?\n"
    return;
  }
  if (!(await selectDirection(g))) return;
  const dx = s.dx;
  const dy = s.dy;
  if ((dx === 0 && (s.partyTile & 1) === 0) || (dx !== 0 && (s.partyTile & 1) !== 0)) {
    g.say(0x42cd); // "Fire broadsides only!\n"
    return;
  }
  let x = s.x;
  let y = s.y;
  if (!g.soundOff) await g.sound.sweep(1000, 200, 5, 300);
  for (let n = 0; n < 3; n++) {
    x += dx;
    y += dy;
    const tile = actorTileAt(g, x, y, s.level);
    const creature = (tile >= 0x2c && tile <= 0x2f) || (tile >= 0x80 && !(tile >= 0xb4 && tile <= 0xb7) && !(tile >= 0xe8 && tile <= 0xeb));
    if (creature && (tile & 0xfc) !== 0xec) {
      const i = s.dx;
      const a = s.actors[i];
      if (await shoot(g, 5, 5, a.x - s.x + 5, a.y - s.y + 5, 1)) {
        updateFrame(g);
        await explosion(g, x, y);
        a.b5 = (a.b5 - g.random(1, 0x14)) & 0xff;
        if (a.b5 > 0x7f) {
          setActor(g, i, 0, 0, 0, 0, 0, 0);
          g.viewDirty |= 2;
        }
      }
      return;
    }
  }
  await shoot(g, 5, 5, dx * 3 + 5, dy * 3 + 5, 1);
}

/** CMDS_0aea: Fire: a ship's guns outdoors; a cannon beside the party in a settlement. */
export async function fireCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa164); // "Fire-"
  if (g.inDungeon) {
    g.say(0x42e4); // "What?\n"
    return 1;
  }
  if (s.mapId === 0) {
    await broadside(g);
    return 1;
  }
  setTownTile(g, s.openDoor, s.doorX, s.doorY);
  const around: [number, number, number, number][] = [
    [5, 4, 0, -1],
    [6, 5, 1, 0],
    [5, 6, 0, 1],
    [4, 5, -1, 0],
  ];
  let cannon = -1;
  let dx = 0;
  let dy = 0;
  for (const [cx, cy, ddx, ddy] of around) {
    const v = g.view[cy * 32 + cx];
    if ((v & 0xfc) === 0xb4) {
      cannon = v;
      dx = ddx;
      dy = ddy;
      break;
    }
  }
  if (cannon < 0) {
    g.say(0x42eb); // "What?\n"
    return 1;
  }
  let x = dx + s.x;
  let y = dy + s.y;
  const vx0 = dx + 5;
  const vy0 = dy + 5;
  let vx = vx0;
  let vy = vy0;
  [dx, dy] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ][cannon & 3];
  g.say(0x42f2); // "BOOOM!\n"
  if (!g.soundOff) await g.sound.sweep(1000, 200, 5, 300);
  callGuards(g);
  let door = false;
  let hit = false;
  let victim = 0;
  for (let n = 5; !door && !hit && --n > 0; ) {
    x += dx;
    y += dy;
    vx += dx;
    vy += dy;
    const other = actorTileAtRev(g, x, y, s.level);
    if (other === 0) {
      switch (tileAt(g, x, y)) {
        case T.T97:
        case T.T98:
        case T.T99:
        case T.DoorB8:
        case T.DoorB9:
        case T.DoorBA:
        case T.DoorBB:
          door = true;
      }
    } else {
      hit = true;
      victim = s.dx;
    }
  }
  await shoot(g, vx0, vy0, vx, vy, 1);
  if (door || hit) await explosion(g, x, y);
  if (door) {
    g.say(0x42fa); // "Door destroyed!\n"
    setTileAt(g, x, y, T.T44);
    g.viewDirty = 1;
    s.openDoor = 0;
  }
  if (hit && victim !== 0) {
    setActor(g, victim, 0, 0, 0, 0, 0, 0);
    g.viewDirty |= 2;
    s.karma = decrease(s.karma, 5);
    const npc = npcOfActor(g, victim);
    if (npc === -1) return 1;
    setNpcKilled(g, npc);
    removeNpc(g, npc);
  }
  if (hit && victim === 0) await damageParty(g);
  return 1;
}

/** CMDS_0d98: Ignite a torch. */
export async function igniteCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa188); // "Ignite torch!\n"
  if (s.torches === 0) {
    g.say(0x430b); // "None owned!\n"
    return 1;
  }
  s.torches--;
  await cue(g, 'TorchIgnite');
  if (g.inDungeon) s.d58a7 = Math.min(s.d58a7 + g.random(0, 0xf) + 0x70, 0xff);
  else s.d58a7 = 0xf0;
  return 1;
}

/** CMDS_0ddc: New order: swap two members (the Avatar must lead). */
export async function newOrderCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa1c4); // "New Order"
  g.say(0x4318); // "\n\nSwap "
  // On a controller the bar passes over the Avatar, who must lead, and the second time over the first chosen (the
  // port's); a keyboard's digits pick whom they name, as in 1988.
  const pad = g.options.input === 'controller';
  const a = await selectMember(g, false, (m) => !pad || m !== 0);
  if (a === -1) {
    g.say(0x4320); // "nobody!\n"
    return 1;
  }
  g.print(s.members[a].name);
  if (a === 0) {
    g.say(0x4329);
    g.print(s.members[0].name);
    g.say(0x432c); // " must lead!\n"
    return 1;
  }
  g.say(0x4339); // "\nwith "
  const b = await selectMember(g, false, (m) => !pad || (m !== 0 && m !== a));
  if (b === -1) {
    g.say(0x4340); // "nobody!\n"
    return 1;
  }
  g.print(s.members[b].name);
  if (b === 0) {
    g.say(0x4349);
    g.print(s.members[0].name);
    g.say(0x434c); // " must lead!\n"
    return 1;
  }
  g.say(0x4359); // "!\n"
  const tmp = s.members[a].b.slice();
  s.members[a].b.set(s.members[b].b);
  s.members[b].b.set(tmp);
  g.vitalsDirty = 1;
  return 1;
}

// --- Yell -----------------------------------------------------------------------------

/** CMDS_1030: at a shrine of Truth, Love or Courage, a Shadowlord's name calls it forth. */
async function yellInTown(g: Game, word: string): Promise<number> {
  const s = g.s;
  if (s.mapId !== 0x1e && s.mapId !== 0x1f && s.mapId !== 0x20) {
    g.say(0x443c); // "\nNo effect!\n"
    return 1;
  }
  const names = g.data.table(0x444a, 3);
  let which = 0;
  for (; which < 3; which++) if (saysWord(names[which], word)) break;
  if (which === 3 || s.y < 2 || s.shadowlords[which] === 0xff) {
    g.say(0x440b); // "\nNo effect!\n"
    return 1;
  }
  for (const a of s.actors) {
    if (a.tile === 0xfc) {
      g.say(0x4418); // "\nNo effect!\n"
      return 1;
    }
  }
  s.d58cb = which;
  const slot = freeActor(g);
  setActor(g, slot, 0xfc, 0xfc, s.x, s.y - 2, s.level, 0);
  let npc = 0x1f;
  for (; npc >= 0; npc--) if (s.npcTypes[npc] === 0) break;
  const n = s.npcs[npc];
  n.f0 = 1;
  n.actor = slot;
  n.x = s.x;
  n.y = s.y - 2;
  n.z = s.level;
  const sch = s.schedules[npc];
  for (let k = 0; k < 4; k++) sch.setTime(k, 0);
  for (let k = 0; k < 3; k++) {
    sch.setType(k, 6);
    sch.setPlace(k, s.x, s.y - 2, s.level);
  }
  s.npcTypes[npc] = 0xfc;
  g.say(0x4425); // "\nA shadowlord appears\n"
  if (!g.soundOff) void g.sound.pulse(0x28a0, 1, 30000, 2000, 2);
  s.actors[slot].tile = s.actors[slot].anim = 0x16;
  await reveal(g, 0x1fc, 5, 3);
  s.actors[slot].tile = s.actors[slot].anim = 0xfc;
  return 0;
}

/** CMDS_1202: meditating at a ruined shrine, with its virtue and mantra, restores it. */
async function meditate(g: Game, i: number, x: number, y: number): Promise<void> {
  const s = g.s;
  let right = true;
  g.say(0x4450); // "\nUpon what virtue\ndost thou\nmeditate?\n\n:"
  // Nothing said (B out of the box): the meditation is left there, as at a shrine that stands (shrine.ts) - where the
  // three mantras were asked all the same, each to be backed out of in turn.
  const virtue = await askWord(g, 0xf, 'Virtue', g.data.table(0x1f4e, 8), false, true);
  if (virtue === '') return void g.printChar('\n');
  if (!saysWord(g.data.table(0x1f4e, 8)[i], virtue)) right = false;
  for (let k = 0; k < 3; k++) {
    g.say(0x4479); // "\nMantra:"
    const mantra = await askWord(g, 0xf, 'Mantra', g.data.table(0x1f5e, 8));
    if (mantra === '') return void g.printChar('\n');
    if (!saysWord(g.data.table(0x1f5e, 8)[i], mantra)) right = false;
  }
  if (right && g.data.bytes(0x1f6e, 8)[i] === (x & 0xff) && g.data.bytes(0x1f76, 8)[i] === (y & 0xff)) {
    s.d58d8[i] &= 0x7f;
    g.say(0x4482); // "\n\nThe Shrine is\nrestored!\n"
    await shakeScreen(g);
    setTileAt(g, x, y, T.Shrine);
    g.viewDirty |= 2;
  } else {
    g.printChar('\n');
  }
}

/** CMDS_12c8: a Word of Power beside a dungeon seals or unseals it; beside a ruined shrine, the party meditates. */
async function yellOutdoors(g: Game, word: string): Promise<void> {
  const s = g.s;
  const words = g.data.table(0x4502, 8);
  const tiles = g.data.bytes(0x4512, 8);
  for (let i = 0; i < 8; i++) {
    if (!saysWord(words[i], word)) continue;
    g.say(0x44d7); // "\nA word of power is uttered\n"
    await shakeScreen(g);
    const sides: [number, number, number, number][] = [
      [4, 5, -1, 0],
      [5, 6, 0, 1],
      [6, 5, 1, 0],
      [5, 4, 0, -1],
    ];
    let dx = 0;
    let dy = 0;
    let t = -1;
    for (const [cx, cy, ddx, ddy] of sides) {
      const v = g.view[cy * 32 + cx];
      if (tiles[i] === v || v === T.DF || v === T.Ruins) {
        t = v;
        dx = ddx;
        dy = ddy;
        break;
      }
    }
    if (t < 0) break;
    if (t === T.Ruins) {
      await meditate(g, i, dx + s.x, dy + s.y);
      return;
    }
    const loc = g.data.locations[0x20 + i];
    if (((dx + s.x) & 0xff) === loc.x && ((dy + s.y) & 0xff) === loc.y) {
      s.d58d0[i] ^= 0x80;
      setTileAt(g, dx + s.x, dy + s.y, tileAt(g, dx + s.x, dy + s.y) ^ tiles[i] ^ T.DF);
      g.viewDirty |= 2;
    }
    return;
  }
  g.say(0x44f4); // "\nNo effect!\n"
}

/** CMDS_1418: Yell: furl or hoist the sails; else a word. */
export async function yellCommand(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa286); // "Yell "
  if ((s.partyTile & 0xf8) === 0x20 && s.mapId < 0x80) {
    if ((s.partyTile & 0xfc) === 0x20) {
      g.say(0x451a); // "FURL!\n"
      s.partyTile += 4;
    } else {
      g.say(0x4521); // "HOIST!\n"
      s.partyTile -= 4;
    }
    return 1;
  }
  g.say(0x4529); // "what?\n:"
  // A word of power at a dungeon's mouth and a Shadowlord's name at his flame are the yells the land answers; the
  // rest is shouting.
  const word = await askWord(g, 0x1e, 'Yell', [...g.data.table(0x4502, 8), ...g.data.table(0x444a, 3)]);
  if (word.length === 0) {
    g.say(0x4531); // "Nothing\n"
    g.cancelled = true; // nothing yelled (B, "Say nothing"): no turn spent
    return 1;
  }
  g.printChar('\n');
  if (s.mapId >= 1 && s.mapId <= 0x20) return yellInTown(g, word);
  if (s.mapId === 0) await yellOutdoors(g, word);
  else g.say(0x453a); // "\nNo effect!\n"
  return 1;
}

// --- Push ------------------------------------------------------------------------------

/** CMDS_14ba: furniture that moves. */
function pushable(t: number): boolean {
  return [
    T.T5B,
    T.Chair90,
    T.Chair91,
    T.Chair92,
    T.Chair93,
    T.Desk,
    T.Barrel,
    T.Vanity,
    T.A9,
    T.Dresser,
    T.AE,
    T.Trunk,
    T.CannonB4,
    T.CannonB5,
    T.CannonB6,
    T.CannonB7,
  ].includes(t as never);
}

/** CMDS_1504: a chair or cannon turns to face the way it was moved. */
function facingFor(dx: number, dy: number, base: number, pulled: boolean): number {
  if (dx === 1 && dy === 0) base++;
  if (dx === 0 && dy === 1) base += 2;
  if (dx === -1 && dy === 0) base += 3;
  if (pulled) base ^= 2;
  return base;
}

/** CMDS_161a: Push (or, backing onto an empty floor, Pull). `said`: "Push-" already printed (a fight prints its own). */
export async function pushCommand(g: Game, said = false): Promise<number> {
  const s = g.s;
  if (g.inDungeon) {
    g.say(0xa1d4); // "Push\nNot here!\n"
    return 0;
  }
  if (!said) g.say(0xa1e4); // "Push-"
  setTownTile(g, s.openDoor, s.doorX, s.doorY);
  if (!(await selectDirection(g))) return 1;
  const dx = s.dx;
  const dy = s.dy;
  let sx = 0;
  let sy = 0;
  if (s.mapId > 0x7f) {
    sx = s.x;
    sy = s.y;
    s.x = g.combat[s.combatTurn].x;
    s.y = g.combat[s.combatTurn].y;
  }
  const x = dx + s.x;
  const y = dy + s.y;
  if (s.mapId > 0x7f) {
    // CMDS_137c: in a room, a push at a square in the trigger table works it (a wall pushed opens a secret way) -
    // that, and nothing moves.
    const { trigger } = await import('./combat.ts');
    if (trigger(g, x, y)) {
      s.x = sx;
      s.y = sy;
      return 1;
    }
  }
  const thing = tileAt(g, x, y);
  if (actorTileAt(g, x, y, s.level) !== 0 || !pushable(thing)) {
    g.say(0x4559); // "Won't budge!\n"
    if (s.mapId > 0x7f) {
      s.x = sx;
      s.y = sy;
    }
    return 1;
  }
  const floor = (thing & 0xfc) === T.CannonB4 ? T.T45 : T.T44;
  const bx = x + dx;
  const by = y + dy;
  const beyond = tileAt(g, bx, by);
  const here = tileAt(g, s.x, s.y);
  if (actorTileAt(g, bx, by, s.level) === 0 && beyond === floor) {
    g.say(0x4547); // "Pushed!\n"
    setTileAt(g, bx, by, thing);
    setTileAt(g, x, y, beyond);
    const k = thing & 0xfc;
    if (k === T.Chair90 || k === T.CannonB4) setTileAt(g, bx, by, facingFor(dx, dy, k, false));
  } else if (here === floor) {
    g.say(0x4550); // "Pulled!\n"
    setTileAt(g, s.x, s.y, thing);
    setTileAt(g, x, y, here);
    const k = thing & 0xfc;
    if (k === T.Chair90 || k === T.CannonB4) setTileAt(g, s.x, s.y, facingFor(dx, dy, k, true));
  } else {
    g.say(0x4567); // "Won't budge\n"
    if (s.mapId > 0x7f) {
      s.x = sx;
      s.y = sy;
    }
    return 1;
  }
  s.x += dx;
  s.y += dy;
  g.viewDirty = 1;
  if (s.mapId > 0x7f) {
    const c = g.combat[s.combatTurn];
    c.x += dx;
    c.y += dy;
    // The pusher's own figure, its actor. CMDS_161a_PushCmd moved D_5c5a[entityIdx] - the member's number, or a
    // charmed creature's kind (up to 0x2f), which pushes in its turn as a member does: some other figure, or one past
    // the 32 actors' end.
    s.actors[c.actor].x += dx;
    s.actors[c.actor].y += dy;
    s.x = sx;
    s.y = sy;
    updateFrame(g);
  }
  return 1;
}

// --- Klimb and Hole up ----------------------------------------------------------------

/** CMDS_1c20: Klimb outdoors: over rocks with a grapple (the clumsy fall). */
export async function klimbOutdoors(g: Game): Promise<number> {
  const s = g.s;
  g.say(0xa1a0); // "Klimb-"
  if (s.grapple === 0) {
    g.say(0x9016); // "With what?\n"
    return 1;
  }
  if (s.partyTile !== 0x1c) {
    g.say(0x9022); // "On foot!\n"
    return 1;
  }
  if (!(await selectDirection(g))) return 1;
  const dx = s.dx;
  const dy = s.dy;
  const t = tileAt(g, s.x + dx, s.y + dy);
  if (t === 13) {
    g.say(0x902c); // "Impassable!\n"
  } else if (t !== 12) {
    g.say(0x903a); // "Not climbable!\n"
  } else {
    for (let i = 0; i < s.partySize; i++) {
      const m = s.members[i];
      if (m.status !== Status.Dead && m.dex < g.random(1, 0x1e)) {
        g.say(0x904a); // "Fell!\n"
        await damageMember(g, i, g.random(1, 5));
      }
    }
    stepParty(g, dx, dy);
  }
  return 1;
}

/**
 * Wait (the port's, a controller's, in a towne off a bed): the hours passed standing, as a bed passes them (holeUpInBed)
 * but awake - no rest, the town to be seen as the hours go. The townsfolk go where the hours take them; one who comes
 * onto the party's square, or a guard or foe who comes up beside it (npc.ts approach), ends the wait, and the town
 * deals with them as it would. Not begun with one beside the party already.
 */
export async function waitInTown(g: Game): Promise<void> {
  const s = g.s;
  g.print('Wait- ');
  g.say(0x4209); // "For how many hours? "
  const hours = await getHours(g, () => 'Wait');
  if (hours === 0) {
    g.print(' \n');
    return;
  }
  g.print(String(hours));
  g.printChar('\n');
  const until = (s.hour + hours) % 24;
  for (let i = 0; i < 0x10; i++) {
    moveNpcs(g, s.hour);
    updateFrame(g);
    if (s.d65be === 0x61) {
      g.print('Not now!\n');
      return;
    }
  }
  g.print('Waiting...\n');
  let hour = s.hour;
  while (until !== s.hour) {
    passTime(g, 10);
    if (hour !== s.hour && (s.hour === 0x14 || s.hour === 5)) hourTiles(g);
    hour = s.hour;
    drawMoons(g);
    await endTurn(g);
    drawVitals(g);
    placeAllNpcs(g);
    moveNpcs(g, s.hour);
    g.viewDirty = 1;
    updateFrame(g);
    if (actorTileAt(g, s.x, s.y, s.level) !== 0 || s.d65be === 0x61) {
      g.print('Interrupted!\n');
      break;
    }
    await g.p.sleep(1000 / 18.2);
  }
  drawVitals(g);
}

/**
 * CMDS_0552: sleeping in a bed until the hour chosen, unless someone comes. Six hours slept, and not too soon after
 * the last, is a rest, taken there and then, as a camp's is (rest.ts restTimer; the port's - in 1988 a bed only passed
 * the hours).
 */
export async function holeUpInBed(g: Game): Promise<void> {
  const s = g.s;
  g.say(0x4209); // "For how many hours? "
  const hours = await getHours(g, (h) => restOutcome(g, h));
  if (hours === 0) {
    g.cancelled = true; // no hours: not slept, and no turn spent
    return;
  }
  g.print(String(hours));
  g.printChar('\n');
  let until = s.hour + hours;
  // Past midnight, the hour is the day's (the 1988 game took 23 away, and slept an hour longer than asked).
  if (until > 0x17) until -= 0x18;
  for (let i = 0; i < 0x10; i++) {
    moveNpcs(g, s.hour);
    updateFrame(g);
    if (s.d65be === 0x61) return;
  }
  const active = s.activeMember;
  for (let i = 0; i < s.partySize; i++) if (s.members[i].status === Status.Good) s.members[i].status = Status.Sleeping;
  drawVitals(g);
  g.say(0x421e); // "Zzzzzzz...\n"
  g.draw.pen = 0;
  g.draw.fill(8, 8, 0xb7, 0xb7);
  // A rest as soon as it is earned, the poisoned not healed, as at a camp (rest.ts restTimer).
  const timer = restTimer(g, (m) => s.members[m].status === Status.Poisoned);
  let hour = s.hour;
  while (until !== s.hour) {
    passTime(g, 10);
    if (hour !== s.hour && (s.hour === 0x14 || s.hour === 5)) hourTiles(g);
    if (hour !== s.hour) timer.hourPassed();
    hour = s.hour;
    drawMoons(g);
    await endTurn(g);
    drawVitals(g);
    placeAllNpcs(g);
    if (actorTileAt(g, s.x, s.y, s.level) !== 0) {
      until = -1;
      break;
    }
    await g.p.sleep(1000 / 18.2);
  }
  if (until === -1) g.say(0x422a); // "Thrown out of bed!\n"
  for (let i = 0; i < s.partySize; i++) if (s.members[i].status === Status.Sleeping) s.members[i].status = Status.Good;
  s.activeMember = active;
  s.x++;
  g.viewDirty = 1;
  s.actors[0].x++;
  drawVitals(g);
  updateFrame(g);
}
