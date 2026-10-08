/**
 * runeReveal.ts
 *
 * The Standard look reads the runes for the player: a rune letter is shown as the game draws it, and a moment
 * later it dissolves into its English (standard-runes.png, tools/art/runes.ts), a cell at a time in a wave across
 * what was printed, the pixels of the one giving way to the other in a scattered order. A key finishes it at once.
 * Nothing is kept: the next time the runes are printed they are runes again, and dissolve again.
 *
 * This is the bookkeeping - which cells wait, when each begins and how far it has gone. The framebuffer draws.
 */

/** How long the runes are shown before they begin to give way, in milliseconds. */
export const HOLD_MS = 1000;
/** How much later each cell begins than the one before it along the wave: a column, or half a row. */
export const STAGGER_MS = 30;
/** How long one cell takes to dissolve. */
export const DISSOLVE_MS = 300;

/** A rune letter waiting to be read: where it is, what it is, its colours, and when it begins to dissolve. */
export interface RuneCell {
  column: number;
  row: number;
  code: number;
  fg: number;
  bg: number;
  /** The colour page it was drawn on. */
  page: Uint32Array;
  start: number;
  /** What the cell showed before it was drawn (a sign's wall), where the letter's ink leaves it bare; else `bg`. */
  wall?: Uint32Array | undefined;
}

/**
 * The order the pixels of a 32 by 32 cell give way in: each pixel's place in a fixed shuffle, 0 to 1. A pixel shows
 * the English once the cell's progress has passed it.
 */
export const DISSOLVE_ORDER: Float32Array = (() => {
  const order = Array.from({ length: 1024 }, (_, i) => i);
  let seed = 7;
  for (let i = order.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Float32Array(1024);
  order.forEach((v, i) => (rank[v] = i / 1024));
  return rank;
})();

export class RuneReveal {
  private cells: RuneCell[] = [];
  /** The first cell of what is being printed, from which the wave runs. */
  private origin: [number, number] = [0, 0];

  /** Whether any cell waits. */
  get active(): boolean {
    return this.cells.length > 0;
  }

  /** A rune letter drawn at (column, row) at `now`, to be read in its turn. */
  add(column: number, row: number, code: number, fg: number, bg: number, page: Uint32Array, now: number): void {
    this.forget(column, row, column, row);
    if (!this.cells.length) this.origin = [column, row];
    const along = Math.max(0, column - this.origin[0] + (row - this.origin[1]) * 2);
    this.cells.push({ column, row, code, fg, bg, page, start: now + HOLD_MS + along * STAGGER_MS });
  }

  /** A rune letter drawn at (column, row), to begin to dissolve at `start` (a sign read by its own clock, readSign). */
  addAt(column: number, row: number, code: number, fg: number, bg: number, page: Uint32Array, start: number, wall?: Uint32Array): RuneCell {
    this.forget(column, row, column, row);
    const cell = { column, row, code, fg, bg, page, start, wall };
    this.cells.push(cell);
    return cell;
  }

  /** The cells in (c1, r1)-(c2, r2) drawn over or cleared: nothing there to read now (on `page`, or any). */
  forget(c1: number, r1: number, c2: number, r2: number, page?: Uint32Array): void {
    this.cells = this.cells.filter((c) => (page && c.page !== page) || c.column < c1 || c.column > c2 || c.row < r1 || c.row > r2);
  }

  /** The rectangle (c1, r1)-(c2, r2) moved up a row (a window scrolling): its cells with it, the top row's gone. */
  scroll(c1: number, r1: number, c2: number, r2: number, page: Uint32Array): void {
    this.forget(c1, r1, c2, r1, page);
    for (const c of this.cells) if (c.page === page && c.column >= c1 && c.column <= c2 && c.row > r1 && c.row <= r2) c.row--;
  }

  /**
   * Each waiting cell's progress at `now` given to `draw` (0 the rune, 1 the English) for those that have begun;
   * those done are let go.
   */
  step(now: number, draw: (cell: RuneCell, progress: number) => void): void {
    this.cells = this.cells.filter((c) => {
      if (now < c.start) return true;
      const k = Math.min(1, (now - c.start) / DISSOLVE_MS);
      draw(c, k);
      return k < 1;
    });
  }

  /** Every waiting cell to its English at once (a key pressed). */
  finish(draw: (cell: RuneCell, progress: number) => void): void {
    for (const c of this.cells) draw(c, 1);
    this.cells = [];
  }
}
