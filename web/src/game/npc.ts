/**
 * npc.ts
 *
 * The people of a settlement (u5d npc.c): each has a schedule of three
 * places and the hours they go there; they wander, stand, follow or keep
 * away from the party, climb ladders and stairs between levels, and find
 * their way with a small breadth-first search over the level
 * (NPC_032c), whose ring queue of 32 squares shapes the paths they take.
 *
 * NPC state (NpcFmt, D_5f5e) field 0 is the NPC's mode: 0 absent, 1 at
 * its place, 2 walking there, 3 walking to a ladder, 4-7 changing level
 * (4 and 5 elsewhere coming down or up, 6 and 7 here going up or down),
 * 8 elsewhere.
 */

import { actorTileAtRev, freeActor, setActor } from './actors.ts';
import { Game } from './game.ts';
import { T } from './tiles.ts';
import { tileAt } from './world.ts';

const FILES = ['TOWNE.NPC', 'DWELLING.NPC', 'CASTLE.NPC', 'KEEP.NPC'];

/** NPC_0000: this settlement's schedules, NPC tiles and talk numbers. */
export function loadNpcs(g: Game): void {
  const s = g.s;
  const id = s.mapId - 1;
  const file = g.data.files.get(FILES[id >> 3]);
  const base = (id & 7) * 0x240;
  for (let i = 0; i < 32; i++) s.schedules[i].b.set(file.subarray(base + i * 16, base + i * 16 + 16));
  s.npcTypes.set(file.subarray(base + 0x200, base + 0x220));
  for (let i = 0; i < 32; i++) s.npcs[i].fa = file[base + 0x220 + i];
}

/** NPC_12e0: which of its three places an NPC keeps at this hour. */
export function scheduleSlot(g: Game, npc: number, hour: number): number {
  const sch = g.s.schedules[npc];
  const since = [0, 1, 2, 3].map((i) => (hour - sch.time(i)) & 0xff);
  let best = since[0];
  let slot = 0;
  if (since[1] < best) {
    best = since[1];
    slot = 1;
  }
  if (since[2] < best) {
    best = since[2];
    slot = 2;
  }
  if (since[3] < best) slot = 1;
  return slot;
}

/** NPC_00d6: every NPC at its place for the hour, no path in hand. */
export function placeNpcs(g: Game, hour: number): void {
  const s = g.s;
  for (let i = 1; i < 32; i++) {
    const n = s.npcs[i];
    if (s.npcTypes[i] === 0) {
      n.f0 = 0;
      continue;
    }
    const slot = scheduleSlot(g, i, hour);
    const sch = s.schedules[i];
    n.f0 = 1;
    n.x = sch.x(slot);
    n.y = sch.y(slot);
    n.z = sch.z(slot);
    n.f8 = s.npcTypes[i];
    n.fe = slot;
    n.actor = 0;
    s.setMovePtr(i, -1);
    s.moves[i][0] = 0;
    s.setD65c2(i, 0);
  }
}

/** NPC_06a0: the distance along the grid. */
const manhattan = (x1: number, y1: number, x2: number, y2: number): number => Math.abs(x1 - x2) + Math.abs(y1 - y2);

/** NPC_0632: step (dx, dy) one square in direction 1-4 (east, north, west, south), with the original's odd clamps. */
function step(g: Game, dir: number): void {
  const s = g.s;
  switch (dir) {
    case 1:
      s.dx++;
      if (s.dy > 0x20) s.dx = 0x20;
      break;
    case 2:
      s.dy--;
      if (s.dx < 0) s.dy = 0;
      break;
    case 3:
      s.dx--;
      if (s.dy < 0) s.dx = 0;
      break;
    case 4:
      s.dy++;
      if (s.dx > 0x20) s.dy = 0x20;
      break;
  }
}

/** NPC_0adc: can the NPC stand on (x, y, z): 2 at its destination, else by the walk table D_367e (ladders when heading for one). */
function npcCanStand(g: Game, x: number, y: number, z: number, npc: number, slot: number): number {
  const sch = g.s.schedules[npc];
  if (slot > -1 && sch.x(slot) === x && sch.y(slot) === y && sch.z(slot) === z) return 2;
  const tile = x < 0 || y < 0 || x > 0x1f || y > 0x1f ? g.map[1023] : g.map[y * 32 + x];
  if (g.s.npcs[npc].f0 === 3 && (tile === T.LadderUp || tile === T.LadderDown)) return 1;
  const walk = g.data.bytes(0x367e, 0x20);
  return (walk[tile >> 3] & (0x80 >> (tile & 7))) === 0 ? 1 : 0;
}

