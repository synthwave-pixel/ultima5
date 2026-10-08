/**
 * appearance.ts
 *
 * The Avatar's appearance (the port's own, as Ultima VI and Ultima Online let the player choose one): a figure of
 * five - the fighter the Avatar is drawn as, the mage, the bard, the jester as a rogue, the townsman as a shepherd -
 * and its skin, hair and clothes recoloured from presets. Appearance only: the Avatar's class stays Avatar. Drawn in
 * the Modern PC tiles alone (standardArt.ts); every other set draws the Avatar as it is, the appearance kept.
 */

import type { Game } from './game.ts';

export interface Appearance {
  /** Index into FIGURES. */
  figure: number;
  /** Index into SKIN. */
  skin: number;
  /** Index into HAIR. */
  hair: number;
  /** The main clothes' and the trim's hue: index into HUES (0 as drawn). */
  main: number;
  trim: number;
}

/** The five figures: their first walking frame. */
export const FIGURES: readonly { name: string; base: number }[] = [
  { name: 'Fighter', base: 0x14c },
  { name: 'Mage', base: 0x140 },
  { name: 'Bard', base: 0x144 },
  { name: 'Jester', base: 0x158 },
  { name: 'Shepherd', base: 0x150 },
];

/** Skin, lightest to darkest: each [light, mid, shade] (0xRRGGBB), for the step of the EGA colour it replaces. */
export const SKIN: readonly [number, number, number][] = [
  [0xe8c4a8, 0xd4a684, 0xa87a5c],
  [0xdcb08a, 0xc49470, 0x946848],
  [0xd0a070, 0xb8865a, 0x8a603c],
  [0xc89868, 0xb07c50, 0x825a36],
  [0xb07a4c, 0x98643a, 0x6e4526],
  [0x8e5a36, 0x784828, 0x54321a],
  [0x6a4228, 0x58341e, 0x3c2414],
  [0x4a2e1c, 0x3c2416, 0x28180e],
];

/** The people of Sosaria's skin: a light brown, common to many (the Avatar's to begin with). */
export const PEOPLE_SKIN = 3;

/**
 * Hair, first as drawn ("default": the fighter's helm, the bard's hat, the jester's hood, the mage's and the
 * shepherd's own hair); any other colour dyes the hair and turns a helm, a hat or a hood into hair of that colour.
 */
export const HAIR: readonly { name: string; ramp: [number, number, number] | null }[] = [
  { name: 'default', ramp: null },
  { name: 'blonde', ramp: [0xe8d078, 0xc8a850, 0x8e7430] },
  { name: 'brown', ramp: [0x9a6a3e, 0x7a5230, 0x54381e] },
  { name: 'brunette', ramp: [0x6a4628, 0x50341c, 0x362212] },
  { name: 'black', ramp: [0x4a4a52, 0x2e2e34, 0x1a1a1e] },
  { name: 'white', ramp: [0xf0ece0, 0xc8c4b8, 0x8e8a80] },
  { name: 'auburn', ramp: [0xb0603a, 0x8e4a2a, 0x62321a] },
  { name: 'green', ramp: [0x4e7a3e, 0x36582a, 0x223a1a] },
  { name: 'purple', ramp: [0x7a4e8e, 0x5a3668, 0x3a2244] },
];

/** A colour for the clothes: a hue (degrees), as drawn (null), or one of no hue - white, grey or black. */
export type Hue = number | null | 'white' | 'grey' | 'black';

/** The clothes' colours: first as drawn, then the twelve hues, thirty degrees apart, then white, grey and black. */
export const HUES: readonly Hue[] = [null, ...Array.from({ length: 12 }, (_, i) => i * 30), 'white', 'grey', 'black'];

export const DEFAULT_APPEARANCE: Appearance = { figure: 0, skin: PEOPLE_SKIN, hair: 0, main: 0, trim: 0 };

/** The step of a ramp (0 light, 1 mid, 2 shade) an EGA colour stands for, in skin and in hair. */
export const SKIN_STEP: Record<number, number> = { 14: 0, 12: 0, 15: 0, 6: 1, 7: 1, 4: 2, 8: 2 };
export const HAIR_STEP: Record<number, number> = { 15: 0, 14: 0, 7: 1, 6: 1, 8: 2, 4: 2 };

const RANGES: Record<keyof Appearance, number> = {
  figure: FIGURES.length,
  skin: SKIN.length,
  hair: HAIR.length,
  main: HUES.length,
  trim: HUES.length,
};

/** `x` as an appearance, or the default where it is not a whole one within the ranges (an older save, a damaged one). */
export function validAppearance(x: unknown): Appearance {
  if (typeof x !== 'object' || x === null) return { ...DEFAULT_APPEARANCE };
  const a = x as Record<string, unknown>;
  for (const [k, n] of Object.entries(RANGES)) {
    const v = a[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) return { ...DEFAULT_APPEARANCE };
  }
  return { figure: a.figure, skin: a.skin, hair: a.hair, main: a.main, trim: a.trim } as Appearance;
}

/** A random appearance ("Surprise me"), by `random` (lo to hi inclusive). */
export function randomAppearance(random: (lo: number, hi: number) => number): Appearance {
  return {
    figure: random(0, FIGURES.length - 1),
    skin: random(0, SKIN.length - 1),
    hair: random(0, HAIR.length - 1),
    main: random(0, HUES.length - 1),
    trim: random(0, HUES.length - 1),
  };
}

/** The save's gender for an Avatar addressed as Lady. */
export const LADY = 0x0c;

/** Whether the Avatar is addressed as Lady (the save's gender LADY): a mage, then, has no beard. */
export const addressedAsLady = (g: Game): boolean => g.s.members[0].gender === LADY;

/** Whether the Avatar's appearance is drawn, and may be changed: the Standard look with the Modern PC tiles. */
export function customisable(g: Game): boolean {
  return g.options.tileSet === 'standard' && g.options.tiles === 'modern-pc';
}
