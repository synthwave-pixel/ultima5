/**
 * layout.ts
 *
 * The Standard look's party panel at its two heights (frame.ts compactPanel): its own, the log running two rows
 * higher than 1988's, and 1988's, which the screens that need all nine of the panel's rows take while they are up -
 * Ztats, Ready and Use, a shop's arms and its check-out, the keyboard's reagents for a mix, Resurrect's card.
 *
 * The full height is an overlay (text.ts cover; docs/text-overlays.md): the log's window never moves. The panel is
 * drawn over the log's top two rows, and the log goes on under it - printing, scrolling and folding as ever, only
 * unseen there - until the overlay is taken away and those rows are drawn again as they now read. Nothing printed
 * meanwhile is lost. The EGA look is the 1988 screen throughout, and all of this leaves it as it is.
 */

import { clearBorderTitle, compactPanel, drawColumn, drawVitals, panelWindows, setWind, Win } from './frame.ts';
import { drawDungeonMap, liftDungeonMap } from './dungeonMap.ts';
import type { Game } from './game.ts';

/** The log's cells the full panel lies over: its top two rows (9 and 10), the right-hand column's width. */
const COVER = { c1: 0x18, r1: 9, c2: 0x27, r2: 10 };

/** The panel to its full height (`full`) or back, counting: the last to let go returns it to its own. */
function setPanelFull(g: Game, full: boolean): void {
  const was = compactPanel(g);
  g.panelFull = Math.max(0, g.panelFull + (full ? 1 : -1));
  const now = compactPanel(g);
  if (was === now) return;
  const t = g.text;
  const current = t.current;
  // The small dungeon map (dungeonMap.ts) is taken off the log while the panel is full - the log shows under the
  // panel as it does anywhere - and put back in a dungeon after.
  if (!now) liftDungeonMap(g);
  if (!now) t.cover(Win.messages, COVER.c1, COVER.r1, COVER.c2, COVER.r2);
  panelWindows(g);
  drawColumn(g);
  clearBorderTitle(g); // the box's top edge was drawn again across it: the regalia worn named again
  if (now) t.uncover();
  drawVitals(g);
  if (now && g.s.mapId > 0x20 && g.s.mapId < 0x80) drawDungeonMap(g);
  t.select(current);
}

/** The panel held at its full height until the returned release is called (a list whose line wants it, magic.ts). */
export function holdFullPanel(g: Game): () => void {
  setPanelFull(g, true);
  let held = true;
  return () => {
    if (held) setPanelFull(g, false);
    held = false;
  };
}

/** `run` with the panel at its full 1988 height (the Standard look), and back to its own after. */
export async function withFullPanel<T>(g: Game, run: () => Promise<T>): Promise<T> {
  setPanelFull(g, true);
  try {
    return await run();
  } finally {
    setPanelFull(g, false);
  }
}

/**
 * The look changed in the middle of a game: the right-hand column laid out for it - the log's window two rows longer
 * or shorter at its top, the rows that change hands emptied - and the party, the borders and (in a dungeon) the view
 * drawn again. The log's cursor stays on its screen row.
 */
export async function relayout(g: Game): Promise<void> {
  liftDungeonMap(g); // the small map's place is the look's own: drawn again for the new one
  const t = g.text;
  const log = t.windows[Win.messages];
  const cursor = log.top + log.y;
  panelWindows(g);
  drawColumn(g);
  t.clearArea(COVER.c1, COVER.r1, COVER.c2, COVER.r2); // the log's in the one look, the panel's in the other
  log.y = Math.max(0, cursor - log.top);
  // The bottom border's band, cleared of the other look's line, then its own.
  const d = g.draw;
  d.pen = 1;
  d.fill(8, 185, 183, 191);
  d.pen = 15;
  d.line(7, 184, 184, 184);
  clearBorderTitle(g);
  drawVitals(g);
  if (g.s.mapId > 0x20 && g.s.mapId < 0x80) {
    const { refresh } = await import('./dungeon.ts');
    refresh(g);
  } else setWind(g, -1);
  t.select(Win.messages);
}