/** NPC_0b9e: can the NPC step onto (x, y): Shadowlords go anywhere, nobody onto another actor. */
function npcCanStep(g: Game, x: number, y: number, npc: number, slot: number): number {
  const s = g.s;
  if (x < 0 || x > 0x1f || y < 0 || y > 0x1f) return 0;
  const t = tileAt(g, x, y) & 0xfc;
  let ok: number;
  if (s.npcTypes[npc] === 0xfc) ok = 1;
  else if (t === T.T30) ok = 1;
  else if (t === T.Chair90 && s.npcs[npc].f0 !== 2) ok = 0;
  else ok = npcCanStand(g, x, y, s.level, npc, slot);
  // Searching the actors leaves dx at the last one looked at, as the original's loop variable did.
  const occupied = actorTileAtRev(g, x, y, s.level);
  return ok === 0 || occupied !== 0 ? 0 : ok;
}

/** NPC_01d2: the search grid: blocked squares 0x90, the goal 5, the start 0x46. */
function buildGrid(g: Game, x1: number, y1: number, x2: number, y2: number, goal: number, npc: number): void {
  const s = g.s;
  const grid = g.scratch;
  const ladder = goal === -1 ? T.LadderUp : goal === -2 ? T.LadderDown : -1;
  const slot = scheduleSlot(g, npc, s.hour);
  for (let y = 0; y < 0x20; y++) {
    for (let x = 0; x < 0x20; x++) {
      grid[x + y * 0x20] = npcCanStand(g, x, y, s.level, npc, slot) !== 0 ? 0 : 0x90;
      if (goal < 0 && g.map[y * 32 + x] === ladder) grid[x + y * 0x20] = 5;
    }
  }
  const me = s.npcs[npc];
  for (let i = 0x1f; i > 0; i--) {
    const a = s.actors[i];
    if (a.tile > 0x3f && manhattan(a.x, a.y, me.x, me.y) < 4) grid[a.y * 0x20 + a.x] = 0x90;
  }
  const p = s.actors[0];
  if (manhattan(p.x, p.y, me.x, me.y) < 4) grid[p.y * 0x20 + p.x] = 0x90;
  if (goal > -1) grid[y2 * 0x20 + x2] = 5;
  grid[y1 * 0x20 + x1] = 0x46;
}

/** NPC_032c: search from (x1, y1) for the goal; 1 and the goal in (dx, dy) if found. */
function search(g: Game, x1: number, y1: number, x2: number, y2: number, goal: number, npc: number): number {
  const s = g.s;
  const grid = g.scratch;
  const qx = new Uint8Array(32);
  const qy = new Uint8Array(32);
  buildGrid(g, x1, y1, x2, y2, goal, npc);
  qx[0] = x1;
  qy[0] = y1;
  let head = 0;
  let tail = 1;
  let e = 0;
  do {
    let a = qx[head];
    let b = qy[head];
    let dir = grid[b * 0x20 + a] >> 4;
    for (let k = 0; k < 4; k++) {
      switch (dir) {
        case 1:
          a--;
          if (a < 0) e = 2;
          break;
        case 2:
          b++;
          if (b > 0x20) e = 2;
          break;
        case 3:
          a++;
          if (a > 0x20) e = 2;
          break;
        case 4:
          b--;
          if (b < 0) e = 2;
          break;
      }
      if (e !== 2) {
        const at = b * 0x20 + a;
        if (grid[at] < 0x10) {
          e = grid[at] & 0xf;
          grid[at] = (dir << 4) & 0xff;
          if (e === 5) {
            e = 1;
            s.dx = a;
            s.dy = b;
            break;
          }
          if (tail !== head) {
            qx[tail] = a;
            qy[tail] = b;
            tail++;
          }
          if (tail >= 0x20) tail = 0;
        }
      }
      e = 0;
      dir = (dir & 3) + 1;
      a = qx[head];
      b = qy[head];
    }
    if (e === 1) return 1;
    head++;
    if (head === 0x20) head = 0;
  } while (head !== tail);
  return e;
}

/** NPC_01a0: search for the nearest ladder up (or down). */
function searchLadder(g: Game, x: number, y: number, up: boolean, npc: number): number {
  return search(g, x, y, 0, 0, up ? -1 : -2, npc);
}

