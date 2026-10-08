import { describe, expect, it } from 'vitest';
import { canEnter } from '../src/game/actors.ts';
import { arenaFree, clearShot, combatantAt, onMonsterSide } from '../src/game/combat.ts';
import { CF, type Game } from '../src/game/game.ts';
import { K, Pad } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { Status } from '../src/game/save.ts';
import { tileAt } from '../src/game/world.ts';
import { keys, newGame, type FakePlatform } from './helpers.ts';
import { command, pick, type Step } from './pilot.ts';

/**
 * Doom walked from its mouth to the Mirror by a player with a controller who knows its map: no step of the way set
 * down by hand. Each of its eight levels is crossed square by square, its ladders climbed and its pits fallen through
 * (one pit fallen through to be climbed back up with the grapple, the way on beyond it), and each room on the way left
 * by a side or a ladder its field lets the party reach - the strange walls dissolved with the Sceptre, hidden doors
 * found and a room's trigger walls pushed by walking into them, and the trigger across a river shot at with a bow (a
 * missile landing on one works it). The Crown is worn, as the walkthrough has it, so no foe's spell takes hold. The
 * way is the test, not the fights: each is over at the party's first turn (the development build's auto kill, as the
 * other path tests have).
 */

type Way = number | 'up' | 'down' | 'roomup' | 'roomdown';
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const MOVE: number[] = [K.Up, K.Right, K.Down, K.Left];
const DOOM = 0x28;
const MIRROR = { l: 7, x: 5, y: 7 };

const BOW = 0x24; // the Magic Bow: no arrows to spend
const CROWN = 0x1c; // the worn regalia's slot (game.ts regalia)

/** Steps played one after the other. */
function seq(...steps: Step[]): Step {
  let at = 0;
  return (g) => {
    for (; at < steps.length; at++) {
      const k = steps[at](g);
      if (k !== undefined) return k;
    }
    return undefined;
  };
}

/** The crosshair brought onto (x, y) and the shot loosed. */
function aimAt(x: number, y: number): Step {
  let loosed = false;
  return (g) => {
    const s = g.s;
    if (loosed || !s.crosshair) return undefined;
    const dx = Math.sign(x - s.crossX);
    const dy = Math.sign(y - s.crossY);
    if (!dx && !dy) {
      loosed = true;
      return K.Enter;
    }
    if (dx && dy) return dx < 0 ? (dy < 0 ? 0xd3 : 0xd4) : dy < 0 ? 0xd5 : 0xd6;
    return dx < 0 ? K.Left : dx > 0 ? K.Right : dy < 0 ? K.Up : K.Down;
  };
}

