import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { besideParty, moveNpcs, passAside, scheduleSlot, stepAside } from '../src/game/npc.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { T } from '../src/game/tiles.ts';
import { setTileAt, tileAt } from '../src/game/world.ts';
import type { Game } from '../src/game/game.ts';
import { newGame } from './helpers.ts';

/**
 * Issue #40: a townsperson in the way, waited out with Pass. One who is friendly and wanders (at their place, kind 1 -
 * near it - or 2 - anywhere), standing beside the party (one of the four squares a step reaches) at two Passes in a
 * row, steps aside: one step, as their own wandering takes, to a square that is not beside the party - one in their
 * wandering's reach where there is one, else one just beyond it (they walk back of their own accord) - and nowhere
 * where there is none. Nobody else moves for it: not one posted, asleep, walking somewhere, following or keeping away,
 * hostile or afraid, nor a creature, a horse, a daemon or a Shadowlord.
 */

const FLOOR = 0x44;
const WALL = 0x4f;
const PERSON = 0x50; // a townsperson's tile

/** The start town (map 13), the party at (15, 15), every other actor and NPC gone: `who` (NPC 1), a person, set by `at`. */
async function scene(seed = 1234) {
  const { g, p } = newGame(seed);
  journeyOnward(g);
  await enterTown(g, true);
  const s = g.s;
  // A room of floor round the party, walled at its edges (x and y 10 to 20).
  for (let y = 10; y <= 20; y++)
    for (let x = 10; x <= 20; x++) setTileAt(g, x, y, x === 10 || x === 20 || y === 10 || y === 20 ? WALL : FLOOR);
  for (let i = 1; i < 0x20; i++) {
    if (s.npcs[i].actor) s.actors[s.npcs[i].actor].tile = s.actors[s.npcs[i].actor].anim = 0;
    s.npcs[i].actor = 0;
    s.npcTypes[i] = 0;
  }
  for (let a = 1; a < 0x20; a++) s.actors[a].tile = s.actors[a].anim = 0;
  Object.assign(s.actors[0], { x: s.x, y: s.y, z: s.level });
  const who = 1;
  /** NPC 1 put at (x, y), its place for every hour at (px, py), of `kind` in all three slots. */
  const at = (x: number, y: number, kind = 2, px = x, py = y, tile = PERSON) => {
    s.npcTypes[who] = tile;
    const sch = s.schedules[who];
    for (let k = 0; k < 3; k++) {
      sch.setType(k, kind);
      sch.setPlace(k, px, py, s.level);
    }
    s.npcs[who].f0 = 1;
    s.npcs[who].fe = scheduleSlot(g, who, s.hour);
    placeAt(g, who, x, y);
  };
  return { g, p, s, who, at };
}

/** NPC `i` at (x, y) on the party's level, with an actor of its own. */
function placeAt(g: Game, i: number, x: number, y: number): void {
  const s = g.s;
  const me = s.npcs[i];
  if (!me.actor) {
    me.actor = s.actors.findIndex((a, k) => k > 0 && a.tile === 0);
    s.actors[me.actor].tile = s.actors[me.actor].anim = s.npcTypes[i];
  }
  Object.assign(s.actors[me.actor], { x, y, z: s.level });
  Object.assign(me, { x, y, z: s.level });
}

const where = (g: Game, i: number) => [g.s.npcs[i].x, g.s.npcs[i].y];
const apart = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

