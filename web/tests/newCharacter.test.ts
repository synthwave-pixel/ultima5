import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseCharacter } from '../src/game/characters.ts';
import { Intro, unmadeAvatar } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { Save } from '../src/game/save.ts';
import { fromBase64, localSave } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  chooseCharacter(null); // no character of an earlier test's in play
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

describe('a new character', () => {
  it('begins with full mana where none was made too (the development build’s &new), named and strong enough', () => {
    const { g } = newGame();
    unmadeAvatar(g);
    const m = g.s.members[0];
    expect(m.mp).toBe(m.int);
    expect(m.int).toBeGreaterThan(0);
    expect(m.name).toBe('Avatar');
    expect(m.str).toBeGreaterThanOrEqual(0x14);
  });

  it('begins with full mana - the Avatar’s Intelligence - where INIT.GAM has none', async () => {
    const { g, p } = newGame();
    expect(g.s.members[0].mp).toBe(0); // INIT.GAM's Avatar
    Object.assign(g.options, { tileSet: 'original', input: 'controller' });
    // Continue with the name suggested; Lady; Modern; the opening's page; the seven answers; the verdict's page.
    p.keys.push(K.Down, Pad.A, K.Left, Pad.A, Pad.A, K.Enter, ...Array<number>(7).fill(0x41), K.Enter);
    expect(await (new Intro(g) as unknown as { createCharacter(): Promise<boolean> }).createCharacter()).toBe(true);
    const m = new Save(fromBase64(localSave.read()!.save)).members[0];
    expect(String.fromCharCode(m.cls)).toBe('A');
    expect(m.int).toBeGreaterThan(0);
    expect(m.mp).toBe(m.int);
  });
});
