import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/**
 * Reagents at an apothecary, dialled with a controller (shops.ts reagentsDialled): lots bought several at a time, the
 * dial saying what a lot is, what the number on it costs and what the party will hold, going no higher than the party
 * can pay for and carry.
 */
async function buy(gold: number, dial: number[], held = 0): Promise<{ shown: string[][]; gold: number; got: number; log: string }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  g.options.input = 'controller';
  s.mapId = g.data.bytes(0x23ca + 4 * 16, 16)[0]; // the first place with an apothecary
  s.gold = gold;
  s.townAir = 0xff; // no Shadowlord in town: the change is not short (shortChange)
  s.reagents.fill(held);
  const before = [...s.reagents];
  const shown: string[][] = [];
  const keys = [...dial, Pad.A];
  let state: 'ask' | 'chosen' | 'dialled' = 'ask';
  p.next = () => {
    const m = g.menuShown;
    if (!m) return Pad.A;
    if (m.title === 'How many?') {
      shown.push([...m.labels]);
      state = 'dialled';
      return keys.shift() ?? Pad.A;
    }
    if (m.title === 'Choose') {
      if (state !== 'ask') return Pad.B; // bought, or not: leave
      state = 'chosen';
      return m.at === 0 ? Pad.A : K.Up; // the first reagent sold
    }
    // Yes, to buy at all; B to anything after.
    return state === 'ask' ? Pad.A : Pad.B;
  };
  await merchant(g, 0x85);
  const got = s.reagents.reduce((n, r, i) => n + r - before[i], 0);
  return { shown, gold: s.gold, got, log: p.log.replace(/\s+/g, ' ') };
}

describe('reagents by controller', () => {
  it('buys several lots at once, saying what a lot is, what the number dialled costs and what will be held', async () => {
    const { shown, gold, got } = await buy(200, [K.Up, K.Up]);
    const [, each, price] = /Each: (\d+) for (\d+)gp/.exec(shown[0][1])!.map(Number);
    expect(shown[0]).toEqual(['1', `Each: ${each} for ${price}gp`, `Costs ${price} of 200gp`, `Held: 0 -> ${each}`]);
    expect(shown.at(-1)).toEqual(['3', `Each: ${each} for ${price}gp`, `Costs ${3 * price} of 200gp`, `Held: 0 -> ${3 * each}`]);
    expect(gold).toBe(200 - 3 * price);
    expect(got).toBe(3 * each);
  });

  it('goes no higher than the gold will pay for, or the party carry', async () => {
    const price = Number(/for (\d+)gp/.exec((await buy(200, [K.Down])).shown[0][1])![1]);
    const poor = await buy(2 * price + 1, [K.Right, K.Right, K.Up, K.Up]); // two lots' gold, and one over
    expect(Number(poor.shown.at(-1)![0])).toBe(2);
    expect(poor.gold).toBe(1);
    const full = await buy(9999, [K.Right, K.Right, K.Right, K.Up], 95);
    const each = Number(/Each: (\d+)/.exec(full.shown[0][1])![1]);
    expect(Number(full.shown.at(-1)![0])).toBe(Math.ceil(4 / each));
    expect(full.got).toBe(4); // to 99, no further
  });

  it('buys nothing for none dialled, and tells a party that cannot pay so', async () => {
    const none = await buy(200, [K.Down]);
    expect(none.got).toBe(0);
    expect(none.gold).toBe(200);
    const broke = await buy(0, []);
    expect(broke.shown[0][0]).toBe('1');
    expect(broke.got).toBe(0);
  });
});
