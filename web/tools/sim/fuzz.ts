/**
 * fuzz.ts (a stress test of the fight, run by hand)
 *
 * Fights played headless with a careless player: random rules, a random party (its size, level, arms - bows and
 * flasks of oil and Glass Swords among them - and the spells it has mixed), in a random outdoor arena against a random
 * creature or in a random dungeon room, with chests, gold and corpses strewn on the field; each turn auto combat's
 * key most of the time, else a random step or command (Attack, Switch Weapon, Push, Klimb, Open, Get, Search, Cast,
 * Ready, Use) and random answers to whatever it asks - by the keyboard's letters or the controller's buttons. After
 * every key, what must always hold of a fight is checked; a crash, a broken rule or a fight that never ends is
 * reported with the seed that replays it.
 *
 *   npx vite-node tools/sim/fuzz.ts [-- fights=500] [seed=1] [rooms=only|none] [log]
 */

import { freeActor } from '../../src/game/actors.ts';
import { canEnter } from '../../src/game/actors.ts';
import { autoKey } from '../../src/game/autocombat.ts';
import { arenaFight } from '../../src/game/combat.ts';
import { roomCell, startRoom } from '../../src/game/devStarts.ts';
import { CF, type Game } from '../../src/game/game.ts';
import { K, Pad } from '../../src/game/io.ts';
import { stashWorldActors } from '../../src/game/outdoors.ts';
import { restedMp } from '../../src/game/rest.ts';
import { journeyOnward, runGame } from '../../src/game/run.ts';
import { Status } from '../../src/game/save.ts';
import { RULES, type Rules } from '../../src/game/settings.ts';
import { tileAt } from '../../src/game/world.ts';
import { newGame } from '../../tests/helpers.ts';

const args = process.argv.slice(2).filter((a) => a !== '--');
const arg = (name: string): string | undefined => args.find((a) => a.startsWith(name + '='))?.slice(name.length + 1);
const FIGHTS = Number(arg('fights') ?? 300);
const FIRST = Number(arg('seed') ?? 1);
const ROOMS = arg('rooms') ?? 'mix';
const LOG = args.includes('log');
/** Keys a fight may take before it is called endless (a fight of 6 against 16 takes some hundreds). */
const MOST_KEYS = 20000;

/** A small seeded random of the harness's own, apart from the game's (which the game's tests mock). */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 0x100000000;
  };
}

class Done extends Error {}

interface Outcome {
  seed: number;
  where: string;
  rules: Rules;
  input: string;
  end: 'won' | 'fallen' | 'fled' | 'endless' | 'crash' | 'stuck-after-win';
  broken: string[];
  keys: number;
  error?: string;
}

/** Arms to hand out (DATA.OVL's items): melee, thrown, shot, the flask of oil, and the Glass Sword. */
const ARMS = [0x10, 0x11, 0x13, 0x14, 0x17, 0x18, 0x1a, 0x1c, 0x1e, 0x24, 0x25, 0x26, 0x27, 0x29, 0x12, 0x15, 0x16, 0x19];
const ARMOUR = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f];
const SHIELDS = [0x04, 0x05, 0x06, 0x07];

/** Pairs of combatants found on one square at the last check: a room's data sets some down together (1988 too). */
let together = new Set<string>();

