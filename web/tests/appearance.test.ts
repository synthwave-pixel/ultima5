import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  FIGURES,
  HAIR,
  HUES,
  PEOPLE_SKIN,
  SKIN,
  customisable,
  randomAppearance,
  validAppearance,
} from '../src/game/appearance.ts';
import { parseSave, restore, serialize } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

describe("the Avatar's appearance", () => {
  it('offers five figures, eight skins, eight hair colours and fifteen colours for the clothes, each besides the default', () => {
    expect(FIGURES.map((f) => f.base)).toEqual([0x14c, 0x140, 0x144, 0x158, 0x150]);
    expect(SKIN).toHaveLength(8);
    expect(HAIR.map((h) => h.name)).toEqual(['default', 'blonde', 'brown', 'brunette', 'black', 'white', 'auburn', 'green', 'purple']);
    expect(HAIR[0].ramp).toBeNull();
    expect(HUES).toEqual([null, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 'white', 'grey', 'black']);
    expect(DEFAULT_APPEARANCE).toEqual({ figure: 0, skin: PEOPLE_SKIN, hair: 0, main: 0, trim: 0 });
  });

  it('takes a damaged or missing appearance as the default, and a good one as it is', () => {
    expect(validAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(validAppearance({ figure: 9, skin: 0, hair: 0, main: 0, trim: 0 })).toEqual(DEFAULT_APPEARANCE);
    const a = { figure: 2, skin: 7, hair: 6, main: 12, trim: 1 };
    expect(validAppearance(a)).toEqual(a);
  });

  it('rolls an appearance within the ranges', () => {
    let n = 0;
    const a = randomAppearance((lo, hi) => lo + (n++ % (hi - lo + 1)));
    expect(validAppearance(a)).toEqual(a);
  });

  it('is customisable only in the Standard look with the Modern PC tiles', () => {
    const { g } = newGame();
    Object.assign(g.options, { tileSet: 'standard', tiles: 'modern-pc' });
    expect(customisable(g)).toBe(true);
    g.options.tiles = 'apple2';
    expect(customisable(g)).toBe(false);
    Object.assign(g.options, { tileSet: 'original', tiles: 'modern-pc' });
    expect(customisable(g)).toBe(false);
  });

  it('is saved with the game and restored; an older save gets the default', () => {
    const { g } = newGame();
    g.appearance = { figure: 3, skin: 1, hair: 5, main: 4, trim: 9 };
    const d = parseSave(JSON.stringify(serialize(g)));
    const { g: h } = newGame();
    restore(h, d);
    expect(h.appearance).toEqual(g.appearance);
    delete d.appearance;
    restore(h, d);
    expect(h.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});
