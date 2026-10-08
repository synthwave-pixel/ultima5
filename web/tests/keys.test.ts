import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/**
 * Controller mode: the keyboard stands in for a pad, since Ultima V spends nearly every letter on a
 * command and WASD would otherwise attack and search. Words are still typed as letters.
 */
describe('the keyboard as a controller', () => {
  const press = async (mode: 'controller' | 'letters', codes: number[]): Promise<number[]> => {
    const { g, p } = newGame();
    g.options.input = mode;
    const { getChar } = await import('../src/game/input.ts');
    const out: number[] = [];
    p.keys.push(...codes);
    for (let i = 0; i < codes.length && p.keys.length > 0; i++) out.push(await getChar(g));
    return out;
  };

  it('walks on WASD and answers with the buttons', async () => {
    const got = await press(
      'controller',
      ['W', 'A', 'S', 'D'].map((c) => c.charCodeAt(0)),
    );
    expect(got).toEqual([K.Up, K.Left, K.Down, K.Right]);
  });

  it('makes Z, X, C and V the four buttons', async () => {
    // getChar turns A and B into the keys the prompts read (Enter, Escape); X and Y are themselves.
    const got = await press(
      'controller',
      ['Z', 'X', 'C', 'V'].map((c) => c.charCodeAt(0)),
    );
    expect(got).toEqual([K.Enter, K.Escape, Pad.X, Pad.Y]);
  });

  it('gives one hand or the other the buttons too: Enter A, Space and Escape B, Q and / X, E and . Y', async () => {
    const { asPad } = await import('../src/game/input.ts');
    const { g } = newGame();
    g.options.input = 'controller';
    const as = (c: string): number => asPad(g, c.charCodeAt(0));
    expect([as(' '), as('q'), as('Q'), as('/'), as('e'), as('E'), as('.')]).toEqual([Pad.B, Pad.X, Pad.X, Pad.X, Pad.Y, Pad.Y, Pad.Y]);
    expect([asPad(g, K.Enter), asPad(g, K.Escape)]).toEqual([K.Enter, K.Escape]); // A and B, as every prompt reads them
    // And none of them in Classic, where they are what they always were.
    g.options.input = 'letters';
    expect([as(' '), as('q'), as('/'), as('e'), as('.')]).toEqual([0x20, 0x71, 0x2f, 0x65, 0x2e]);
  });

  it('ignores the letters that are commands in the other mode', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { getChar } = await import('../src/game/input.ts');
    p.keys.push(0x4b, 0x52, 0x57); // K, R, then W
    expect(await getChar(g)).toBe(K.Up); // K and R are swallowed; W walks
  });

  it('leaves every letter alone in the original mode', async () => {
    const got = await press(
      'letters',
      ['W', 'A', 'S', 'D', 'Z'].map((c) => c.charCodeAt(0)),
    );
    expect(got).toEqual(['W', 'A', 'S', 'D', 'Z'].map((c) => c.charCodeAt(0)));
  });

  it('types words as letters even as a controller', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { getString } = await import('../src/game/input.ts');
    p.keys.push(...'DAWN'.split('').map((c) => c.charCodeAt(0)), K.Enter);
    expect(await getString(g, 8)).toBe('DAWN');
  });

  it('still takes a real controller in either mode', async () => {
    for (const mode of ['controller', 'letters'] as const) {
      const got = await press(mode, [Pad.A, Pad.B]);
      expect(got).toEqual([K.Enter, K.Escape]);
    }
  });

  it("moves a menu's bar with S and chooses with Z, rather than taking S for Search", async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { choose } = await import('../src/game/menu.ts');
    const items = [
      { label: 'Look', key: 0x4c },
      { label: 'Search', key: 0x53 },
      { label: 'Talk', key: 0x54 },
    ];
    p.keys.push(0x73, 0x73, 0x7a); // s, s, z
    expect(await choose(g, 'Commands', items)).toBe(2);
    p.keys.push(0x73, 0x78); // s, then x backs out
    expect(await choose(g, 'Commands', items)).toBe(-1);
  });

  it('takes Y and N for yes and no even as a controller, where Y is otherwise a button', async () => {
    const { g, p } = newGame();
    g.options.input = 'controller';
    const { getCharYN } = await import('../src/game/input.ts');
    p.keys.push(0x79, 0x6e, 0x7a, 0x78); // y, n, then Z and X: the pad's A and B
    expect([await getCharYN(g), await getCharYN(g), await getCharYN(g), await getCharYN(g)]).toEqual([0x59, 0x4e, 0x59, 0x4e]);
  });
});