/** What must always hold of a fight in progress; each break said once. */
function check(g: Game): string[] {
  const s = g.s;
  const out: string[] = [];
  if (s.mapId < 0x80) return out;
  const standing = new Map<string, number[]>();
  const now = new Set<string>();
  /** Shown or not: an invisible or submerged creature (its actor's anim 0) blocks nobody, in 1988 as here. */
  const shown = (i: number): string => (s.actors[g.combat[i].actor]?.anim ? '' : ' (unseen)');
  for (let i = 0; i < 0x20; i++) {
    const c = g.combat[i];
    const f = c.flags;
    if (f === 0) continue;
    const player = (f & CF.Player) !== 0;
    const dead = (f & CF.Dead) !== 0;
    if (player) {
      const m = s.members[c.who];
      if (!m) out.push(`combatant ${i} is member ${c.who}, beyond the party`);
      else {
        if (m.hp < 0 || m.hp > m.maxHp) out.push(`${m.name} has ${m.hp} of ${m.maxHp} hit points`);
        if (dead !== (m.status === Status.Dead))
          out.push(`${m.name}: fight says ${dead ? 'dead' : 'alive'}, status ${String.fromCharCode(m.status)}`);
      }
    }
    if (dead) continue;
    if (c.hp < 0) out.push(`combatant ${i} has ${c.hp} hit points`);
    const a = s.actors[c.actor];
    if (!a) {
      out.push(`combatant ${i} has no actor ${c.actor}`);
      continue;
    }
    if (a.tile === 0) out.push(`combatant ${i} (${player ? 'member' : 'kind ' + c.who}) stands with no tile`);
    else if (a.x !== c.x || a.y !== c.y) out.push(`combatant ${i}'s actor at (${a.x},${a.y}), it at (${c.x},${c.y})`);
    if (c.x > 10 || c.y > 10) out.push(`combatant ${i} off the field at (${c.x},${c.y})`);
    const key = `${c.x},${c.y}`;
    for (const j of standing.get(key) ?? []) {
      const pair = `${j}+${i}`;
      const what = (n: number): string => (g.combat[n].flags & CF.Player ? `member ${g.combat[n].who}` : `kind ${g.combat[n].who}`);
      if (!together.has(pair)) out.push(`${what(j)}${shown(j)} and ${what(i)}${shown(i)} came to stand together`);
      now.add(pair);
    }
    standing.set(key, [...(standing.get(key) ?? []), i]);
    // A member stands where a member can (a creature's ways are its own: water, the air, through walls).
    const under = c.x <= 10 && c.y <= 10 ? tileAt(g, c.x, c.y) : 0;
    if (player && a.tile !== 0 && under !== 0x4c && c.x <= 10 && c.y <= 10 && !canEnter(g, 0x1c, under))
      out.push(`a member stands on tile ${tileAt(g, c.x, c.y).toString(16)} at (${key})`);
    if ((f & CF.Charmed) !== 0 && !g.charmedBy.has(i)) out.push(`combatant ${i} charmed by nobody`);
  }
  for (const i of g.charmedBy.keys())
    if ((g.combat[i].flags & CF.Charmed) === 0 && (g.combat[i].flags & CF.Dead) === 0) out.push(`combatant ${i} in charmedBy, not charmed`);
  for (const i of g.possessedBy.keys()) if (!(g.combat[i].flags & CF.Player)) out.push(`possessedBy holds ${i}, no member`);
  if (g.spawnLeft < 0) out.push(`spawnLeft ${g.spawnLeft}`);
  together = now;
  return out;
}

/** The party set up at random: size, level, arms, the spells it has mixed; the rest of the roster away. */
function party(g: Game, r: () => number, pick: <T>(xs: readonly T[]) => T): void {
  const s = g.s;
  s.partySize = 1 + Math.floor(r() * 6);
  const level = 1 + Math.floor(r() * 8);
  for (let i = 0; i < s.partySize; i++) {
    const m = s.members[i];
    m.level = level;
    m.maxHp = level * 30;
    m.hp = m.maxHp;
    m.status = Status.Good;
    m.str = 12 + Math.floor(r() * 18);
    m.dex = 12 + Math.floor(r() * 18);
    m.int = 12 + Math.floor(r() * 18);
    m.equips.fill(0xff);
    m.equips[1] = pick(ARMOUR);
    m.equips[2] = pick(ARMS);
    if (r() < 0.4) m.equips[3] = r() < 0.5 ? pick(SHIELDS) : pick(ARMS);
    m.mp = restedMp(g, i);
  }
  for (const k of [...ARMS, ...SHIELDS]) s.equipment[k] = Math.floor(r() * 4);
  s.equipment[0x1b] = Math.floor(r() * 30); // arrows
  s.equipment[0x1d] = Math.floor(r() * 30); // quarrels
  s.equipment[0x13] = Math.floor(r() * 6); // flasks of oil
  s.keys = Math.floor(r() * 4);
  s.mixtures.fill(0);
  for (let sp = 0; sp < 0x30; sp++) if (r() < 0.3) s.mixtures[sp] = 1 + Math.floor(r() * 4);
  s.d5959 = 0;
}