/** NPC_04ac: turn the searched grid into the NPC's movement list, walking back from (x, y). */
function makePath(g: Game, npc: number, x: number, y: number): number {
  const s = g.s;
  const grid = g.scratch;
  const list = s.moves[npc];
  let count = 0;
  let n = 0;
  s.setMovePtr(npc, 0);
  let mark = grid[y * 0x20 + x] & 0xf;
  let dir = grid[y * 0x20 + x] >> 4;
  let run = dir;
  do {
    switch (dir) {
      case 1:
        x++;
        break;
      case 2:
        y--;
        break;
      case 3:
        x--;
        break;
      case 4:
        y++;
        break;
    }
    if (run === dir && mark !== 6) count++;
    if (run !== dir || mark === 6) {
      list[n++] = count;
      list[n++] = run;
      if (mark === 6) break;
      run = dir;
      count = 1;
    }
    dir = grid[y * 0x20 + x] >> 4;
    mark = grid[y * 0x20 + x] & 0xf;
  } while (n < 0x20);
  let j = n - 2;
  if (j >= 0) {
    let i = 0;
    do {
      let t = list[i];
      list[i] = list[j];
      list[j] = t;
      j++;
      i++;
      t = ((list[i] + 1) & 3) + 1;
      list[i] = ((list[j] + 1) & 3) + 1;
      list[j] = t;
      i++;
      j -= 3;
    } while (j >= i);
  }
  return n;
}

/**
 * NPC_06e4: an NPC close to the party approaches or (kind 3) keeps away;
 * next to the party, a talker (kinds 4 and 5) or an attacker (6 and 7)
 * sets D_65be and D_65bf for the town to act on.
 */
function approach(g: Game, npc: number, slot: number): void {
  const s = g.s;
  const party = s.actors[0];
  const me = s.npcs[npc];
  const kind = s.schedules[npc].type(slot);
  let d = manhattan(party.x, party.y, me.x, me.y);
  if (d === 1 && kind > 3) {
    if (kind === 4 || kind === 5) {
      if (me.fa !== 0) {
        s.d65be = 0x74;
        s.d65bf = npc;
      }
    } else {
      s.d65be = 0x61;
      s.d65bf = npc;
    }
    return;
  }
  const dist = [0, 0, 0, 0];
  for (let i = 1; i < 5; i++) {
    s.dx = me.x;
    s.dy = me.y;
    step(g, i);
    const nx = s.dx;
    const ny = s.dy;
    dist[i - 1] = npcCanStep(g, nx, ny, npc, -1) !== 0 ? manhattan(party.x, party.y, nx, ny) : 99;
  }
  let pick = -1;
  d = manhattan(party.x, party.y, me.x, me.y);
  for (let i = 1; i < 8; i++) {
    if (i < 5 && dist[i - 1] !== 99) {
      if (kind === 3) {
        if (d < dist[i - 1]) {
          if (pick === -1 || g.random(0, 1) !== 0) pick = i;
          if (i === 4) break;
        }
      } else if (dist[i - 1] < d) {
        pick = i;
        break;
      }
    }
    if (i > 4 && dist[i - 5] !== 99 && dist[i - 5] === d) {
      pick = i;
      break;
    }
  }
  if ((kind === 5 || kind === 7) && g.random(0, 0x3f) < 0x10) {
    let other = pick;
    for (let i = 1; i < 5; i++) {
      if (pick !== i && dist[i - 1] !== 99 && (other === pick || g.random(0, 0x3f) < 0x10)) other = i;
    }
    pick = other;
  }
  if (pick > -1) {
    s.dx = me.x;
    s.dy = me.y;
    step(g, pick);
    const a = s.actors[me.actor];
    a.x = me.x = s.dx;
    a.y = me.y = s.dy;
    g.viewDirty |= 2;
  }
}

