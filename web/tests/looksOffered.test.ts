import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import { useStore } from '../src/game/keyStore.ts';
import { appearanceLines } from '../src/game/menu.ts';
import {
  DEFAULTS,
  loadOptions,
  looksOffered,
  normaliseOptions,
  PC_TILES,
  SETTINGS_KEY,
  TILES,
  useLooks,
  type TileSet,
} from '../src/game/settings.ts';
import { FakePlatform } from './helpers.ts';

/**
 * The Looks a game offers (settings.ts useLooks): Ultima V's eight unless its entry says otherwise - the Ultima IV
 * port's PC EGA alone until its art comes - and a saved look the game does not offer loaded as its first.
 */

let store = new Map<string, string>();
beforeEach(() => {
  store = new Map();
  useStore({
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  });
});
afterEach(() => {
  useLooks(null);
  useStore();
});

const saved = (o: object): void => void store.set(SETTINGS_KEY, JSON.stringify(o));

describe('the Looks a game offers', () => {
  it('are Ultima V’s eight unless a game says otherwise, Retro’s without Remastered', () => {
    expect(looksOffered('standard')).toEqual(TILES);
    expect(looksOffered('original')).toEqual(PC_TILES);
  });

  it('leave Ultima V’s saved settings as they loaded before', () => {
    for (const tileSet of ['standard', 'original'] as TileSet[])
      for (const tiles of TILES) {
        saved({ tileSet, tiles });
        expect(loadOptions(), `${tileSet} ${tiles}`).toEqual({ ...DEFAULTS, ...normaliseOptions({ tileSet, tiles }) });
      }
    store.clear();
    expect(loadOptions()).toEqual(DEFAULTS);
  });

  it('give a game offering PC EGA alone PC EGA, whatever was saved, in either interface', () => {
    useLooks(['pc-ega']);
    expect(looksOffered('standard')).toEqual(['pc-ega']);
    expect([loadOptions().tileSet, loadOptions().tiles]).toEqual(['standard', 'pc-ega']);
    saved({ tiles: 'modern-pc' });
    expect(loadOptions().tiles).toBe('pc-ega');
    saved({ tileSet: 'original', tiles: 'apple2' });
    expect([loadOptions().tileSet, loadOptions().tiles]).toEqual(['original', 'pc-ega']);
  });

  it('are the Look line’s round', () => {
    useLooks(['pc-ega']);
    const g = new GameCore(new FakePlatform());
    g.options.tiles = 'pc-ega';
    const look = () => appearanceLines(g).find((l) => l.label.startsWith('Look'))!;
    void look().act?.();
    expect(look().label).toBe('Look: PC EGA');
    void look().act?.();
    expect(g.options.tiles).toBe('pc-ega');
    useLooks(null);
    void look().act?.();
    expect(g.options.tiles).toBe('pc-cga');
  });
});
