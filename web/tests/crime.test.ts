import { describe, expect, it } from 'vitest';
import { freeActor } from '../src/game/actors.ts';
import type { Game } from '../src/game/game.ts';
import { K } from '../src/game/io.ts';
import { moveNpcs, placeNpcs, putNpc, scheduleSlot } from '../src/game/npc.ts';
import { journeyOnward } from '../src/game/run.ts';
import { T } from '../src/game/tiles.ts';
import { attackInTown, callGuards, enterTown, npcKilled, setNpcKilled, townLoop } from '../src/game/town.ts';
import { setTileAt } from '../src/game/world.ts';
import { fighter, keys, newGame } from './helpers.ts';
import type { FakePlatform } from './helpers.ts';
import { Landed } from './pilot.ts';

const BRITAIN = 2;
const GUARDS = [9, 10, 11, 12];
const TOWNSFOLK = [1, 2, 3, 4, 5, 8, 13, 14];

/** Britain at noon, the party in the square by the green. */
async function britain(hour = 12): Promise<{ g: Game; p: FakePlatform }> {
  const { g, p } = newGame();
  journeyOnward(g);
  Object.assign(g.s, { mapId: BRITAIN, level: 0, hour });
  await enterTown(g, true);
  return { g, p };
}

async function play(g: Game): Promise<void> {
  await townLoop(g).catch((e: Error) => {
    if (!e.message.includes('ran out') && !(e instanceof Landed)) throw e;
  });
}

/** Put NPC `i` on the square east of the party and say so to the world. */
function besideParty(g: Game, i: number): void {
  const s = g.s;
  Object.assign(s, { x: 9, y: 8 });
  putNpc(g, i, s.x + 1, s.y, 0);
}

/** Back in the town afresh, the one the party killed is not there to meet. */
async function goneOnReturn(g: Game, npc: number): Promise<void> {
  expect(g.s.npcTypes[npc]).toBe(0);
  await enterTown(g, true);
  expect(g.s.npcTypes[npc]).toBe(0);
  expect(g.s.npcs[npc].f0).toBe(0);
}

const hostile = (g: Game, i: number): boolean => [0, 1, 2].every((k) => g.s.schedules[i].type(k) === 7);

/** The walk table's own word on whether a creature may stand on a square (D_367e, as npc.ts reads it). */
function walkable(g: Game, x: number, y: number): boolean {
  const tile = g.map[y * 32 + x];
  return (g.data.bytes(0x367e, 0x20)[tile >> 3] & (0x80 >> (tile & 7))) === 0;
}

/**
 * Crime in a settlement (town.ts): the alarm, what a blow at a townsperson costs, the guard's arrest, and the
 * people's own turns (npc.ts) - a walk to the next place of their schedule, a guard's pursuit.
 */