/** NPC_0938: at a schedule hour, what the NPC must do to get to its new place (sets its mode); the place's number + 1, or 0. */
function scheduleChange(g: Game, npc: number, hour: number): number {
  const s = g.s;
  const me = s.npcs[npc];
  const sch = s.schedules[npc];
  let slot = -1;
  for (let i = 0; i < 4; i++) {
    if (sch.time(i) !== hour) continue;
    slot = scheduleSlot(g, npc, hour);
    if (slot === me.fe) {
      me.f0 = 1;
      break;
    }
    const lv = s.level;
    const lvs = (lv << 24) >> 24;
    if (me.z !== lv && sch.z(slot) !== lv) {
      me.f0 = 8;
    } else if (me.z === lv) {
      if (sch.z(slot) === lv) me.f0 = 2;
      else if (lvs < sch.zs(slot)) me.f0 = 6;
      else me.f0 = 7;
    } else if (lvs < (me.z << 24) >> 24) {
      me.f0 = 4;
    } else {
      me.f0 = 5;
    }
    break;
  }
  if (slot > -1 && me.x === sch.x(slot) && me.y === sch.y(slot) && me.z === sch.z(slot)) {
    slot = 0;
    me.f0 = 1;
  }
  return slot === -1 ? 0 : slot + 1;
}

/** NPC_0a4a: is the NPC standing on a way to its place's level. */
function onWayDown(g: Game, npc: number, slot: number): boolean {
  const s = g.s;
  const a = s.actors[s.npcs[npc].actor];
  const t = tileAt(g, a.x, a.y);
  if (s.schedules[npc].zs(slot) < (s.level << 24) >> 24) return t === T.LadderDown || (t & 0xf4) === T.Stair;
  return t === T.LadderUp || (t & 0xf4) === T.Stair;
}

/** NPC_0c50: now and then, a step in a random direction, staying within `range` of its place (0: anywhere). */
function wander(g: Game, npc: number, range: number, slot: number): void {
  const s = g.s;
  const me = s.npcs[npc];
  const sch = s.schedules[npc];
  if ((g.random(0, 0xff) & 8) === 0) return;
  const dir = (g.rng.upTo(0x40) & 3) + 1;
  s.dx = me.x;
  s.dy = me.y;
  step(g, dir);
  const nx = s.dx;
  const ny = s.dy;
  if ((range === 0 || manhattan(sch.x(slot), sch.y(slot), s.dx, s.dy) <= range) && npcCanStep(g, s.dx, s.dy, npc, slot) !== 0) {
    const a = s.actors[me.actor];
    a.x = me.x = nx;
    a.y = me.y = ny;
    g.viewDirty |= 2;
  }
}

/** NPC_0d00: what an NPC at its place does, by the place's kind. */
function behave(g: Game, npc: number, slot: number): void {
  const s = g.s;
  const me = s.npcs[npc];
  const sch = s.schedules[npc];
  switch (sch.type(slot)) {
    case 2:
      wander(g, npc, 0, slot);
      break;
    case 4:
      if (manhattan(s.x, s.y, sch.x(slot), sch.y(slot)) < 4) approach(g, npc, slot);
      break;
    case 1:
      wander(g, npc, 3, slot);
      break;
    case 3:
    case 6:
      if (manhattan(s.x, s.y, me.x, me.y) < 4) approach(g, npc, slot);
      break;
    case 5:
    case 7:
      approach(g, npc, slot);
      break;
  }
}

/** TOWN_1726: put NPC `npc` at (x, y, z), giving it an actor when it is on this level. */
export function putNpc(g: Game, npc: number, x: number, y: number, z: number): void {
  const s = g.s;
  if (s.npcTypes[npc] === 0) return;
  const me = s.npcs[npc];
  if (z !== s.level && me.actor !== 0) {
    s.actors[me.actor].tile = 0;
    me.actor = 0;
  }
  if (z === s.level && me.actor === 0) {
    const slot = freeActor(g);
    let b5 = 0;
    if (s.npcTypes[npc] === 1) b5 = 0x1e;
    else if ((g.data.ovl.data[0x28c6 + 0x10 + (s.mapId - 1) * 4 + (npc >> 3)] >> (npc & 7)) & 1) b5 = 0xff;
    setActor(g, slot, s.npcTypes[npc], s.npcTypes[npc], x, y, z, b5);
    s.actors[slot].b6 = 0;
    me.actor = slot;
  }
  if (z === s.level && me.actor !== 0) {
    const a = s.actors[me.actor];
    a.x = x;
    a.y = y;
    a.z = z;
  }
  me.x = x;
  me.y = y;
  me.z = z;
  me.f0 = 1;
}

