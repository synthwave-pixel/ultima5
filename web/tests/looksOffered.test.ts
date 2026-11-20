import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameCore } from '../src/game/gameCore.ts';
import { useStore } from '../src/game/keyStore.ts';
import { appearanceLines } from '../src/game/menu.ts';
import {
  ALL_TILES,
  DEFAULTS,
  loadOptions,
  lookNote,
  looksOffered,
  normaliseOptions,
  PC_TILES,
  SETTINGS_KEY,
  TILES,
  TILES_NAMES,
  useLooks,
  type TileSet,
} from '../src/game/settings.ts';
import { FakePlatform } from './helpers.ts';

/**
 * The Looks a game offers (settings.ts useLooks): Ultima V's eight unless its entry says otherwise - the Ultima IV
 * port's PC EGA alone until its art comes - and a saved look the game does not offer loaded as its first; Upgrade VGA
 * a game's own, never Ultima V's; and the Look line's note in a game's own words where it gives them (lookNote).
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

  it('never offer Upgrade VGA for Ultima V, and drop it from Ultima V’s saved settings', () => {
    expect(TILES).not.toContain('pc-vga');
    expect(PC_TILES).not.toContain('pc-vga');
    expect(ALL_TILES).toEqual([...TILES, 'pc-vga']);
    expect(TILES_NAMES['pc-vga']).toBe('Upgrade VGA');
    for (const tileSet of ['standard', 'original'] as TileSet[]) {
      saved({ tileSet, tiles: 'pc-vga' });
      expect(loadOptions().tiles, tileSet).toBe(tileSet === 'standard' ? 'modern-pc' : 'pc-ega');
    }
  });

  it('keep a saved Upgrade VGA for a game that offers it, in either interface', () => {
    useLooks(['modern-pc', 'pc-ega', 'pc-vga']);
    expect(looksOffered('original')).toEqual(['pc-ega', 'pc-vga']);
    for (const tileSet of ['standard', 'original'] as TileSet[]) {
      saved({ tileSet, tiles: 'pc-vga' });
      expect(loadOptions().tiles, tileSet).toBe('pc-vga');
    }
    // Offered no longer (its files gone): the game's first in Retro, as last saved.
    useLooks(['modern-pc', 'pc-ega']);
    expect(loadOptions().tiles).toBe('pc-ega');
  });

  it('say a game’s own words of a look on the Look line, Ultima V’s for the rest', () => {
    const g = new GameCore(new FakePlatform());
    const note = () => appearanceLines(g).find((l) => l.label.startsWith('Look'))!.note;
    g.options.tiles = 'pc-ega';
    const ultima5 = note();
    expect(lookNote('pc-ega')).toBeUndefined();
    useLooks(['pc-ega', 'pc-cga'], { 'pc-ega': 'PC EGA: a game’s own words.' });
    expect(note()).toBe('PC EGA: a game’s own words.');
    g.options.tiles = 'pc-cga';
    expect(note()).toBe("PC CGA: the 1988 PC game's four-colour tiles."); // Ultima V's, the game giving none
    // Ultima V's looks again: its own words.
    useLooks(null);
    g.options.tiles = 'pc-ega';
    expect(note()).toBe(ultima5);
    expect(lookNote('pc-ega')).toBeUndefined();
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
