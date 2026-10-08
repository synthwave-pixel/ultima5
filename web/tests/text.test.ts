import { describe, expect, it } from 'vitest';
import { Ctl, Text, type TextTarget } from '../src/ui/text.ts';

/** A 40 by 25 character screen. */
function screen(): { rows: string[][]; target: TextTarget } {
  const rows = Array.from({ length: 25 }, () => Array<string>(40).fill(' '));
  return {
    rows,
    target: {
      glyph: (_f, code, c, r) => (rows[r][c] = String.fromCharCode(code)),
      clearCells: (c1, r1, c2, r2) => {
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) rows[r][c] = ' ';
      },
      scrollCells: (c1, r1, c2, r2) => {
        for (let r = r1; r < r2; r++) for (let c = c1; c <= c2; c++) rows[r][c] = rows[r + 1][c];
        for (let c = c1; c <= c2; c++) rows[r2][c] = ' ';
      },
    },
  };
}

const line = (rows: string[][], r: number, c1 = 24, c2 = 39) =>
  rows[r]
    .slice(c1, c2 + 1)
    .join('')
    .trimEnd();

describe('Text', () => {
  it('wraps words at the message window edge', () => {
    const { rows, target } = screen();
    const t = new Text(target);
    t.setWindow(2, 24, 11, 39, 23);
    t.select(2);
    t.print('The quick brown fox jumps over the lazy dog.');
    expect([line(rows, 11), line(rows, 12), line(rows, 13)]).toEqual(['The quick brown', 'fox jumps over', 'the lazy dog.']);
  });

  it('scrolls when the window is full', () => {
    const { rows, target } = screen();
    const t = new Text(target);
    t.setWindow(2, 24, 11, 39, 12);
    t.select(2);
    t.print('one\ntwo\nthree');
    expect([line(rows, 11), line(rows, 12)]).toEqual(['two', 'three']);
  });

  it('centres text between the markers', () => {
    const { rows, target } = screen();
    const t = new Text(target);
    t.setWindow(2, 24, 11, 39, 23);
    t.select(2);
    // As the game does it: the centring codes go out on their own (OUTSUBS_0388).
    t.print(Ctl.center);
    t.print('BRITAIN');
    t.print(Ctl.uncenter);
    expect(rows[11].slice(24, 40).join('')).toBe('    BRITAIN     ');
  });

  it('pads numbers', () => {
    const { rows, target } = screen();
    const t = new Text(target);
    t.printNumber(42, 4, ' ');
    t.printNumber(7, 3, '0');
    expect(line(rows, 0, 0, 10)).toBe('  42007');
  });
});