/** NPC_0db4: one turn for every NPC in the settlement. */
export function moveNpcs(g: Game, hour: number): void {
  const s = g.s;
  let searched = 0;
  s.d65be = 0;
  s.d65bf = 0;
  for (let i = 1; i < 0x20; i++) {
    if (s.npcTypes[i] === 0) continue;
    let slot = scheduleSlot(g, i, hour);
    const me = s.npcs[i];
    const sch = s.schedules[i];
    if (me.f0 <= 1 && scheduleChange(g, i, hour) === 0) {
      if (me.z === s.level) behave(g, i, slot);
    } else if (me.f0 > 3) {
      if (me.f0 === 4 || me.f0 === 5) {
        if (searched !== 1) {
          searched = 1;
          const goal = me.f0 === 4 ? 3 : 4;
          let found = searchLadder(g, sch.x(slot), sch.y(slot), goal === 3, i);
          let lx = 0;
          let ly = 0;
          if (found !== 0) {
            lx = s.dx;
            ly = s.dy;
            found = search(g, lx, ly, sch.x(slot), sch.y(slot), goal, i);
          }
          if (found !== 0) {
            makePath(g, i, sch.x(slot), sch.y(slot));
            const t = g.map[ly * 32 + lx];
            if ((goal === 3 && t === T.LadderUp) || (goal === 4 && t === T.LadderDown) || (t & 0xfc) === T.Stair)
              putNpc(g, i, lx, ly, s.level);
            me.f0 = 2;
          }
        }
      } else if (me.f0 === 6 || me.f0 === 7) {
        if (onWayDown(g, i, slot)) {
          putNpc(g, i, sch.x(slot), sch.y(slot), sch.z(slot));
          me.fe = slot;
          s.setMovePtr(i, -1);
          me.f0 = 1;
        } else if (searched !== 1) {
          searched = 1;
          const goal = me.f0 === 6 ? 1 : 2;
          let found = searchLadder(g, me.x, me.y, goal === 1, i);
          let lx = 0;
          let ly = 0;
          if (found !== 0) {
            lx = s.dx;
            ly = s.dy;
            found = search(g, me.x, me.y, lx, ly, goal, i);
          }
          if (found !== 0) {
            makePath(g, i, lx, ly);
            me.f0 = 3;
          }
        }
      }
    } else {
      const ptr = s.movePtr(i);
      if (ptr > -1 && s.moves[i][ptr] !== 0) {
        s.dx = me.x;
        s.dy = me.y;
        step(g, s.moves[i][ptr + 1]);
        const nx = s.dx;
        const ny = s.dy;
        const ok = npcCanStep(g, s.dx, ny, i, slot);
        if (ok !== 0) {
          const a = s.actors[me.actor];
          a.x = nx & 0xff;
          me.x = nx & 0xff;
          a.y = ny & 0xff;
          me.y = ny & 0xff;
          g.viewDirty |= 2;
          s.moves[i][ptr]--;
          s.setD65c2(i, 0);
          if (s.moves[i][ptr] === 0) {
            let p = ptr + 1;
            s.moves[i][p++] = 0;
            s.setMovePtr(i, p);
            if (p >= 0x20 || s.moves[i][p] < 1) s.setMovePtr(i, -1);
            if (ok === 2) {
              me.fe = slot;
              me.f0 = 1;
              s.setMovePtr(i, -1);
            }
          }
        } else {
          s.setD65c2(i, s.d65c2(i) + 1);
          wander(g, i, 0, slot);
          if (s.d65c2(i) > 3) {
            s.setMovePtr(i, -1);
            s.setD65c2(i, 0);
          }
        }
      } else {
        if (ptr === -1 && me.f0 === 3) {
          slot = scheduleSlot(g, i, hour);
          me.f0 = s.level < sch.z(slot) ? 6 : 7;
          return;
        }
        if (searched < 1) {
          if (me.f0 !== 1) {
            const stuck = s.d65c2(i);
            if (stuck < 200 && (stuck === 0 || g.random(0, 2) === 1)) {
              if (s.movePtr(i) === -1) {
                searched++;
                if (search(g, me.x, me.y, sch.x(slot), sch.y(slot), 0, i) !== 0) {
                  makePath(g, i, sch.x(slot), sch.y(slot));
                  s.setD65c2(i, 0);
                  continue;
                }
                s.setD65c2(i, 200);
              }
              wander(g, i, 0, slot);
            } else {
              if (stuck >= 200) s.setD65c2(i, stuck + 1);
              if (s.d65c2(i) > 204) s.setD65c2(i, 0);
            }
          }
        } else {
          behave(g, i, me.fe);
        }
      }
    }
  }
}
