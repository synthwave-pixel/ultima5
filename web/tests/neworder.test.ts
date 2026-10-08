import { describe, expect, it } from 'vitest';
import { newOrderCommand } from '../src/game/cmds.ts';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** New order on a controller: the bar passes over the Avatar, who must lead, and the second time over the first pick. */
describe('New order, by controller', () => {
  it('starts past the Avatar, and swaps the next two with A and A', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const s = g.s;
    g.options.input = 'controller';
    const before = [...Array(s.partySize).keys()].map((i) => s.members[i].name);
    expect(before.length).toBeGreaterThanOrEqual(3);
    p.keys.push(Pad.A, Pad.A);
    await newOrderCommand(g);
    expect(p.log).not.toMatch(/must\s+lead/);
    expect([s.members[0].name, s.members[1].name, s.members[2].name]).toEqual([before[0], before[2], before[1]]);
  });

  it("goes no higher than the second member, and a keyboard's digits still name the Avatar", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    p.keys.push(K.Up, Pad.A, K.Up, Pad.A);
    await newOrderCommand(g);
    expect(p.log).not.toMatch(/must\s+lead/);
    g.options.input = 'letters';
    p.keys.push(0x31, K.Enter); // 1: the Avatar
    await newOrderCommand(g);
    expect(p.log).toMatch(/must\s+lead/);
  });
});