/** Chests, gold and corpses strewn on the free squares of the field. */
function strew(g: Game, r: () => number): void {
  const s = g.s;
  const n = Math.floor(r() * 8);
  for (let k = 0; k < n; k++) {
    const x = Math.floor(r() * 11);
    const y = Math.floor(r() * 11);
    if (!canEnter(g, 0x1c, tileAt(g, x, y))) continue;
    if (g.combat.some((c) => c.flags !== 0 && !(c.flags & CF.Dead) && c.x === x && c.y === y)) continue;
    const slot = s.actors.findIndex((a, i) => i > 0 && a.tile === 0 && !g.combat.some((c) => c.flags !== 0 && c.actor === i));
    if (slot < 0) return;
    const tile = [0x01, 0x01, 0x02, 0x03, 0x1f, 0x1f, 0x0f][Math.floor(r() * 7)];
    Object.assign(s.actors[slot], { tile, anim: tile, x, y, z: 0, b5: tile === 0x01 ? Math.floor(r() * 0x10) : 3 });
  }
}

/** The way off the field for the member whose turn it is, once the fight is won: a step toward an edge. */
function leaveStep(g: Game): number {
  const s = g.s;
  const c = g.combat[s.combatTurn];
  const side = s.exitDir; // all by the same side, once one has gone
  const at = (key: number): [number, number] => (key === K.Up ? [0, -1] : key === K.Down ? [0, 1] : key === K.Left ? [-1, 0] : [1, 0]);
  const keys = side ? [side] : [K.Up, K.Right, K.Down, K.Left];
  const free = (x: number, y: number): boolean =>
    x < 0 ||
    y < 0 ||
    x > 10 ||
    y > 10 ||
    (canEnter(g, 0x1c, tileAt(g, x, y)) &&
      tileAt(g, x, y) !== 0xff &&
      !g.combat.some((o) => o !== c && o.flags !== 0 && !(o.flags & CF.Dead) && o.x === x && o.y === y));
  // Breadth-first to the nearest square past an edge on an allowed side.
  const start = c.y * 11 + c.x;
  const prev = new Map<number, [number, number]>([[start, [-1, 0]]]);
  const q = [start];
  while (q.length) {
    const cur = q.shift()!;
    const cx = cur % 11;
    const cy = Math.floor(cur / 11);
    for (const k of [K.Up, K.Right, K.Down, K.Left]) {
      const [dx, dy] = at(k);
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx > 10 || ny > 10) {
        if (!keys.includes(k)) continue;
        // The first step of the way to here.
        let n = cur;
        let first: number = k;
        while (prev.get(n)![0] !== -1) {
          first = prev.get(n)![1];
          n = prev.get(n)![0];
        }
        return first;
      }
      const n = ny * 11 + nx;
      if (prev.has(n) || !free(nx, ny)) continue;
      prev.set(n, [cur, k]);
      q.push(n);
    }
  }
  return K.Space;
}

/** The ways into a room cell (dungeon `d`, `level`, x, y) play can come by (enterRoom's d6602). */
function realWays(g: Game, d: number, level: number, x: number, y: number): number[] {
  const dat = g.data.files.get('DUNGEON.DAT');
  const cell = (l: number, cx: number, cy: number): number => dat[(d - 1) * 0x200 + l * 0x40 + (cy & 7) * 8 + (cx & 7)];
  const dx = g.data.swords(0x24d6, 4);
  const dy = g.data.swords(0x24de, 4);
  const ways: number[] = [];
  for (let dir = 0; dir < 4; dir++) {
    const from = cell(level, x - dx[dir], y - dy[dir]) & 0xf0;
    if (from !== 0xb0 && from !== 0xc0 && from !== 0xf0) ways.push(dir);
  }
  if (level < 7 && [0x10, 0x30].includes(cell(level + 1, x, y) & 0xf0)) ways.push(4);
  if (level > 0 && ([0x20, 0x30].includes(cell(level - 1, x, y) & 0xf0) || (cell(level - 1, x, y) & 0xf7) === 0x61)) ways.push(5);
  return ways;
}

