import { describe, expect, it } from 'vitest';
import { askAddress } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/**
 * How the Avatar is addressed (intro.ts askAddress), the port's words for the original's "Art thou Male or Female?":
 * a box of its own, Lady and Sir either side, neither chosen until the d-pad chooses; A takes it, B goes back.
 */
describe('how the Avatar is addressed', () => {
  const ask = async (...keys: number[]): Promise<{ gender: number | null; shown: string }> => {
    const { g, p } = newGame();
    p.keys.push(...keys);
    const gender = await askAddress(g);
    return { gender, shown: p.log };
  };

  it('asks in a box of its own, Lady left and Sir right', async () => {
    const r = await ask(K.Left, Pad.A);
    expect(r.shown).toMatch(/How art thou/);
    expect(r.shown).toMatch(/addressed\?/);
    expect(r.shown).toMatch(/Lady/);
    expect(r.shown).toMatch(/Sir/);
    expect(r.gender).toBe(0x0c);
  });

  it('has nothing chosen to begin with: A alone does nothing until left or right chooses', async () => {
    expect((await ask(Pad.A, Pad.A, K.Right, Pad.A)).gender).toBe(0x0b);
    expect((await ask(K.Right, K.Left, K.Enter)).gender).toBe(0x0c);
  });

  it('goes back with B, choosing nothing', async () => {
    expect((await ask(K.Left, Pad.B)).gender).toBeNull();
  });

  it('takes L or S typed, and the original’s F or M', async () => {
    expect((await ask('L'.charCodeAt(0))).gender).toBe(0x0c);
    expect((await ask('s'.charCodeAt(0))).gender).toBe(0x0b);
    expect((await ask('F'.charCodeAt(0))).gender).toBe(0x0c);
    expect((await ask('M'.charCodeAt(0))).gender).toBe(0x0b);
  });
});