describe('crime and the people of a town', () => {
  it('turns every guard hostile at all hours when the alarm is raised', async () => {
    const { g } = await britain();
    const s = g.s;
    for (const i of GUARDS) expect(hostile(g, i)).toBe(false);
    callGuards(g);
    for (const i of GUARDS) {
      expect(hostile(g, i)).toBe(true);
      for (let k = 0; k < 4; k++) expect(s.schedules[i].time(k)).toBe(0);
    }
  });

  it('sends the townsfolk running (kind 3, and wordless) while the guards stay hostile', async () => {
    const { g } = await britain();
    const s = g.s;
    for (let n = 0; n < 30; n++) callGuards(g);
    for (const i of TOWNSFOLK) {
      expect(s.npcs[i].fa).toBe(0xfd);
      for (let k = 0; k < 3; k++) expect(s.schedules[i].type(k)).toBe(3);
    }
    for (const i of GUARDS) expect(hostile(g, i)).toBe(true);
  });

  it('costs 5 karma and calls the guards to strike a townsperson, and remembers the dead', async () => {
    const { g, p } = await britain();
    const s = g.s;
    const karma = s.karma;
    besideParty(g, 13);
    p.keys.push(...keys(K.Right));
    p.next = fighter(g);
    await attackInTown(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(s.karma).toBe(karma - 5);
    for (const i of GUARDS) expect(hostile(g, i)).toBe(true);
    expect(s.npcTypes[13]).toBe(0);
    await goneOnReturn(g, 13);
  });

  it('counts a townsperson cut down in bed as murder: 5 more karma, and gone for good', async () => {
    const { g, p } = await britain();
    const s = g.s;
    const karma = s.karma;
    besideParty(g, 13);
    setTileAt(g, s.x + 1, s.y, T.Bed);
    p.keys.push(...keys(K.Right));
    await attackInTown(g);
    expect(p.log).toContain('Murdered!');
    expect(s.karma).toBe(karma - 10);
    expect(s.npcTypes[13]).toBe(0);
    for (const i of GUARDS) expect(hostile(g, i)).toBe(true);
    await goneOnReturn(g, 13);
  });

  it('lets karma fall no lower than nothing', async () => {
    const { g, p } = await britain();
    const s = g.s;
    s.karma = 3;
    besideParty(g, 13);
    setTileAt(g, s.x + 1, s.y, T.Bed);
    p.keys.push(...keys(K.Right));
    await attackInTown(g);
    expect(s.karma).toBe(0);
  });

  it('calls the guards, but costs no karma, to strike a daemon', async () => {
    const { g, p } = await britain();
    const s = g.s;
    const karma = s.karma;
    Object.assign(s, { x: 9, y: 8 });
    const slot = freeActor(g);
    Object.assign(s.actors[slot], { tile: 0xd8, anim: 0xd8, x: s.x + 1, y: s.y, z: 0 });
    p.keys.push(...keys(K.Right));
    await attackInTown(g);
    expect(s.karma).toBe(karma);
    for (const i of GUARDS) expect(hostile(g, i)).toBe(true);
  });

  it('calls no one and costs nothing to strike a creature of the wild', async () => {
    const { g, p } = await britain();
    const s = g.s;
    const karma = s.karma;
    Object.assign(s, { x: 9, y: 8 });
    const slot = freeActor(g);
    Object.assign(s.actors[slot], { tile: 0xa0, anim: 0xa0, x: s.x + 1, y: s.y, z: 0 });
    p.keys.push(...keys(K.Right));
    await attackInTown(g);
    expect(s.karma).toBe(karma);
    for (const i of GUARDS) expect(hostile(g, i)).toBe(false);
  });

  it('does not remember a slain guard as it does a townsperson', async () => {
    const { g } = await britain();
    const s = g.s;
    setNpcKilled(g, 9);
    expect(npcKilled(g, 9)).toBe(false);
    setNpcKilled(g, 13);
    expect(npcKilled(g, 13)).toBe(true);
    // Coming into the town afresh, the dead townsperson is not there and the guard is.
    s.npcTypes.fill(0);
    await enterTown(g, true);
    expect(s.npcTypes[13]).toBe(0);
    expect(s.npcTypes[9]).toBe(0x70);
  });

  it("arrests the party at a hostile guard's hand: wake in the Yew jail at eight, the keys gone", async () => {
    const { g, p } = await britain();
    const s = g.s;
    callGuards(g);
    besideParty(g, 9);
    s.keys = 3;
    p.keys.push(...keys(' ', 'Y'));
    await play(g);
    expect(p.log.replace(/\s+/g, ' ')).toContain('under arrest');
    expect(p.log.replace(/\s+/g, ' ')).toContain('strikes thee unconscious');
    expect(s.mapId).toBe(4);
    expect(s.hour).toBe(8);
    expect(s.keys).toBe(0);
    expect(s.level).toBe(0);
  });

  it('turns to a fight when the party will not come quietly', async () => {
    const { g, p } = await britain();
    const s = g.s;
    // One guard is on to the party; the others know nothing until it will not come quietly.
    for (let k = 0; k < 3; k++) s.schedules[9].setType(k, 7);
    for (let k = 0; k < 4; k++) s.schedules[9].setTime(k, 0);
    besideParty(g, 9);
    p.keys.push(...keys(' ', 'N'));
    // The fight itself is another matter (combat.test.ts): the pilot lands where it begins.
    p.next = () => {
      throw new Landed();
    };
    await play(g);
    const said = p.log.replace(/\s+/g, ' ');
    expect(said).toContain('defend thyself');
    expect(said).toContain('Attacked!');
    expect(s.hour).toBe(12); // not carried off to the jail
    for (const i of [10, 11, 12]) expect(hostile(g, i)).toBe(true);
  });
});

describe('the people of a town', () => {
  it('keeps the place of the schedule whose hour came last', async () => {
    const { g } = await britain();
    const sch = g.s.schedules[4];
    expect([12, 18, 19].map((h) => scheduleSlot(g, 4, h))).toEqual([1, 2, 1]);
    expect(sch.x(1)).toBe(8);
    expect(sch.y(2)).toBe(5);
  });

  it('puts everyone at the place their schedule gives for the hour', async () => {
    const { g } = await britain();
    const s = g.s;
    for (const hour of [3, 12, 22]) {
      placeNpcs(g, hour);
      for (let i = 1; i < 32; i++) {
        if (s.npcTypes[i] === 0) continue;
        const slot = scheduleSlot(g, i, hour);
        expect([s.npcs[i].x, s.npcs[i].y, s.npcs[i].z]).toEqual([s.schedules[i].x(slot), s.schedules[i].y(slot), s.schedules[i].z(slot)]);
      }
    }
  });

  it('walks to the next place on the schedule, a square at a time, over ground it can stand on', async () => {
    const { g } = await britain();
    const s = g.s;
    // The baker's boy keeps one place at noon and another from six in the evening.
    const npc = 4;
    const me = s.npcs[npc];
    const goal = { x: s.schedules[npc].x(2), y: s.schedules[npc].y(2) };
    Object.assign(s, { x: 29, y: 28 });
    s.actors[0].x = s.x;
    s.actors[0].y = s.y;
    expect([me.x, me.y]).not.toEqual([goal.x, goal.y]);
    let turns = 0;
    let there = false;
    for (; turns < 300 && !there; turns++) {
      const [x, y] = [me.x, me.y];
      moveNpcs(g, 18);
      expect(Math.abs(me.x - x) + Math.abs(me.y - y)).toBeLessThanOrEqual(1);
      expect(walkable(g, me.x, me.y)).toBe(true);
      expect(s.actors[me.actor].x).toBe(me.x);
      expect(s.actors[me.actor].y).toBe(me.y);
      there = me.x === goal.x && me.y === goal.y && me.f0 === 1;
    }
    expect(there).toBe(true);
    expect(me.fe).toBe(2);
    // It was more than a step away: the walk was made.
    expect(turns).toBeGreaterThan(3);
  });

  it('never moves anyone into a wall or on to another person, wandering for a long while', async () => {
    const { g } = await britain();
    const s = g.s;
    Object.assign(s, { x: 29, y: 28 });
    s.actors[0].x = s.x;
    s.actors[0].y = s.y;
    const here = (): Map<number, number> => {
      const at = new Map<number, number>();
      for (let i = 1; i < 32; i++) {
        const me = s.npcs[i];
        if (s.npcTypes[i] !== 0 && me.actor !== 0 && me.z === 0) at.set(i, me.y * 32 + me.x);
      }
      return at;
    };
    let moved = 0;
    for (let turn = 0; turn < 400; turn++) {
      const before = here();
      moveNpcs(g, 12);
      const after = here();
      for (const [i, at] of after) {
        if (before.get(i) === at) continue;
        moved++;
        const [x, y] = [at & 31, at >> 5];
        const mine = [...after].filter(([, other]) => other === at).length;
        expect(mine, `NPC ${i} stepped onto an occupied square (${x},${y})`).toBe(1);
        expect(walkable(g, x, y), `NPC ${i} stepped into ${g.map[at].toString(16)} at (${x},${y})`).toBe(true);
      }
    }
    // They do wander.
    expect(moved).toBeGreaterThan(20);
  });

  it('has a hostile guard come at the party, and stand next to it ready to arrest', async () => {
    const { g } = await britain();
    const s = g.s;
    callGuards(g);
    const guard = s.npcs[9];
    Object.assign(s, { x: 8, y: 5 });
    s.actors[0].x = s.x;
    s.actors[0].y = s.y;
    const far = Math.abs(guard.x - s.x) + Math.abs(guard.y - s.y);
    expect(far).toBeGreaterThan(2);
    let d = far;
    for (let turn = 0; turn < 20 && d > 1; turn++) {
      moveNpcs(g, 12);
      const now = Math.abs(guard.x - s.x) + Math.abs(guard.y - s.y);
      expect(now).toBeLessThanOrEqual(d);
      d = now;
    }
    expect(d).toBe(1);
    moveNpcs(g, 12);
    expect(s.d65be).toBe(0x61);
    expect(s.d65bf).toBe(9);
  });

  it('has a fleeing townsperson keep from the party rather than close on it', async () => {
    const { g } = await britain();
    const s = g.s;
    const npc = 13;
    besideParty(g, npc);
    const me = s.npcs[npc];
    for (let k = 0; k < 3; k++) s.schedules[npc].setType(k, 3);
    for (let k = 0; k < 4; k++) s.schedules[npc].setTime(k, 0);
    s.actors[0].x = s.x;
    s.actors[0].y = s.y;
    moveNpcs(g, 12);
    expect(Math.abs(me.x - s.x) + Math.abs(me.y - s.y)).toBeGreaterThan(1);
    expect(s.d65be).toBe(0);
  });
});