/** A walker through Doom: at each prompt, the next step of the shortest way (as the maps stand now) to the Mirror's room. */
function walker(g: Game, p: FakePlatform, trace: string[]): void {
  const s = g.s;
  let script: Step | null = null;
  let budget = 20000;
  // The room the party is in (its cell and how it came in), and the ways out found closed, entered each way.
  let room: { l: number; x: number; y: number; entry: Way | 'fall' } | null = null;
  const closed = new Map<string, Set<Way>>();
  const bumped = new Set<string>();
  const bad = new Set<number>();
  const noClimb = new Set<number>();
  let last = '';
  let was = '';
  let stuck = 0;
  let klimbed = -1;

  const cellAt = (l: number, x: number, y: number): number => s.dungeon[l * 64 + (y & 7) * 8 + (x & 7)];
  const kind = (l: number, x: number, y: number): number => cellAt(l, x, y) & 0xf0;
  const isRoom = (k: number): boolean => k === 0xa0 || k === 0xf0;
  const roomMap = (cell: number): Uint8Array => {
    const at = 0x1600 * (DOOM - 0x22) + (cell & 0xf) * 0x160; // DUNGEON.CBT has no rooms for Despise (dungeon.ts enterRoom)
    return g.data.files.get('DUNGEON.CBT').subarray(at, at + 0x160);
  };
  const walkable = (t: number): boolean => t !== 0xff && (canEnter(g, 0x1c, t) || (t & 0xf0) === 0x70);
  /** The ways out of a room: sides whose edge has floor (or a strange wall, or what a trigger puts there); ladders. */
  const roomWays = (cell: number): Set<Way> => {
    const m = roomMap(cell);
    const after = new Map<number, number>();
    for (let i = 0; i < 8; i++) {
      if ((m[8 * 32 + 11 + i] === 0 && m[8 * 32 + 19 + i] === 0) || m[8 * 32 + 11 + i] > 10) continue;
      for (const row of [9, 10]) {
        const x = m[row * 32 + 11 + i];
        const y = m[row * 32 + 19 + i];
        if (x < 11 && y < 11) after.set(y * 11 + x, m[11 + i]);
      }
    }
    const out = new Set<Way>();
    DIRS.forEach(([dx, dy], f) => {
      for (let i = 0; i < 11; i++) {
        const x = dx < 0 ? 0 : dx > 0 ? 10 : i;
        const y = dy < 0 ? 0 : dy > 0 ? 10 : i;
        const later = after.get(y * 11 + x);
        if (walkable(m[y * 32 + x]) || (later !== undefined && walkable(later))) {
          out.add(f);
          break;
        }
      }
    });
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 11; x++) {
        if (m[y * 32 + x] === 0xc8) out.add('roomup');
        if (m[y * 32 + x] === 0xc9) out.add('roomdown');
      }
    return out;
  };

  /** Dijkstra over the dungeon's squares, from (l, x, y) to the Mirror's room: the first way to take, or null. */
  const plan = (l0: number, x0: number, y0: number, here: Set<Way> | null): Way | null => {
    const key = (l: number, x: number, y: number): number => l * 64 + y * 8 + x;
    const start = key(l0, x0, y0);
    const dist = new Map([[start, 0]]);
    const first = new Map<number, Way>();
    const how = new Map<number, Way | 'fall'>();
    const open: [number, number][] = [[0, start]];
    // A square's key carries whether the party fell onto it (512): under a pit fallen through, a hole to climb.
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, n0] = open.shift()!;
      if (d > dist.get(n0)!) continue;
      const fell = n0 >= 512;
      const c = n0 & 511;
      const l = c >> 6;
      const x = c & 7;
      const y = (c >> 3) & 7;
      if (l === MIRROR.l && x === MIRROR.x && y === MIRROR.y) return first.get(n0) ?? null;
      const k = kind(l, x, y);
      const push = (to: number, w: number, way: Way, came: Way | 'fall'): void => {
        const n = came === 'fall' ? to + 512 : to;
        if (dist.has(n) && dist.get(n)! <= d + w) return;
        dist.set(n, d + w);
        first.set(n, n0 === start ? way : first.get(n0)!);
        how.set(n, came);
        open.push([d + w, n]);
      };
      // A room is left only by what its field offers - less what was found closed, entered this way.
      let ways: Set<Way> | null = null;
      if (n0 === start && here) ways = here;
      else if (isRoom(k)) {
        const shut = closed.get(`${l},${x},${y}:${String(how.get(n0))}`);
        ways = new Set([...roomWays(cellAt(l, x, y))].filter((w) => !shut?.has(w)));
      }
      DIRS.forEach(([dx, dy], f) => {
        if (ways && !ways.has(f)) return;
        const nx = (x + dx) & 7;
        const ny = (y + dy) & 7;
        const nk = kind(l, nx, ny);
        if (nk === 0xb0 || nk === 0xc0 || bad.has(key(l, nx, ny))) return;
        if ((cellAt(l, nx, ny) & 0xf7) === 0x61 && l < 7) push(key(l + 1, nx, ny), 8, f, 'fall');
        else push(key(l, nx, ny), isRoom(nk) ? 40 : nk === 0x80 ? 12 : nk === 0x60 ? 15 : nk === 0xd0 ? 6 : 1, f, f);
      });
      if (!ways) {
        if ((k === 0x20 || k === 0x30) && l < 7) push(key(l + 1, x, y), 2, 'down', 'down');
        if ((k === 0x10 || k === 0x30) && l > 0) push(key(l - 1, x, y), 2, 'up', 'up');
        // A hole in the ceiling is climbed with the grapple (dungeon.ts klimbInDungeon). A fall through a pit leaves
        // one under it, and the pit spent (pitTrap): the way back up, and on beyond the pit's square.
        const hole = (cellAt(l, x, y) & 8) !== 0 || (fell && (cellAt(l - 1, x, y) & 0xf7) === 0x61);
        if (s.grapple && l > 0 && k < 0xa0 && k !== 0x10 && k !== 0x30 && !noClimb.has(c) && hole) push(key(l - 1, x, y), 3, 'up', 'up');
      } else {
        if (ways.has('roomdown') && l < 7) push(key(l + 1, x, y), 5, 'roomdown', 'roomdown');
        if (ways.has('roomup') && l > 0) push(key(l - 1, x, y), 5, 'roomup', 'roomup');
      }
    }
    return null;
  };

  /** Climb, up or down as asked: from the command menu, and the way chosen where both are offered. */
  const climb = (up: boolean): Step => {
    const open = command('Climb');
    const which = pick('Climb', up ? 'Up' : 'Down');
    let shut = false;
    return (game) => {
      if (shut) return undefined;
      const m = game.menuShown;
      if (m?.title === 'Climb') return which(game);
      // Not offered here (no ladder, no hole yet): the menu closed again, and the climb left out of the plans.
      if (m?.title === 'Commands' && !m.labels.includes('Climb')) {
        noClimb.add(s.level * 64 + s.y * 8 + s.x);
        shut = true;
        return Pad.B;
      }
      return open(game);
    };
  };

  /** Which room the party stands in, by its field (Doom's mouth opens into one). */
  const likeness = (cell: number): number => {
    const m = roomMap(cell);
    let same = 0;
    for (let i = 0; i < 11 * 32; i++) if (i % 32 < 11 && m[i] === g.combatMap[i]) same++;
    return same;
  };
  const findRoom = (entry: Way | 'fall'): void => {
    let best = -1;
    let bestSame = 100;
    for (let c = 0; c < 64; c++) {
      if (!isRoom(kind(s.level, c & 7, c >> 3))) continue;
      const same = likeness(cellAt(s.level, c & 7, c >> 3));
      if (same > bestSame) [best, bestSame] = [c, same];
    }
    if (best < 0) throw new Error(`a room not found on level ${s.level}`);
    room = { l: s.level, x: best & 7, y: best >> 3, entry };
  };
  // The way the party last left a room by: a room's ladder (or side) may lead straight into the next room.
  let leftBy: Way | 'fall' = 'fall';

  /** In a room with no foe standing: the member whose turn it is walks toward the way out the plan takes. */
  const roomTurn = (corridor: boolean): number | Step => {
    if (!corridor && (!room || room.l !== s.level || likeness(cellAt(room.l, room.x, room.y)) <= 100)) findRoom(room ? leftBy : 'fall');
    const r = room ?? { l: s.level, x: 0, y: 0, entry: 'fall' };
    const me = g.combat[s.combatTurn];
    if (!(me.flags & CF.Player)) return Pad.B;
    const tile = s.actors[me.actor].tile;
    const start = me.y * 11 + me.x;
    // What this member can reach on the field as it stands: sides walked off, ladders stood on.
    const from = new Map<number, number>([[start, -1]]);
    const queue = [start];
    const exits = new Map<Way, number>();
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % 11;
      const y = Math.floor(c / 11);
      const t = tileAt(g, x, y);
      if (t === 0xc8 && !exits.has('roomup')) exits.set('roomup', c);
      if (t === 0xc9 && !exits.has('roomdown')) exits.set('roomdown', c);
      DIRS.forEach(([dx, dy], f) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx > 10 || ny > 10) {
          if (!exits.has(f)) exits.set(f, c);
          return;
        }
        const n = ny * 11 + nx;
        if (from.has(n)) return;
        const free = arenaFree(g, tile, nx, ny) || ((tileAt(g, nx, ny) & 0xf0) === 0x70 && s.sceptre !== 0);
        const friend = combatantAt(g, nx, ny);
        if (!free && !(friend >= 0 && g.combat[friend].flags & CF.Player)) return;
        from.set(n, c);
        queue.push(n);
      });
    }
    const entry = `${r.l},${r.x},${r.y}:${String(r.entry)}`;
    const shut = closed.get(entry) ?? new Set<Way>();
    closed.set(entry, shut);
    // All must leave by the one way: the first member out chose it.
    const chosen: Way | null = s.exitDir === 0 ? null : s.exitDir === 5 ? 'roomup' : s.exitDir === 6 ? 'roomdown' : MOVE.indexOf(s.exitDir);
    const ways = new Set([...roomWays(cellAt(r.l, r.x, r.y)), ...exits.keys()].filter((w) => !shut.has(w)));
    // A fight in a corridor is left by any side (the party stays where it was).
    const near = [...exits.keys()].sort((a, b) => queue.indexOf(exits.get(a)!) - queue.indexOf(exits.get(b)!))[0];
    const way = chosen ?? (corridor ? (near ?? null) : plan(r.l, r.x, r.y, ways));
    if (way === null) throw new Error(`no way out of room ${entry} toward the Mirror: ${trace.slice(-12).join(' / ')}`);
    leftBy = way;
    // The square to make for, and what to do there: take the way out, or push a trigger (walk onto it, or into it).
    let target = exits.get(way);
    let then: number | Step | null = null;
    let trig = -1; // the trigger made for, when the way out is not open yet
    if (target !== undefined) {
      then = typeof way === 'number' ? MOVE[way] : climb(way === 'roomup');
    } else {
      const m = g.combatMap;
      let best = Infinity;
      for (let k = 0; k < 8; k++) {
        const tx = m[8 * 32 + 11 + k];
        const ty = m[8 * 32 + 19 + k];
        if (tx > 10 || ty > 10 || (tx === 0 && ty === 0) || bumped.has(`${entry}:${tx},${ty}`)) continue;
        const t = ty * 11 + tx;
        if (from.has(t) && queue.indexOf(t) < best) [best, target, then, trig] = [queue.indexOf(t), t, null, t];
        DIRS.forEach(([dx, dy], f) => {
          const n = (ty - dy) * 11 + (tx - dx);
          if (tx - dx < 0 || ty - dy < 0 || tx - dx > 10 || ty - dy > 10 || !from.has(n)) return;
          if (queue.indexOf(n) < best) [best, target, then, trig] = [queue.indexOf(n), n, MOVE[f], t];
        });
      }
      // A trigger out of reach across water: shot at with the Magic Bow (a missile landing on one works it,
      // combat.ts missileAt) from where the archer has a clear shot.
      const archer = g.combat.findIndex((c) => (c.flags & (CF.Player | CF.Dead)) === CF.Player && s.members[c.who].equips[2] === BOW);
      if (target === undefined && archer >= 0) {
        const missile = g.data.bytes(0x169c, 0x38)[BOW];
        for (let k = 0; k < 8 && target === undefined; k++) {
          const tx = m[8 * 32 + 11 + k];
          const ty = m[8 * 32 + 19 + k];
          if (tx > 10 || ty > 10 || (tx === 0 && ty === 0) || bumped.has(`${entry}:${tx},${ty}`)) continue;
          if (s.combatTurn !== archer) return Pad.B; // the archer's to do: the rest wait
          const from = queue.find((n) => {
            const [nx, ny] = [n % 11, Math.floor(n / 11)];
            return Math.max(Math.abs(nx - tx), Math.abs(ny - ty)) <= 7 && clearShot(g, nx, ny, tx, ty, missile);
          });
          if (from === undefined) continue;
          if (from === start) {
            bumped.add(`${entry}:${tx},${ty}`);
            trace.push(`shot at ${tx},${ty}`);
            return seq(command(/^Attack/), aimAt(tx, ty));
          }
          target = from;
        }
      }
      if (target === undefined) {
        // No trigger left to try: this way is closed to the party, entered as it was.
        shut.add(way);
        trace.push(`room ${entry} closed ${String(way)}`);
        return Pad.B;
      }
    }
    if (target === start) {
      // A trigger pushed (walked into) or stood on: not tried again in this room.
      if (trig >= 0) {
        bumped.add(`${entry}:${trig % 11},${Math.floor(trig / 11)}`);
        trace.push(`trigger ${trig % 11},${Math.floor(trig / 11)}`);
      }
      return then ?? Pad.B;
    }
    let c = target;
    while (from.get(c) !== start) c = from.get(c)!;
    if (combatantAt(g, c % 11, Math.floor(c / 11)) >= 0) return Pad.B; // a friend in the way: wait for them
    const nx = c % 11;
    const ny = Math.floor(c / 11);
    return nx > me.x ? K.Right : nx < me.x ? K.Left : ny > me.y ? K.Down : K.Up;
  };

  /** The Mirror's room: the first member still standing walks to the Mirror (x 5, y 2), the rest waiting; then the next. */
  const mirrorTurn = (): number => {
    const me = g.combat[s.combatTurn];
    const lead = g.combat.findIndex((c) => (c.flags & CF.Player) !== 0 && (c.flags & CF.Dead) === 0);
    if (!(me.flags & CF.Player) || s.combatTurn !== lead) return Pad.B;
    if (me.x !== 5 && me.y > 3) return me.x < 5 ? K.Right : K.Left;
    if (me.y > 2) return K.Up;
    return me.x !== 5 ? (me.x < 5 ? K.Right : K.Left) : Pad.B;
  };

  const decide = (): number | Step | undefined => {
    if (p.log.includes('Be it known that on')) return undefined; // the end's last page: the walk is over
    if (/is\s+absorbed/.test(p.log) && g.commandPrompt !== 'combat') {
      // The end's questions (the box brought: yes) and pages.
      const yes = g.menuShown?.labels.findIndex((l) => /^yes/i.test(l)) ?? -1;
      if (yes >= 0) return g.menuShown!.at === yes ? Pad.A : g.menuShown!.at < yes ? K.Down : K.Up;
      return Pad.A;
    }
    if (s.mapId !== 0xff && s.mapId !== DOOM) return undefined;
    const where = `${s.mapId},${s.level},${s.x},${s.y},${g.commandPrompt}`;
    if (where !== last) trace.push((last = where));
    // In Doom the Crown is worn, not the Amulet (worn for the darkness at its mouth): no foe's spell takes hold.
    const turn = g.commandPrompt === 'combat' ? g.combat[s.combatTurn] : null;
    if (g.regalia !== CROWN && (g.commandPrompt === 'dungeon' || (turn && turn.flags & CF.Player)))
      return seq(command('Use item'), pick('Items', 'Crown'));
    if (g.commandPrompt === 'combat') {
      const standing = g.combat.some((c, i) => c.flags && !(c.flags & CF.Dead) && onMonsterSide(g, i));
      if (standing) return Pad.B; // auto kill ends a fight at the party's first turn
      if (room && room.l === MIRROR.l && room.x === MIRROR.x && room.y === MIRROR.y) return mirrorTurn();
      return roomTurn(!(s.combatFlags & 0x80));
    }
    if (g.commandPrompt !== 'dungeon') return Pad.B;
    room = null;
    const at = s.level * 64 + s.y * 8 + s.x;
    // A climb that went nowhere (no hole there yet): not tried again until a fall makes one.
    if (klimbed === at) noClimb.add(at);
    klimbed = -1;
    // In the dark a torch is lit: the way is seen, and a hidden door walked into is searched (dungeon.ts move).
    if (s.d58a6 === 0 && s.d58a7 === 0 && s.torches > 0) return command(/^Ignite/);
    // Stuck before a square (walked into again and again): left out of the plans.
    const here = `${s.level},${s.x},${s.y},${s.facing}`;
    stuck = here === was ? stuck + 1 : 0;
    was = here;
    if (stuck > 6) {
      const [dx, dy] = DIRS[s.facing];
      bad.add(s.level * 64 + ((s.y + dy) & 7) * 8 + ((s.x + dx) & 7));
      trace.push(`stuck before ${s.level},${(s.x + dx) & 7},${(s.y + dy) & 7}`);
      stuck = 0;
    }
    const way = plan(s.level, s.x, s.y, null);
    if (way === null) throw new Error(`no way to the Mirror from ${s.level},${s.x},${s.y}: ${trace.slice(-12).join(' / ')}`);
    if (way === 'up' || way === 'down') {
      const to = s.level + (way === 'up' ? -1 : 1);
      if (isRoom(kind(to, s.x, s.y))) room = { l: to, x: s.x, y: s.y, entry: way };
      klimbed = at;
      return climb(way === 'up');
    }
    if (typeof way !== 'number') throw new Error(`a room's way (${way}) planned from a corridor`);
    if (s.facing !== way) return ((way - s.facing) & 3) === 3 ? K.Left : K.Right;
    const [dx, dy] = DIRS[way];
    const nx = (s.x + dx) & 7;
    const ny = (s.y + dy) & 7;
    if ((cellAt(s.level, nx, ny) & 0xf7) === 0x61) {
      noClimb.clear(); // the fall leaves a hole to climb
      if (isRoom(kind(s.level + 1, nx, ny))) room = { l: s.level + 1, x: nx, y: ny, entry: 'fall' };
    } else if (isRoom(kind(s.level, nx, ny))) room = { l: s.level, x: nx, y: ny, entry: way };
    return K.Up;
  };

  // The game waiting on nothing but time, for ever (no key asked): stopped, and where it was told.
  let naps = 0;
  p.sleep = async () => {
    if (++naps > 200000) {
      naps = -Infinity;
      throw new Error(`the game runs on without asking for a key: ${trace.slice(-8).join(' / ')}\n${p.log.slice(-600)}`);
    }
  };
  p.next = () => {
    naps = 0;
    if (--budget < 0) throw new Error(`lost in Doom: ${trace.slice(-16).join(' / ')}\n${p.log.slice(-400)}`);
    for (let spin = 0; ; spin++) {
      if (spin > 50) throw new Error(`the walker gives no key: ${trace.slice(-8).join(' / ')} (menu ${g.menuShown?.title ?? 'none'})`);
      if (script) {
        const k = script(g);
        if (k !== undefined) return k;
        script = null;
      }
      const d = decide();
      if (typeof d !== 'function') return d;
      script = d;
    }
  };
}

