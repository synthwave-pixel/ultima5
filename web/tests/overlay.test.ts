import { describe, expect, it } from 'vitest';
import { Text, type TextTarget } from '../src/ui/text.ts';

/**
 * Overlays over a text window (text.ts cover): while one lies over part of a window, the window goes on - printing,
 * scrolling, folding - only unseen there; other windows draw over it; and when it is taken away, the window's cells
 * are drawn as they now are, character, colour and caps. The test of it: a covered window, once uncovered, reads
 * exactly as the same window never covered.
 */

interface Seen {
  ch: string;
  fg: number;
  cap: number;
}

/** A 40 by 25 character screen that keeps each cell's character, colour, and whether a cap was drawn there. */
function screen(): { cells: Seen[][]; target: TextTarget } {
  const cells = Array.from({ length: 25 }, () => Array.from({ length: 40 }, (): Seen => ({ ch: ' ', fg: 0, cap: 0 })));
  return {
    cells,
    target: {
      glyph: (_f, code, c, r, fg) => (cells[r][c] = { ch: String.fromCharCode(code), fg, cap: 0 }),
      cap: (side, c, r, fg) => (cells[r][c] = { ch: String.fromCharCode(side), fg, cap: side }),
      clearCells: (c1, r1, c2, r2) => {
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cells[r][c] = { ch: ' ', fg: 0, cap: 0 };
      },
      scrollCells: (c1, r1, c2, r2) => {
        for (let r = r1; r < r2; r++) for (let c = c1; c <= c2; c++) cells[r][c] = cells[r + 1][c];
        for (let c = c1; c <= c2; c++) cells[r2][c] = { ch: ' ', fg: 0, cap: 0 };
      },
    },
  };
}

const LOG = 2;
const PANEL = 1;
const text = (cells: Seen[][], r: number): string =>
  cells[r]
    .slice(24, 40)
    .map((c) => c.ch)
    .join('')
    .trimEnd();

/** A log (window 2, rows 9-23 of the right-hand column, folding) and a panel window (1) that may lie over its top. */
function setup(): { t: Text; cells: Seen[][] } {
  const { cells, target } = screen();
  const t = new Text(target);
  t.setWindow(PANEL, 24, 1, 39, 10);
  t.setWindow(LOG, 24, 9, 39, 23);
  t.foldWindow = LOG;
  return { t, cells };
}

/** A turn in the log: its prompt's cap, then its lines, some in a colour of their own. */
function turn(t: Text, lines: string[], colour = 15): void {
  t.select(LOG);
  t.printCap(2);
  t.moving = true; // a move, as the game marks one: its repeats fold
  for (const l of lines) {
    t.win.fg = colour;
    t.print(l);
    t.win.fg = 15;
    t.printChar(0x0a);
  }
  t.endTurn();
}

/** Some turns of play: enough to scroll the log a long way, with repeats that fold. */
function play(t: Text, from: number, to: number): void {
  for (let n = from; n < to; n++) {
    turn(t, [`Turn ${n}`], n % 3 === 0 ? 12 : 15);
    if (n % 4 === 0) turn(t, [`Turn ${n}`], n % 3 === 0 ? 12 : 15); // the same again: it folds, "(x2)"
  }
}

describe('an overlay over a text window', () => {
  it('leaves the window, once uncovered, reading exactly as if it had never been covered', () => {
    const plain = setup();
    play(plain.t, 0, 30);
    const covered = setup();
    play(covered.t, 0, 3);
    covered.t.cover(LOG, 24, 9, 39, 10);
    play(covered.t, 3, 30);
    covered.t.uncover();
    expect(covered.cells).toEqual(plain.cells);
  });

  it('shows what another window draws over the covered cells, and none of what the covered window prints there', () => {
    const { t, cells } = setup();
    play(t, 0, 20);
    t.cover(LOG, 24, 9, 39, 10);
    t.select(PANEL);
    t.moveTo(0, 8);
    t.print('F:63  G:150');
    t.moveTo(0, 9);
    t.print('4-5-139');
    play(t, 20, 25); // the log scrolls under it
    expect(text(cells, 9)).toBe('F:63  G:150');
    expect(text(cells, 10)).toBe('4-5-139');
    t.uncover();
    expect(text(cells, 9)).toMatch(/^.Turn/); // the log's again: a prompt's cap and a turn
    expect(cells[9][24].cap).toBe(2);
  });

  it('keeps a colour and a cap printed under the cover, and folds a repeat into a covered line', () => {
    const plain = setup();
    const covered = setup();
    for (const { t } of [plain, covered]) {
      // Fourteen turns fill the log to its last row, the last turn's line on row 9 and 10 once it has scrolled.
      play(t, 0, 16);
      if (t === covered.t) t.cover(LOG, 24, 9, 39, 10);
      turn(t, ['Blocked!'], 12);
      turn(t, ['Blocked!'], 12); // folds into the line above: "Blocked! (x2)"
      for (let i = 0; i < 12; i++) turn(t, [`Walk ${i}`]); // and scrolls it up under the cover
      if (t === covered.t) t.uncover();
    }
    expect(covered.cells).toEqual(plain.cells);
    const all = covered.cells.map((r) => r.map((c) => c.ch).join('')).join('\n');
    expect(all).toContain('Blocked! (x2)');
  });

  it('lays one cover at a time', () => {
    const { t } = setup();
    t.cover(LOG, 24, 9, 39, 10);
    expect(() => t.cover(LOG, 24, 11, 39, 12)).toThrow();
    t.uncover();
    expect(() => t.cover(LOG, 24, 11, 39, 12)).not.toThrow();
  });
});
