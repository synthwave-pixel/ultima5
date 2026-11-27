/**
 * nameBox.ts
 *
 * How the page's own box for a line of text (pageHooks.ts textBox: askName's "Type a name" from a keyboard or a
 * touch) is dressed: as the title's dialogs are (menu.ts framed), since that is where it is asked - the lettering in
 * the font chosen at the game's text size, in the title dialogs' blue frame: in the Standard look the copper toned to
 * TITLE_DIALOG, its light on the lit edges and its shade at the foot, the dark rim inside; in Retro the EGA's blue,
 * a white line inside, as the title draws its own.
 */

import { TITLE_DIALOG } from '../game/chromeTone.ts';
import type { FontChoice, TileSet } from '../game/settings.ts';
import { chromeColours } from './framebuffer.ts';
import { letterFace } from './screen.ts';

/** The frame's band, in EGA pixels (menu.ts framed). */
const BAND = 7;

export interface NameBoxStyle {
  /** The lettering: its CSS family, weight and size (CSS pixels). */
  family: string;
  weight: number;
  size: number;
  /** A text cell's side and an EGA pixel's, at the game's size (CSS pixels). */
  cell: number;
  pixel: number;
  /** How far the selection's light reaches above the letters (CSS pixels): two of the game's pixels (the owner's). */
  rise: number;
  /** The band's depth (CSS pixels), and its colours: its lit edges' line, its foot's, the band's own, the line inside it. */
  band: number;
  frame: { light: string; shade: string; base: string; rim: string };
}

const css = (v: number): string => `#${v.toString(16).padStart(6, '0')}`;

/** The box's dress in font `font`, in look `look`, a text cell being `cell` CSS pixels on the screen. */
export function nameBoxStyle(font: FontChoice, look: TileSet, cell: number): NameBoxStyle {
  const face = letterFace(font);
  const pixel = cell / 8;
  let frame: NameBoxStyle['frame'];
  if (look === 'standard') {
    // The band in the copper's own tone, its outermost light on the lit edges and its outermost shade at the foot (as
    // the screen's frame is, the bevel a pixel's line at the box's size), the rim inside.
    const c = chromeColours(TITLE_DIALOG);
    frame = { light: css(c.light[0]), shade: css(c.shade[0]), base: css(c.base), rim: css(c.rim) };
  } else frame = { light: '#0000aa', shade: '#0000aa', base: '#0000aa', rim: '#ffffff' };
  return { family: face.family, weight: face.weight, size: cell * face.share, cell, pixel, rise: 2 * pixel, band: BAND * pixel, frame };
}

/** What the field shows (the box draws it over the page's own field, whose letters, selection and cursor are hid). */
export interface FieldView {
  before: string;
  selected: string;
  after: string;
  /** The game's turning cursor after the last letter. */
  spinner: boolean;
  /** The page's line of a cursor, where the cursor stands. */
  caret: boolean;
}

/**
 * The field of `value`, selected from `start` to `end`, `focused` or not: the game's turning cursor after the name
 * where the cursor - or the selection - ends at its end, as the game's own line has it (input.ts); within the name,
 * the page's line (the owner's, 2026-11-27); none where a selection ends within it, as the page. With nothing typed,
 * the game's cursor too, as its own empty line has it (the owner's).
 */
export function fieldView(value: string, start: number, end: number, focused: boolean): FieldView {
  const [a, b] = [Math.min(start, end), Math.max(start, end)];
  const atEnd = focused && b === value.length;
  return {
    before: value.slice(0, a),
    selected: value.slice(a, b),
    after: value.slice(b),
    spinner: atEnd,
    caret: focused && !atEnd && a === b,
  };
}
