/**
 * waitMark.ts
 *
 * The port's sign that a page waits for a press: a small arrow, pointing on, blinking in the page's lower right
 * corner while a story page (the introduction's, the ending's) stands until any key - where 1988 showed nothing, and
 * a player new to it could not tell a page waiting from one still drawing. Not a key hint: any key goes on.
 */

import type { Game } from './game.ts';

/** The arrow's place: the last few pixels of the page's lower right corner, clear on every story page. */
const X = 306;
const Y = 190;

/** The arrow drawn (`on`) or rubbed out, on the screen (page 0) whatever page is being drawn behind it. */
export function waitMark(g: Game, on: boolean): void {
  const d = g.draw;
  const fx = g.p.fx;
  const page = fx.pageNow?.() ?? 0;
  const pen = d.pen;
  fx.page(0);
  d.pen = on ? 15 : 0;
  for (let r = 0; r < 4; r++) d.line(X + r, Y + r, X + 6 - r, Y + r);
  d.pen = pen;
  fx.page(page);
}

/** Ticks of the game's 18.2 a second the arrow stays lit, and dark, as it blinks. */
const BLINK = 9;

/** A blink: for a wait's idle calls (about 18 a second), the arrow lit and dark by turns. */
export function blinker(g: Game): () => void {
  let n = 0;
  return () => {
    if (n % BLINK === 0) waitMark(g, n % (2 * BLINK) === 0);
    n++;
  };
}
