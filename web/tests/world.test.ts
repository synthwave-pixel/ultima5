import { describe, expect, it } from 'vitest';
import { canEnter } from '../src/game/actors.ts';
import { K } from '../src/game/io.ts';
import { scheduleSlot } from '../src/game/npc.ts';
import { journeyOnward } from '../src/game/run.ts';
import { passTime } from '../src/game/time.ts';
import { enterTown, townLoop } from '../src/game/town.ts';
import { T } from '../src/game/tiles.ts';
import { keys, newGame } from './helpers.ts';

describe('walking', () => {
  it('lets a person walk on grass but not water; a ship sails only deep water', () => {
    const { g } = newGame();
    expect(canEnter(g, 0x1c, T.Grass)).toBe(true);
    expect(canEnter(g, 0x1c, T.Water1)).toBe(false);
    expect(canEnter(g, 0x20, T.Water1)).toBe(true);
    expect(canEnter(g, 0x20, T.Water3)).toBe(false);
  });
});

describe('time', () => {
  it('passes minutes into hours and dims the light at night', () => {
    const { g } = newGame();
    const s = g.s;
    s.hour = 19;
    s.minute = 50;
    passTime(g, 20);
    expect([s.hour, s.minute]).toEqual([20, 10]);
    expect(s.light).toBe(2);
    s.hour = 12;
    passTime(g, 1);
    expect(s.light).toBe(0x32);
  });
});

describe("Iolo's hut", () => {
  it('schedules put each NPC somewhere for every hour', () => {
    const { g } = newGame();
    for (let h = 0; h < 24; h++) for (let i = 1; i < 32; i++) expect([0, 1, 2]).toContain(scheduleSlot(g, i, h));
  });

  it('opens the door and walks out of the hut into Britannia', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    await enterTown(g, true);
    p.keys.push(...keys(K.Down, K.Down, K.Down, 'O', K.Down), ...Array<number>(14).fill(K.Down), 'Y'.charCodeAt(0));
    await townLoop(g).catch((e: Error) => {
      if (!e.message.includes('ran out')) throw e;
    });
    expect(p.log).toContain('Opened!');
    expect(p.log).toContain('Exit to');
    expect(g.s.mapId).toBe(0);
    expect([g.s.x, g.s.y]).toEqual([g.data.locations[12].x, g.data.locations[12].y]);
  });
});
