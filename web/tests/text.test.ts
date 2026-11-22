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

/**
 * A fold taken back (text.ts unfold) or a line given a count (setRow) is drawn again as its cells were drawn - a glyph
 * in another font (Ultima IV's prompt, in its own lettering), a word in its own colour or ink - not in the first font
 * and the window's colours; the count itself in the window's own look.
 */
describe('a fold taken back', () => {
  interface Drawn {
    ch: string;
    font: number;
    fg: number;
    ink: number | null;
  }
  const empty = (): Drawn => ({ ch: ' ', font: -1, fg: 0, ink: null });
  /** A screen that keeps what each cell was last drawn as: its character, font, colour and ink. */
  function drawnScreen(): { at: (r: number, c: number) => Drawn; t: Text; inks: (rgb: number | null) => void } {
    const cells = Array.from({ length: 25 }, () => Array.from({ length: 40 }, empty));
    let ink: number | null = null;
    const target: TextTarget = {
      glyph: (font, code, c, r, fg) => (cells[r][c] = { ch: String.fromCharCode(code), font, fg, ink }),
      clearCells: (c1, r1, c2, r2) => {
        for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) cells[r][c] = empty();
      },
      scrollCells: (c1, r1, c2, r2) => {
        for (let r = r1; r < r2; r++) for (let c = c1; c <= c2; c++) cells[r][c] = cells[r + 1][c];
        for (let c = c1; c <= c2; c++) cells[r2][c] = empty();
      },
      ink: (rgb) => (ink = rgb),
    };
    const t = new Text(target);
    t.setWindow(2, 24, 11, 39, 23);
    t.foldWindow = 2;
    t.select(2);
    t.printChar(0xff);
    // A word's ink set on the screen and kept with its glyphs, as the talk's (talk.ts flushWord).
    const inks = (rgb: number | null): void => {
      target.ink!(rgb);
      t.ink = rgb;
    };
    return { at: (r, c) => cells[r][c], t, inks };
  }
  /** A move's turn: a prompt glyph in font 2 and colour 14, the way after it, then `more` lines in colour 12 (the first
   * letter in an ink of its own). */
  const turn = ({ t, inks }: ReturnType<typeof drawnScreen>, ...more: string[]): void => {
    t.endTurn();
    t.font = 2;
    t.win.fg = 14;
    t.printChar(0x10);
    t.font = 0;
    t.win.fg = 15;
    t.moving = true;
    t.print('North\n');
    for (const text of more) {
      t.win.fg = 12;
      inks(0xff0000); // the first letter in an ink of its own, as a rune word read into English
      t.print(text[0]);
      inks(null);
      t.print(text.slice(1));
      t.win.fg = 15; // the window's own colour again by the line's end, where it folds
      t.print('\n');
    }
  };
  const read = (at: (r: number, c: number) => Drawn, r: number): string =>
    Array.from({ length: 16 }, (_, c) => at(r, 24 + c).ch)
      .join('')
      .trimEnd();

  it('draws a line taken back again in the font, colours and ink it was drawn in', () => {
    const s = drawnScreen();
    const { at } = s;
    turn(s);
    turn(s);
    turn(s, 'Blocked!'); // begins like the last, then says more: the North folded into it is printed again
    expect([read(at, 11), read(at, 12), read(at, 13)]).toEqual(['\x10North (x2)', '\x10North', 'Blocked!']);
    expect(at(12, 24)).toMatchObject({ ch: '\x10', font: 2, fg: 14 });
    expect(at(12, 25)).toMatchObject({ ch: 'N', font: 0, fg: 15 });
    expect(at(13, 24)).toMatchObject({ ch: 'B', font: 0, fg: 12, ink: 0xff0000 });
    expect(at(13, 25)).toMatchObject({ ch: 'l', fg: 12, ink: null });
  });

  it('keeps the cells of a line given a count, the count in the window’s own look', () => {
    const s = drawnScreen();
    const { at } = s;
    turn(s, 'Slow progress!');
    turn(s, 'Slow progress!');
    expect([read(at, 11), read(at, 12)]).toEqual(['\x10North (x2)', 'Slow (x2)']);
    expect(at(11, 24)).toMatchObject({ ch: '\x10', font: 2, fg: 14 });
    expect(at(12, 24)).toMatchObject({ ch: 'S', fg: 12, ink: 0xff0000 });
    expect(at(12, 31)).toMatchObject({ ch: '2', font: 0, fg: 15, ink: null });
  });

  it('draws the words a count cut short again as they were drawn when the count is taken back', () => {
    const s = drawnScreen();
    const { at } = s;
    turn(s, 'Slow progress!');
    turn(s, 'Slow progress!', 'Ouch'); // folds to "Slow (x2)", then is taken back: the words cut for it drawn again
    expect(read(at, 12)).toBe('Slow progress!');
    expect(at(12, 29)).toMatchObject({ ch: 'p', font: 0, fg: 12 });
    expect([read(at, 13), read(at, 14), read(at, 15)]).toEqual(['\x10North', 'Slow progress!', 'Ouch']);
    expect(at(13, 24)).toMatchObject({ ch: '\x10', font: 2, fg: 14 });
    expect(at(14, 24)).toMatchObject({ ch: 'S', fg: 12, ink: 0xff0000 });
    expect(at(14, 30)).toMatchObject({ ch: 'r', fg: 12 });
  });
});