describe('who stands beside the party, to step aside', () => {
  it('is a friendly wanderer in one of the four squares a step reaches', async () => {
    const { g, s, who, at } = await scene();
    for (const kind of [1, 2]) {
      at(s.x + 1, s.y, kind);
      expect(besideParty(g), `kind ${kind}`).toEqual([who]);
    }
    at(s.x, s.y - 1);
    expect(besideParty(g)).toEqual([who]);
  });

  it('is nobody diagonal to the party, or further off', async () => {
    const { g, s, at } = await scene();
    at(s.x + 1, s.y + 1);
    expect(besideParty(g)).toEqual([]);
    at(s.x + 2, s.y);
    expect(besideParty(g)).toEqual([]);
  });

  it('is nobody posted (0), keeping away (3), coming to the party (4, 5) or hostile (6, 7)', async () => {
    const { g, s, at } = await scene();
    for (const kind of [0, 3, 4, 5, 6, 7]) {
      at(s.x + 1, s.y, kind);
      expect(besideParty(g), `kind ${kind}`).toEqual([]);
    }
  });

  it('is no creature, horse, daemon or Shadowlord, though it wander', async () => {
    const { g, s, at } = await scene();
    for (const tile of [0x90, 0x11, 0xd8, 0xfc, 0x1e]) {
      at(s.x + 1, s.y, 2, s.x + 1, s.y, tile);
      expect(besideParty(g), `tile ${tile.toString(16)}`).toEqual([]);
    }
    for (const tile of [0x40, 0x48, 0x50, 0x54, 0x68, 0x70, 0x78]) {
      at(s.x + 1, s.y, 2, s.x + 1, s.y, tile);
      expect(besideParty(g), `tile ${tile.toString(16)}`).toEqual([1]);
    }
  });

  it('is nobody walking somewhere (to their place, to a ladder) or changing level', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    for (const f0 of [2, 3, 4, 5, 6, 7, 8]) {
      s.npcs[who].f0 = f0;
      expect(besideParty(g), `mode ${f0}`).toEqual([]);
    }
  });

  it('is nobody on another level', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    s.npcs[who].z = (s.level + 1) & 0xff;
    expect(besideParty(g)).toEqual([]);
  });
});

