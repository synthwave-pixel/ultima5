import { describe, expect, it } from 'vitest';
import { askAddress } from '../src/game/characterQuestions.ts';
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

  it("refuses A with nothing chosen: the menus' no, and the arrows flash", async () => {
    const { g, p } = newGame();
    g.options.soundChoice = 'classical';
    const asked: string[] = [];
    p.sound = { ...p.sound, cue: async (name: string) => void asked.push(name) };
    const flashed: number[] = [];
    const print = g.text.printChar.bind(g.text);
    g.text.printChar = (ch: number) => {
      if (g.text.inverse && (ch === 0x1b || ch === 0x1a)) flashed.push(ch);
      print(ch);
    };
    p.keys.push(Pad.A, K.Right, Pad.A);
    expect(await askAddress(g)).toBe(0x0b);
    expect(asked).toEqual(['Back']);
    expect(flashed).toEqual([0x1b, 0x1a]);
  });

  it('starts on the answer given before, come back to', async () => {
    const { g, p } = newGame();
    p.keys.push(Pad.A);
    expect(await askAddress(g, 0x0b)).toBe(0x0b);
    p.keys.push(Pad.A);
    expect(await askAddress(g, 0x0c)).toBe(0x0c);
    p.keys.push(K.Left, Pad.A);
    expect(await askAddress(g, 0x0b)).toBe(0x0c);
  });
});