/** Every room's door, of every dungeon. */
function allRooms(g: Game): { d: number; room: number; level: number }[] {
  const dat = g.data.files.get('DUNGEON.DAT');
  const out: { d: number; room: number; level: number }[] = [];
  for (let d = 1; d <= 8; d++)
    for (let room = 0; room < 16; room++)
      for (let level = 0; level < 8; level++) if (roomCell(dat, d, room, level)?.level === level) out.push({ d, room, level });
  return out;
}

async function one(seed: number): Promise<Outcome> {
  const r = rng(seed * 2654435761);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const { g, p } = newGame(seed);
  journeyOnward(g);
  const s = g.s;
  const rules = pick(RULES);
  const input = r() < 0.5 ? 'controller' : 'letters';
  Object.assign(g.options, { rules, input, autoCombat: false, autoAim: r() < 0.5 });
  party(g, r, pick);
  const room = ROOMS === 'only' || (ROOMS === 'mix' && r() < 0.4);
  const out: Outcome = { seed, where: '', rules, input, end: 'won', broken: [], keys: 0 };
  const broken = new Set<string>();
  const lastLog: string[] = [];
  together = new Set();
  let first = true;
  let strewn = false;
  let won = false;
  p.next = async () => {
    out.keys++;
    // The field as it is set down is taken as it is (the first check only learns who stands together).
    const found = check(g);
    if (!(first && s.mapId >= 0x80))
      for (const b of found) {
        if (!broken.has(b) && LOG) lastLog.push(`--- ${b}\n` + p.log.slice(-600).replace(/[^\n\x20-\x7e]/g, ''));
        broken.add(b);
      }
    if (s.mapId >= 0x80) first = false;
    if (s.mapId < 0x80) {
      // Out of the fight: a room left (the dungeon's own prompt), or the field left outdoors.
      if (room && (g.commandPrompt === 'dungeon' || g.inDungeon)) throw new Done();
      return K.Space;
    }
    if (s.partySize > 0 && [...Array(s.partySize).keys()].every((i) => s.members[i].status === Status.Dead)) {
      out.end = 'fallen';
      throw new Done();
    }
    if (out.keys > MOST_KEYS) {
      out.end = won ? 'stuck-after-win' : 'endless';
      throw new Done();
    }
    if (!strewn && g.commandPrompt === 'combat') {
      strew(g, r);
      strewn = true;
    }
    if (s.battleWon) {
      won = true;
      if (g.menuShown) return input === 'controller' ? Pad.B : K.Escape;
      if (s.crosshair) return K.Escape;
      // Outdoors the field is left by Escape; a room by walking off it, every member by the same side.
      if (!(s.combatFlags & 0x80)) {
        g.options.input = 'letters'; // Escape leaves the field won (a controller's Escape is the Pause menu)
        return K.Escape;
      }
      const c = g.combat[s.combatTurn];
      if (c && c.flags & CF.Player) return leaveStep(g);
      return K.Space;
    }
    // In a menu or prompt: mostly the first choice or a random one, now and then backed out of.
    if (g.menuShown) {
      const x = r();
      if (x < 0.15) return input === 'controller' ? Pad.B : K.Escape;
      if (x < 0.55) return input === 'controller' ? Pad.A : K.Enter;
      return pick([K.Up, K.Down, K.Left, K.Right, Pad.A, K.Enter]);
    }
    if (s.crosshair) return pick([K.Up, K.Down, K.Left, K.Right, K.Enter, K.Enter, K.Escape]);
    // Inside a command's own question (Ready's "Item:", a direction, a member): answered at random, or backed out of.
    if (g.commandPrompt !== 'combat') {
      const y = r();
      if (y < 0.35) return K.Escape;
      if (y < 0.6) return pick([K.Up, K.Down, K.Left, K.Right]);
      return pick([K.Space, K.Enter, 0x31 + Math.floor(r() * 6), 0x41 + Math.floor(r() * 26)]);
    }
    const x = r();
    if (x < 0.6) {
      const k = await autoKey(g);
      g.options.autoCombat = false;
      if (k) return k;
    }
    if (x < 0.8) return pick([K.Up, K.Down, K.Left, K.Right]);
    if (x < 0.93) return pick(['A', 'W', 'P', 'K', 'O', 'G', 'S', 'C', 'R', 'U'].map((c) => c.charCodeAt(0)));
    return pick([K.Space, Pad.A, Pad.B, K.Enter, 0x31 + Math.floor(r() * 6), 0x4e, 0x59]);
  };
  try {
    if (room) {
      const rooms = allRooms(g);
      const at = pick(rooms);
      out.where = `room ${at.d}:${at.room}:${at.level}`;
      stashWorldActors(g);
      startRoom(g, g.data.files.get('DUNGEON.DAT'), at.d, at.room, at.level);
      // Entered by a way the dungeon really has: from a corridor beside (not rock, not rubble, not the room itself),
      // down a ladder or pit from above, up a ladder from below - not the dev start's guess.
      const ways = realWays(g, at.d, at.level, s.x, s.y);
      if (!ways.length) return { ...out, end: 'won', where: out.where + ' (no way in)' };
      s.d6602 = pick(ways);
      out.where += ` way ${s.d6602}`;
      await runGame(g, true);
    } else {
      const names = g.data.table(0x18b6, 0x30);
      // A creature of the world (not a field, not the Shadow Lord, who is fought only where he is summoned)
      const kinds = [...Array(0x30).keys()].filter(
        (k) => k >= 0x10 && k !== 0x2f && names[k] && names[k] !== 'x' && ((0x40 + k * 4) & 0xf0) !== 0xe0,
      );
      const kind = pick(kinds);
      const arena = Math.floor(r() * 9); // the land arenas (BRIT.CBT 0-8)
      out.where = `arena ${arena} vs ${names[kind]}`;
      Object.assign(s, { mapId: 0, level: 0, x: 86, y: 110 });
      const foe = freeActor(g);
      Object.assign(s.actors[foe], { tile: 0x40 + kind * 4, anim: 0x40 + kind * 4, x: 86, y: 109, z: 0, b5: 0 });
      await arenaFight(g, arena, foe);
      if (out.end === 'won' && !won) out.end = 'fled';
    }
  } catch (e) {
    if (!(e instanceof Done)) {
      const msg = (e as Error).message ?? String(e);
      if (msg.includes('script ran out')) out.end = 'endless';
      else {
        out.end = 'crash';
        out.error = ((e as Error).stack ?? msg).split('\n').slice(0, 6).join('\n');
      }
    }
  }
  out.broken = [...broken];
  // A fight that never ended, or could not be left: the field as it stands - its squares, who is where.
  if (LOG && (out.end === 'endless' || out.end === 'stuck-after-win') && s.mapId >= 0x80) {
    const rows: string[] = [];
    for (let y = 0; y < 11; y++)
      rows.push(
        [...Array(11).keys()]
          .map((x) => {
            const i = g.combat.findIndex((c) => c.flags !== 0 && !(c.flags & CF.Dead) && c.x === x && c.y === y);
            if (i >= 0) return (g.combat[i].flags & CF.Player ? 'P' : 'M') + (i % 10);
            return tileAt(g, x, y).toString(16).padStart(2, '0');
          })
          .join(' '),
      );
    const foes = g.combat.flatMap((c, i) =>
      c.flags & CF.Monster && !(c.flags & CF.Dead) ? [`M${i % 10}=kind ${c.who} hp ${c.hp} flags ${c.flags.toString(16)}`] : [],
    );
    console.log(`--- field\n${rows.join('\n')}\n${foes.join(', ')}`);
  }
  if (LOG) for (const l of lastLog.slice(0, 3)) console.log(l);
  if (LOG && out.end !== 'won' && out.end !== 'fled' && out.end !== 'fallen')
    console.log(`--- ${out.end}\n` + p.log.slice(-1200).replace(/[^\n\x20-\x7e]/g, ''));
  return out;
}

const tally: Record<string, number> = {};
const bad: Outcome[] = [];
for (let k = 0; k < FIGHTS; k++) {
  const o = await one(FIRST + k);
  const key = `${o.rules} ${o.end}`;
  tally[key] = (tally[key] ?? 0) + 1;
  if (o.end === 'crash' || o.end === 'endless' || o.end === 'stuck-after-win' || o.broken.length) bad.push(o);
}
console.log(JSON.stringify({ fights: FIGHTS, tally }, null, 1));
for (const o of bad) console.log(JSON.stringify(o));
