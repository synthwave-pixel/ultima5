import { describe, expect, it } from 'vitest';
import { K } from '../src/game/io.ts';
import { castCommand, mixCommand } from '../src/game/magic.ts';
import { keys, newGame } from './helpers.ts';

/** Keys to tick the reagents of `mask` in the Mix list (the held ones, in order), then M and the amount. */
function mixKeys(held: number[], mask: number, amount: string): number[] {
  const ks: number[] = [];
  let row = 0;
  held.forEach((r, i) => {
    if (!(mask & (0x80 >> r))) return;
    while (row < i) {
      ks.push(K.Down);
      row++;
    }
    ks.push(K.Enter);
  });
  return [...ks, 'M'.charCodeAt(0), ...keys(amount), K.Enter];
}

describe('magic', () => {
  it('mixes In Lor from its recipe and casts it for light', async () => {
    const { g, p } = newGame();
    const s = g.s;
    s.reagents.fill(5);
    const had = s.mixtures[0];
    const mask = g.data.bytes(0x1cc0, 0x30)[0];
    expect(mask).not.toBe(0);
    p.keys.push(...keys('IL', K.Enter), ...mixKeys([0, 1, 2, 3, 4, 5, 6, 7], mask, '2'));
    await mixCommand(g);
    expect(p.log).toContain('Done!');
    expect(s.mixtures[0]).toBe(had + 2);
    for (let i = 0; i < 8; i++) expect(s.reagents[i]).toBe(mask & (0x80 >> i) ? 3 : 5);

    s.activeMember = 0;
    s.members[0].mp = 10;
    const mp = s.members[0].mp;
    p.keys.push(...keys('IL', K.Enter));
    await castCommand(g);
    expect(s.mixtures[0]).toBe(had + 1);
    expect(s.members[0].mp).toBe(mp - 1);
    expect(s.d58a6).toBe(100);
  });

  it("a wrong recipe goes off in the mixer's face", async () => {
    const { g, p } = newGame();
    const s = g.s;
    s.reagents.fill(5);
    const had = s.mixtures[0];
    const mask = g.data.bytes(0x1cc0, 0x30)[0] ^ 0x01;
    p.keys.push(...keys('IL', K.Enter), ...mixKeys([0, 1, 2, 3, 4, 5, 6, 7], mask, '1'));
    await mixCommand(g);
    expect(s.mixtures[0]).toBe(had);
    expect(p.log).toMatch(/ACID|POISON|BOMB|GAS/);
  });

  it('knows no spell by unknown words, and none without a mixture', async () => {
    const { g, p } = newGame();
    g.s.activeMember = 0;
    g.s.mixtures[0] = 0;
    p.keys.push(...keys('ZZ', K.Enter));
    await castCommand(g);
    expect(p.log).toContain('No effect!');
    p.keys.push(...keys('IL', K.Enter));
    await castCommand(g);
    expect(p.log).toContain('None mixed!');
  });
});
