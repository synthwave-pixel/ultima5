import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward } from '../src/game/run.ts';
import { merchant } from '../src/game/shops.ts';
import { newGame } from './helpers.ts';

/**
 * Rations at a pub, dialled with a controller (shops.ts rations): the dial says what a ration is and what the number
 * on it costs, and goes no higher than the party can pay for.
 */
async function buy(gold: number, dial: number[]): Promise<{ shown: string[][]; gold: number; food: number; log: string }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  g.options.input = 'controller';
  s.mapId = g.data.bytes(0x23ca + 16, 16)[0]; // the first towne with a pub
  s.gold = gold;
  s.food = 100;
  s.townAir = 0xff; // a towne no Shadowlord is in, where the change is not short (shortChange)
  const shown: string[][] = [];
  const keys = [...dial, Pad.A];
  let state: 'ask' | 'choose' | 'dial' | 'done' = 'ask';
  p.next = () => {
    const m = g.menuShown;
    if (!m) return Pad.A;
    if (m.title === 'How many?') {
      shown.push([...m.labels]);
      state = 'dial';
      return keys.shift() ?? Pad.A;
    }
    if (m.title === 'Choose') {
      if (state === 'dial' || state === 'done') return Pad.B; // bought: leave
      state = 'choose';
      const i = m.labels.indexOf('Rations');
      return m.at === i ? Pad.A : m.at < i ? K.Down : K.Up;
    }
    // Yes to "Wilt thou...?", then No to "Anything else?".
    return state === 'ask' || state === 'choose' ? Pad.A : m.at === 1 ? Pad.A : K.Down;
  };
  await merchant(g, 0x82);
  return { shown, gold: s.gold, food: s.food, log: p.log.replace(/\s+/g, ' ') };
}

describe('rations by controller', () => {
  it('says what a ration is and what the number dialled costs', async () => {
    const { shown, gold, food } = await buy(100, [K.Up, K.Up]);
    const price = (100 - gold) / 3;
    expect(Number.isInteger(price) && price > 0).toBe(true);
    expect(shown[0]).toEqual(['1', `Each: 25 food, ${price}gp`, `Costs ${price} of 100gp`]);
    expect(shown.at(-1)).toEqual(['3', `Each: 25 food, ${price}gp`, `Costs ${3 * price} of 100gp`]);
    expect(food).toBe(100 + 3 * 25);
  });

  it('goes no higher than the gold will pay for', async () => {
    const { shown, gold, food } = await buy(20, [K.Right, K.Right, K.Up, K.Up]);
    const most = Number(shown.at(-1)![0]);
    const price = Number(/(\d+)gp/.exec(shown[0][1])![1]);
    expect(most).toBe(Math.floor(20 / price));
    expect(gold).toBe(20 - most * price);
    expect(food).toBe(100 + most * 25);
  });

  it('still lets a party with no gold ask for one, as 1988 did', async () => {
    const { shown, log } = await buy(0, [K.Up, K.Up]);
    expect(shown.at(-1)?.[0]).toBe('1');
    expect(log).toMatch(/neither gold nor\s*need! Out!/);
  });
});
