import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { manageSavesMenu } from '../src/game/characterMenu.ts';
import { chooseCharacter } from '../src/game/characters.ts';
import { K, Pad } from '../src/game/io.ts';
import { choose, chooseTwoColumns, type Item } from '../src/game/menu.ts';
import type { Transfer } from '../src/game/transfer.ts';
import { newGame } from './helpers.ts';

/**
 * A list opened on a line that cannot be chosen (menu.ts choose, chooseTwoColumns): the bar starts on the next line
 * that can be, as it steps over such a line when moved - a line the bar may rest on (`rest`) counting as one it can be
 * on. Where none can be, it stays where it was put. (Manage Saves with no character kept: Export greyed, the bar on
 * Import.)
 */
describe('a list started on a greyed line', () => {
  /** The game, and the lines the bar was on as the list waited, in order. */
  const watched = () => {
    const { g, p } = newGame();
    const seen: number[] = [];
    g.choiceWatch = (at) => void seen.push(at);
    return { g, p, seen };
  };
  const off = (label: string): Item => ({ label, enabled: false });

  it('starts on the next line that can be chosen', async () => {
    const { g, p, seen } = watched();
    p.keys.push(Pad.A);
    expect(await choose(g, 'T', [off('a'), { label: 'b' }], 0, true)).toBe(1);
    expect(seen).toEqual([1]);
  });

  it('wraps round to the first from a greyed last line', async () => {
    const { g, p } = watched();
    p.keys.push(Pad.A);
    expect(await choose(g, 'T', [{ label: 'a' }, off('b'), off('c')], 2, true)).toBe(0);
  });

  it('starts on a line the bar may rest on, though it cannot be chosen', async () => {
    const { g, p, seen } = watched();
    p.keys.push(Pad.A, Pad.B);
    expect(await choose(g, 'T', [{ ...off('a'), rest: true }, { label: 'b' }], 0, true)).toBe(-1);
    expect(seen).toEqual([0, 0]);
  });

  it('stays where it was put when no line can be chosen', async () => {
    const { g, p, seen } = watched();
    p.keys.push(K.Down, Pad.B);
    expect(await choose(g, 'T', [off('a'), off('b'), off('c')], 1, true)).toBe(-1);
    expect(seen).toEqual([1, 1]);
  });

  it('does the same in two columns', async () => {
    const { g, p } = watched();
    p.keys.push(Pad.A);
    expect(await chooseTwoColumns(g, 'T', [off('a'), { label: 'b' }, { label: 'c' }], 0)).toBe(1);
  });
});

describe('Manage Saves with no character kept', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    chooseCharacter(null);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('opens with the bar on Import, not on the greyed Export', async () => {
    const { g, p } = newGame();
    g.inPlay = false;
    g.hooks.transfer = {} as Transfer; // the app's: Import offered (its workings are not reached)
    const seen: number[] = [];
    g.choiceWatch = (at, title) => {
      if (title === 'Manage Saves') seen.push(at);
    };
    p.keys.push(Pad.B);
    expect(await manageSavesMenu(g, async () => {})).toBeNull();
    expect(seen).toEqual([1]);
  });
});