describe('Doom, walked', () => {
  it('is walked from its mouth down its eight levels to the Mirror, and the end follows', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    for (let m = 0; m < s.partySize; m++) Object.assign(s.members[m], { status: Status.Good, hp: 800, maxHp: 800 });
    s.food = 900;
    g.autoKill = true; // a fight on the way is over at the party's first turn (the development build's auto kill)
    stashWorldActors(g);
    const doom = g.data.locations[0x27];
    Object.assign(s, { mapId: 0, level: 0xff, x: doom.x, y: doom.y - 1, activeMember: 0 });
    g.regalia = 0x0e; // the Amulet worn
    s.protection = 0xff;
    for (let k = 0; k < 3; k++) s.shadowlords[k] = 0xff;
    s.crown = s.sceptre = s.amulet = 0xff;
    s.sandalwoodBox = 1;
    s.grapple = 1;
    s.torches = 40;
    s.members[2].equips[2] = BOW; // Iolo's bow (the walkthrough's party carries one)
    s.members[2].equips[3] = 0xff;
    // At Doom's mouth, its word yelled and the party in (typed: the path tests show it by the pad); then the walker.
    const trace: string[] = [];
    walker(g, p, trace);
    const walk = p.next!;
    const word = g.data.table(0x4502, 8)[7];
    const start = [...keys('Y', word), K.Enter, K.Down, ...keys('E')];
    p.next = () => {
      if (start.length) return start.shift();
      g.options.input = 'controller';
      return walk();
    };
    await runGame(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    const levels = new Set(trace.filter((t) => t.startsWith(`${DOOM},`)).map((t) => Number(t.split(',')[1])));
    expect([...levels].sort(), trace.slice(-20).join(' / ')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // The way's puzzles, each met: the river's trigger shot across from the room under the ladder (DUNGEON.CBT
    // room fb), the trigger walls of the rooms beyond pushed, the pit at (1, 1) on level 7 climbed back up with the
    // grapple, the strange walls of Doom's first room dissolved by the Sceptre.
    expect(trace).toContain('shot at 1,1');
    expect(trace.filter((t) => t.startsWith('trigger')).length).toBeGreaterThanOrEqual(6);
    expect(trace.join(' ')).toMatch(/40,7,1,1,dungeon.*40,6,1,1,dungeon/);
    expect(p.log).toMatch(/Wielding\s+the\s+Sceptre/);
    expect(p.log.match(/Pit\s+Trap!/g)?.length).toBeGreaterThanOrEqual(4);
    expect(p.log).toMatch(/is\s+absorbed!/);
    expect(p.log).toContain('Be it known that on');
  }, 120000);
});