describe('a step aside', () => {
  it('is one step, onto floor, to a square not beside the party, its figure going with it', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { g, s, who, at } = await scene(seed);
      at(s.x + 1, s.y);
      expect(stepAside(g, who)).toBe(true);
      const [x, y] = where(g, who);
      expect(apart(x, y, s.x + 1, s.y), `seed ${seed}`).toBe(1);
      expect(apart(x, y, s.x, s.y), `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(tileAt(g, x, y)).toBe(FLOOR);
      const a = s.actors[s.npcs[who].actor];
      expect([a.x, a.y]).toEqual([x, y]);
    }
  });

  it('takes each way open to it, by chance, never the party’s square', async () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { g, s, who, at } = await scene(seed);
      at(s.x + 1, s.y);
      stepAside(g, who);
      seen.add(where(g, who).join(','));
    }
    const { s } = await scene();
    expect([...seen].sort()).toEqual([`${s.x + 1},${s.y - 1}`, `${s.x + 1},${s.y + 1}`, `${s.x + 2},${s.y}`].sort());
  });

  it('is not taken where the party has them boxed in: they stay, and nothing else changes', async () => {
    const { g, s, who, at } = await scene();
    // An alcove: walls on three sides, the party on the fourth.
    for (const [x, y] of [
      [s.x + 2, s.y],
      [s.x + 1, s.y - 1],
      [s.x + 1, s.y + 1],
    ])
      setTileAt(g, x, y, WALL);
    at(s.x + 1, s.y);
    expect(stepAside(g, who)).toBe(false);
    expect(where(g, who)).toEqual([s.x + 1, s.y]);
  });

  it('is not taken onto another person or a horse', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    // Others on two of the three ways; a wall on the third.
    s.npcTypes[2] = PERSON;
    s.npcs[2].f0 = 1;
    placeAt(g, 2, s.x + 1, s.y - 1);
    const horse = s.actors.findIndex((a, k) => k > 0 && a.tile === 0);
    Object.assign(s.actors[horse], { tile: 0x11, anim: 0x11, x: s.x + 1, y: s.y + 1, z: s.level });
    setTileAt(g, s.x + 2, s.y, WALL);
    expect(stepAside(g, who)).toBe(false);
    expect(where(g, who)).toEqual([s.x + 1, s.y]);
  });

  it('is not taken onto a square still beside the party, nor through a wall', async () => {
    const { g, s, who, at } = await scene();
    at(s.x, s.y - 1); // above the party
    setTileAt(g, s.x, s.y - 2, WALL);
    setTileAt(g, s.x - 1, s.y - 1, WALL);
    for (let seed = 0; seed < 20; seed++) {
      at(s.x, s.y - 1);
      expect(stepAside(g, who)).toBe(true);
      expect(where(g, who)).toEqual([s.x + 1, s.y - 1]); // the one way open
    }
  });

  it('keeps within a near wanderer’s reach of its place where it can', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { g, s, who, at } = await scene(seed);
      // Its place three squares above the party's right: the step up stays in reach, the others go out of it.
      at(s.x + 1, s.y, 1, s.x + 1, s.y - 3);
      expect(stepAside(g, who)).toBe(true);
      expect(where(g, who), `seed ${seed}`).toEqual([s.x + 1, s.y - 1]);
    }
  });

  it('goes just beyond a near wanderer’s reach where nothing in it is open, and wanders back of its own accord', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y, 1, s.x - 2, s.y); // its place on the far side of the party
    setTileAt(g, s.x + 1, s.y - 1, WALL);
    setTileAt(g, s.x + 1, s.y + 1, WALL);
    expect(stepAside(g, who)).toBe(true);
    expect(where(g, who)).toEqual([s.x + 2, s.y]); // four from its place: one beyond its reach of three
    // Its own wandering never takes it further out; in time it comes back within reach.
    const place = [s.x - 2, s.y];
    let back = false;
    for (let turn = 0; turn < 400 && !back; turn++) {
      const before = apart(...(where(g, who) as [number, number]), place[0], place[1]);
      moveNpcs(g, s.hour);
      const after = apart(...(where(g, who) as [number, number]), place[0], place[1]);
      expect(after).toBeLessThanOrEqual(Math.max(before, 3));
      back = after <= 3;
    }
    expect(back).toBe(true);
  });

  it('goes anywhere open for a wanderer at large (kind 2), however far from its place', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y, 2, 0, 0);
    expect(stepAside(g, who)).toBe(true);
    expect(apart(...(where(g, who) as [number, number]), s.x, s.y)).toBe(2);
  });
});

describe('two Passes in a row', () => {
  it('steps aside one beside the party at both, on the second; the first moves nobody', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    expect([...passAside(g, true)]).toEqual([]);
    expect(where(g, who)).toEqual([s.x + 1, s.y]);
    expect([...passAside(g, true)]).toEqual([who]);
    expect(apart(...(where(g, who) as [number, number]), s.x, s.y)).toBe(2);
  });

  it('starts over at anything else between the two', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    passAside(g, true);
    passAside(g, false);
    expect([...passAside(g, true)]).toEqual([]);
    expect(where(g, who)).toEqual([s.x + 1, s.y]);
  });

  it('moves nobody who came beside the party only at the second', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 3, s.y);
    passAside(g, true);
    at(s.x + 1, s.y);
    expect([...passAside(g, true)]).toEqual([]);
    expect([...passAside(g, true)]).toEqual([who]); // a third: beside at the second and the third
  });

  it('tries again at the next Pass one boxed in at the last', async () => {
    const { g, s, who, at } = await scene();
    setTileAt(g, s.x + 2, s.y, WALL);
    setTileAt(g, s.x + 1, s.y - 1, WALL);
    setTileAt(g, s.x + 1, s.y + 1, WALL);
    at(s.x + 1, s.y);
    passAside(g, true);
    expect([...passAside(g, true)]).toEqual([]);
    setTileAt(g, s.x + 2, s.y, FLOOR); // the way opens
    expect([...passAside(g, true)]).toEqual([who]);
    expect(where(g, who)).toEqual([s.x + 2, s.y]);
  });
});

describe('the turn one steps aside', () => {
  it('is its move for the turn: its own wandering does not also take it, nor bring it back', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { g, s, who, at } = await scene(seed);
      at(s.x + 1, s.y);
      passAside(g, true);
      const moved = passAside(g, true);
      const stepped = where(g, who);
      moveNpcs(g, s.hour, moved);
      expect(where(g, who), `seed ${seed}`).toEqual(stepped);
    }
  });

  it('keeps to its schedule all the same: an hour that sends it elsewhere sends it', async () => {
    const { g, s, who, at } = await scene();
    at(s.x + 1, s.y);
    const sch = s.schedules[who];
    // A new place at the next hour, elsewhere in the room.
    const slot = scheduleSlot(g, who, s.hour);
    const next = (slot + 1) % 3;
    const hour = (s.hour + 1) % 24;
    for (let k = 0; k < 4; k++) sch.setTime(k, k === next ? hour : (s.hour + 12) % 24);
    sch.setPlace(next, 12, 12, s.level);
    const moved = new Set([who]);
    moveNpcs(g, hour, moved);
    expect(s.npcs[who].f0).toBe(2); // on its way there
  });
});

describe('in the town, with the Pass key', () => {
  it('steps aside, at the second Pass, one beside the party at both - the party unmoved', async () => {
    let tried = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { g, p, s, who, at } = await scene(seed);
      at(s.x + 1, s.y);
      // Where it stands as each Pass is taken (before the people move).
      const at0: number[][] = [];
      const say = g.say.bind(g);
      g.say = (n: number) => {
        if (n === 0xa134) at0.push(where(g, who)); // "Pass"
        return say(n);
      };
      p.keys.push(K.Space, K.Space);
      const [x0, y0] = [s.x, s.y];
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      expect([s.x, s.y]).toEqual([x0, y0]);
      expect(at0).toHaveLength(2);
      const beside = at0.map(([x, y]) => apart(x, y, s.x, s.y) === 1);
      if (beside[0] && beside[1]) {
        tried++;
        expect(apart(...(where(g, who) as [number, number]), s.x, s.y), `seed ${seed}`).toBe(2);
      }
    }
    expect(tried).toBeGreaterThan(5);
  });
});

/**
 * Every settlement in the game, every friendly wanderer in it on the party's level, the party put on each square
 * beside them that it could stand on: a step aside is one step, onto a square they could step to by their own
 * wandering's rules, not beside the party, onto nobody - or none at all only where there was no such square.
 */
describe('in every settlement', () => {
  it('is always one lawful step, or none only where none is open', async () => {
    const { g } = newGame();
    journeyOnward(g);
    const s = g.s;
    // Where a person may step, read here from the game's own tables as NPC_0b9e reads them: its walk table (D_367e),
    // tile 0x30 always, a chair never (but on the way to a place), and the person's own place always.
    const walk = g.data.bytes(0x367e, 0x20);
    const walkable = (x: number, y: number, i = -1): boolean => {
      if (x < 0 || y < 0 || x > 0x1f || y > 0x1f) return false;
      const sch = s.schedules[i];
      const slot = i > 0 ? scheduleSlot(g, i, s.hour) : -1;
      if (i > 0 && sch.x(slot) === x && sch.y(slot) === y && sch.z(slot) === s.level) return true;
      const here = tileAt(g, x, y) & 0xfc;
      if (here === T.T30) return true;
      if (here === T.Chair90) return false;
      const t = g.map[y * 32 + x];
      return (walk[t >> 3] & (0x80 >> (t & 7))) === 0;
    };
    const someone = (x: number, y: number): boolean =>
      s.actors.some((a, k) => k > 0 && a.tile !== 0 && a.x === x && a.y === y && a.z === s.level);
    let checked = 0;
    let stepped = 0;
    let boxed = 0;
    for (let map = 1; map <= 0x20; map++) {
      s.mapId = map;
      s.level = 0;
      await enterTown(g, true);
      for (let i = 1; i < 0x20; i++) {
        const me = s.npcs[i];
        if (!me.actor || me.z !== s.level) continue;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const [px, py] = [me.x + dx, me.y + dy];
          if (!walkable(px, py) || someone(px, py)) continue;
          Object.assign(s, { x: px, y: py });
          Object.assign(s.actors[0], { x: px, y: py, z: s.level });
          const eligible = besideParty(g).includes(i);
          const [x0, y0] = [me.x, me.y];
          const open = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]
            .map(([ex, ey]) => [x0 + ex, y0 + ey])
            .filter(([x, y]) => apart(x, y, px, py) >= 2 && walkable(x, y, i) && !someone(x, y));
          const did = eligible && stepAside(g, i);
          checked++;
          if (!eligible) {
            expect([me.x, me.y]).toEqual([x0, y0]);
            continue;
          }
          if (did) {
            stepped++;
            expect(apart(me.x, me.y, x0, y0)).toBe(1);
            expect(apart(me.x, me.y, px, py)).toBeGreaterThanOrEqual(2);
            expect(open.map((o) => o.join(','))).toContain(`${me.x},${me.y}`);
            const a = s.actors[me.actor];
            expect([a.x, a.y]).toEqual([me.x, me.y]);
            placeAt(g, i, x0, y0); // back, for the next square
          } else {
            boxed++;
            expect([me.x, me.y]).toEqual([x0, y0]);
            expect(open, `map ${map}, NPC ${i}, the party at ${px},${py}`).toEqual([]);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(stepped).toBeGreaterThan(50);
    expect(boxed).toBeGreaterThan(0);
  });
});

describe('Pass after Pass in a real town, its own people about', () => {
  it('moves anyone a step only onto a square of their own, never the party’s, over many turns', async () => {
    let besideTwice = 0;
    let total = 0;
    for (const [map, seed] of [
      [13, 1],
      [1, 2],
      [2, 3],
      [5, 4],
      [7, 5],
      [17, 6],
      [3, 7],
      [9, 8],
    ] as const) {
      const { g, p } = newGame(seed);
      journeyOnward(g);
      const s = g.s;
      s.mapId = map;
      s.level = 0;
      await enterTown(g, true);
      s.activeMember = 0;
      let passes = 0;
      let last = new Map<number, [number, number]>();
      let wasBeside: number[] = [];
      const say = g.say.bind(g);
      g.say = (n: number) => {
        if (n === 0xa134) {
          // "Pass": where everyone stands as it is taken, the people having moved since the last.
          passes++;
          const now = new Map<number, [number, number]>();
          for (let i = 1; i < 0x20; i++) {
            const me = s.npcs[i];
            if (s.npcTypes[i] !== 0 && me.actor !== 0 && me.z === s.level) now.set(i, [me.x, me.y]);
          }
          for (const [i, [x, y]] of now) {
            const was = last.get(i);
            if (!was || apart(x, y, was[0], was[1]) !== 1) continue; // stood still, or came by a ladder or the hour
            const others = [...now].filter(([j, [ox, oy]]) => j !== i && ox === x && oy === y);
            expect(others, `map ${map}, pass ${passes}, NPC ${i} at ${x},${y}`).toEqual([]);
            expect([x, y], `map ${map}, pass ${passes}, NPC ${i}`).not.toEqual([s.x, s.y]);
          }
          const beside = besideParty(g);
          if (beside.some((i) => wasBeside.includes(i))) besideTwice++;
          wasBeside = beside;
          last = now;
        }
        return say(n);
      };
      p.keys.push(...Array<number>(150).fill(K.Space));
      await townLoop(g).catch((e: Error) => {
        if (!e.message.includes('ran out')) throw e;
      });
      // (A town's own may end the run early: one who comes up to talk takes the keys left.)
      total += passes;
    }
    expect(total).toBeGreaterThan(400);
    expect(besideTwice).toBeGreaterThan(0); // someone was beside the party at two Passes in a row, and stepped aside
  });
});
