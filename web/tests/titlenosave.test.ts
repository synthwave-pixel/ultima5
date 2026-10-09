import { describe, expect, it } from 'vitest';
import { Intro } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/** A fake localStorage, empty or holding a game. */
function storage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  };
  return m;
}

describe('the title with no game saved', () => {
  it('starts the bar on Create New Character, so A makes one', async () => {
    storage();
    const { g, p } = newGame();
    p.keys.push(K.Escape, K.Escape, K.Escape, Pad.A);
    await expect(new Intro(g).run()).rejects.toThrow('script ran out of keys');
    expect(p.log.replace(/\s+/g, ' ')).toMatch(/By what name shalt thou be known/);
  });

  it('passes over Journey Onward, grey: up from Create New Character is the last line', async () => {
    storage();
    const { g, p } = newGame();
    p.keys.push(K.Escape, K.Escape, K.Escape, K.Up, Pad.A);
    await expect(new Intro(g).run()).rejects.toThrow('script ran out of keys');
    expect(g.menuShown?.title).toBe('Manage Saves');
  });
});
