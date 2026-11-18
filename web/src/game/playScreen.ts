/**
 * playScreen.ts
 *
 * The play screen as Journey Onward leaves it: the border around the map and the stats, the text windows, and the
 * first turn's set-up. Shared by the main loop (run.ts), a save taken up (storage.ts) and the start (main.ts); kept
 * apart from the main loop so those need not import the rules it runs.
 */

import { Colour } from '../ui/colours.ts';
import { clearBorderTitle, drawColumn, drawVitals, panelWindows, setWind } from './frame.ts';
import { Game } from './game.ts';

/** ULTIMA_637e_DrawFrame: the border around the map and the stats. */
export function drawFrame(g: Game): void {
  const d = g.draw;
  d.chrome?.(true);
  d.pen = Colour.black;
  d.fill(0, 0, 319, 199);
  const t = g.text;
  // The text's record emptied with the screen: what the title's menu printed would otherwise be drawn again from it
  // when the look changes (layout.ts relayout repaints the log's rows), pieces of its lines in the log and on the border.
  t.clearArea(0, 0, 0x27, 0x18);
  d.pen = Colour.blue;
  d.fill(0, 0, 319, 6);
  d.fill(0, 185, 191, 191);
  d.fill(0, 0, 6, 191);
  d.fill(185, 0, 191, 191);
  t.select(0);
  t.win.fg = Colour.blue;
  t.moveTo(0, 0);
  g.printChar(0x7b);
  t.moveTo(39, 0);
  g.printChar(0x7c);
  t.moveTo(0, 23);
  g.printChar(0x7d);
  d.pen = Colour.brightWhite;
  d.line(7, 7, 7, 184);
  d.line(7, 184, 184, 184);
  d.line(184, 184, 184, 7);
  d.line(184, 7, 7, 7);
  // The right-hand column at the panel's height: 1988's two boxes, or the Standard look's one (frame.ts).
  drawColumn(g);
  t.win.fg = Colour.brightWhite;
  clearBorderTitle(g); // the regalia worn, on the party box's top border (Standard)
}

/** The text windows of the game screen (u5d intro.c). */
export function gameWindows(g: Game): void {
  const t = g.text;
  t.setWindow(0, 0, 0, 0x27, 0x18);
  panelWindows(g); // the party's and the log's, at the panel's height (frame.ts)
}

/** The screen as Journey Onward leaves it. */
export function journeyOnward(g: Game): void {
  g.inPlay = true;
  gameWindows(g);
  drawFrame(g);
  setWind(g, 0);
  g.text.select(2);
  g.text.moveTo(0, 0xc);
  setWind(g, -1);
  drawVitals(g);
  // A new game's first turn: where the Tips are, once (the port's).
  if (!g.tipsShown.has('nudge')) {
    g.print('New to Britannia? See Tips, in the pause menu.\n');
    g.tipsShown.add('nudge');
  }
}
