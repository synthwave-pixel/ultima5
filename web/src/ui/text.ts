/**
 * text.ts
 *
 * The DOS game's four text windows and its printing rules, after u5d
 * 1000.c: ULTIMA_16ba_PrintChar (control codes, the cursor, wrapping at the
 * right edge and scrolling at the bottom), ULTIMA_1850_PrintString (word
 * wrap and centring) and ULTIMA_1a3e_PrintNumber.
 *
 * Drawing goes through a small interface, so the rules are tested without
 * a canvas.
 *
 * The port's own (from the ultima3 port): in the message window a move
 * that prints what the move before it printed folds into it with counts -
 * "North (x5)" over "Blocked! (x5)" - instead of marching down the window,
 * and a count of the steps taken. Only moves fold (the game says which,
 * `moving`); anything else said again is said again in full. A diagonal
 * walk is two ways in turn - North, East, North, East - so a move that
 * prints what the move two back printed folds into that one, while the two
 * have gone strictly in turn: "North (x3)" over "East (x3)".
 *
 * The port's own too: a record of every cell the text layer has drawn - its
 * character, font, colours, underline, and the border's caps (printCap) -
 * so that any of it can be drawn again exactly; and overlays built on it.
 * `cover` lays something over part of a window (the Standard look's full-
 * height party panel over the top of the log): while it is there, what
 * that window writes or scrolls inside the covered rectangle goes on in a
 * record of its own, unseen - folding, scrolling and the cursor none the
 * wiser - and every other window draws over it as usual. `uncover` puts
 * the window's record back and draws the covered cells as they now are,
 * so nothing the window printed meanwhile is lost. One cover at a time.
 */

export const CLEAR_WINDOW = 0xff;
export const TOGGLE_UNDERLINE = 0xfe;
export const TOGGLE_INVERSE = 0xfd;
export const CENTER = 0xfc;
export const UNCENTER = 0xfb;

/** Control codes as one-character strings, for building printed text. */
export const Ctl = {
  clear: String.fromCharCode(CLEAR_WINDOW),
  underline: String.fromCharCode(TOGGLE_UNDERLINE),
  inverse: String.fromCharCode(TOGGLE_INVERSE),
  center: String.fromCharCode(CENTER),
  uncenter: String.fromCharCode(UNCENTER),
};

export interface TextTarget {
  /** Draw `code` at screen cell (column, row); `again` when drawn again from the record (an overlay lifted, a scroll under it). */
  glyph(font: number, code: number, column: number, row: number, fg: number, bg: number, underline: boolean, again?: boolean): void;
  /**
   * Draw a border's cap at (column, row): its glyph (`side`, 2 the left cap and 1 the right) and the two white lines
   * that join it to the border (ULTIMA_4c2a, ULTIMA_4cce). A target without it draws the glyph alone.
   */
  cap?(side: number, column: number, row: number, fg: number, bg: number): void;
  /** Fill cells (c1, r1)-(c2, r2) inclusive with a colour. */
  clearCells(c1: number, r1: number, c2: number, r2: number, colour: number): void;
  /** Scroll cells (c1, r1)-(c2, r2) up one text row, clearing the last. */
  scrollCells(c1: number, r1: number, c2: number, r2: number, colour: number): void;
  /**
   * The colour a rune word reads into English in (0xRRGGBB), for the glyphs drawn until it is set again (null): the
   * talk's, as it prints the word (talk.ts flushWord) - and again from the record, for a glyph drawn later (Text.ink).
   */
  ink?(rgb: number | null): void;
}

export interface TextWindow {
  left: number;
  top: number;
  right: number;
  bottom: number;
  x: number;
  y: number;
  fg: number;
  bg: number;
  center: boolean;
  /**
   * How many rows have been begun in this window, counting those that have scrolled off the top and those a long
   * line wrapped onto: the current row's number. The difference between two readings is how far up the window
   * something has moved, whether it scrolled or not.
   */
  started: number;
}

/** What a screen cell shows, as the text layer drew it: enough to draw it again (Text.cover). */
interface Cell {
  ch: string;
  /** The font it was drawn in (0 IBM.CH, 1 RUNES.CH), or -1 for a cell cleared rather than drawn. */
  font: number;
  fg: number;
  bg: number;
  underline: boolean;
  /** A border's cap: 2 the left, 1 the right (Text.printCap); 0 a plain glyph. */
  cap: number;
  /** The colour its rune word reads into English in (Text.ink), where it was written in one. */
  ink?: number;
}

const blank = (bg = 0): Cell => ({ ch: ' ', font: -1, fg: 15, bg, underline: false, cap: 0 });

/** An overlay over part of a window: the window, the rectangle (screen cells, inclusive), and the window's record under it. */
interface Cover {
  window: number;
  c1: number;
  r1: number;
  c2: number;
  r2: number;
  under: Cell[][];
}

/**
 * A turn's lines in the message window: each line's text, its cells as drawn, and the number of the row it is on
 * (TextWindow.started).
 */
interface Block {
  texts: string[];
  /**
   * Each line's cells, as drawn: a line taken back or given a count is drawn again from them, in the font, colours and
   * ink each cell was drawn in (a game's own prompt glyph, a word in its own colour), not in the first font.
   */
  cells: Cell[][];
  rows: number[];
  /** Whether each line only wrapped onto the next, the message going on there. */
  soft: boolean[];
}

/** A turn's block once printed: how often each line has repeated, and whether the turn was a move. */
type Folded = Block & { counts: number[]; moving: boolean };

const noLines = (): Block => ({ texts: [], cells: [], rows: [], soft: [] });

export class Text {
  readonly windows: TextWindow[];
  current = 0;
  inverse = false;
  underline = false;
  /** 0 is IBM.CH, 1 RUNES.CH. */
  font = 0;
  /**
   * The colour the rune word being written reads into English in (0xRRGGBB), or null: kept with each glyph, so one
   * drawn later from the record - the Dialog setting's box (showStaged), a change of look (repaint) - reads in it too.
   */
  ink: number | null = null;
  /** Whether a printed character advances the cursor (D_538e). */
  advance = true;
  /** The window whose turns fold (the message window), or -1 for none. */
  foldWindow = -1;

  /** What each screen cell shows, as drawn (a space where empty): a line read back and compared, a cell drawn again. */
  private readonly cells: Cell[][] = Array.from({ length: 25 }, () => Array.from({ length: 40 }, () => blank()));
  /**
   * The window written off the screen (the Dialog setting's speech, speech.ts), or -1: what is written in it is kept in
   * a record of its own and drawn nowhere, till shown where it is wanted (showStaged), sized to what it holds.
   */
  stageWindow = -1;
  private readonly staged: Cell[][] = Array.from({ length: 25 }, () => Array.from({ length: 40 }, () => blank()));
  /** Whether the window written in now is the one off the screen. */
  private get staging(): boolean {
    return this.current >= 0 && this.current === this.stageWindow;
  }
  /** The overlay laid over part of a window, if one is (cover). */
  private covering: Cover | null = null;
  /** The cap the next glyph is (printCap), or 0. */
  private capNext = 0;
  /**
   * Folding: the last turn's block of lines and how often each has repeated; this turn's lines; how many of this
   * turn's lines have folded into the last's so far; whether this turn has already gone its own way.
   */
  private prev: Folded | null = null;
  /**
   * The block above the last one, while the two are moves gone strictly in turn (a diagonal walk): a move may fold into
   * it when the last turn went the other way. Null when they are not.
   */
  private before: Folded | null = null;
  /** Which of the two the last turn went into: true for the upper one (before). */
  private wentBefore = false;
  /** The block this turn is folding into (prev or before), chosen at its first line. */
  private target: Folded | null = null;
  /** This turn is a move (the game says so as it begins one): it may fold into the last, if that was a move too. */
  moving = false;
  private turn: Block = noLines();
  private folded = 0;
  /** The lines of this turn folded so far, as they were drawn: drawn so again if the fold is taken back (unfold). */
  private taken: Cell[][] = [];
  private broken = false;
  /** Whether the newline being printed is print's own, wrapping a long message (a soft break). */
  private soft = false;

  constructor(private readonly out: TextTarget) {
    this.windows = Array.from({ length: 5 }, () => ({
      left: 0,
      top: 0,
      right: 39,
      bottom: 24,
      x: 0,
      y: 0,
      fg: 15,
      bg: 0,
      center: false,
      started: 0,
    }));
  }

  get win(): TextWindow {
    return this.windows[this.current];
  }

  /** ULTIMA_1c22_SetTextWindowSize. */
  setWindow(id: number, left: number, top: number, right: number, bottom: number): void {
    const w = this.windows[id];
    w.left = Math.max(0, left);
    w.top = Math.max(0, top);
    w.right = Math.min(39, right);
    w.bottom = Math.min(24, bottom);
  }

  select(id: number): void {
    this.current = id;
  }

  /** ULTIMA_1bf2_SetTextPosition: ignored when off the screen. The cursor put anywhere in the fold window breaks a run. */
  moveTo(x: number, y: number): void {
    const w = this.win;
    if (x + w.left < 40 && y + w.top < 25) {
      if (this.current === this.foldWindow && (x !== w.x || y !== w.y)) this.forget();
      w.x = x;
      w.y = y;
    }
  }

  printChar(ch: number): void {
    const w = this.win;
    if (ch > 0x7f) {
      switch (ch) {
        case CLEAR_WINDOW:
          w.x = w.y = 0;
          this.clearCells(w.left, w.top, w.right, w.bottom, w.bg);
          if (this.current === this.foldWindow) this.forget();
          return;
        case TOGGLE_UNDERLINE:
          this.underline = !this.underline;
          return;
        case TOGGLE_INVERSE:
          this.inverse = !this.inverse;
          return;
        case CENTER:
          w.center = true;
          return;
        case UNCENTER:
          w.center = false;
          return;
      }
      ch &= 0x7f;
    }
    if (ch !== 0x0a) {
      if (ch !== 0x0d) {
        const [fg, bg] = this.inverse ? [w.bg, w.fg] : [w.fg, w.bg];
        this.glyph(this.font, ch, w.x + w.left, w.y + w.top, fg, bg);
        if (!this.advance) return;
        w.x++;
        if (w.x + w.left <= w.right) return;
        this.lineEnd(true);
        return;
      }
      w.x = 0;
      return;
    }
    this.lineEnd(this.soft);
  }

  /** The end of a line - by a newline, or a long line wrapping: in the fold window it may fold; else a new row. */
  private lineEnd(soft: boolean): void {
    const w = this.win;
    w.x = 0;
    if (this.current === this.foldWindow && this.fold(soft)) return;
    this.nextRow();
  }

  /** The cursor to the start of the next row, the window scrolling under it at the bottom. */
  private nextRow(): void {
    const w = this.win;
    w.x = 0;
    w.y++;
    w.started++;
    if (w.bottom < w.y + w.top) {
      w.y--;
      this.scrollCells(w.left, w.top, w.right, w.bottom, w.bg);
    }
  }

  /** One row of the current window emptied, in its background colour. */
  clearRow(y: number): void {
    const w = this.win;
    if (y < 0 || y + w.top > w.bottom) return;
    this.clearCells(w.left, w.top + y, w.right, w.top + y, w.bg);
  }

  // --- Folding repeated turns (the port's, from the ultima3 port) ---------------------------------------------

  /**
   * A new turn begins (the command prompt): the block just printed becomes the one the next turn may fold into. A
   * turn that matched only the head of the last one is shown whole after all.
   */
  endTurn(): void {
    const prev = this.prev;
    const was = this.current;
    if (this.foldWindow >= 0) this.current = this.foldWindow;
    const into = this.target;
    if (this.folded > 0 && into && this.folded < into.texts.length) this.unfold(null);
    this.current = was;
    if (this.turn.texts.length > 0) {
      // A turn of its own: the two at the bottom go strictly in turn if they are moves, the upper one a single turn.
      const block: Folded = { ...this.turn, counts: this.turn.texts.map(() => 1), moving: this.moving };
      const single = prev !== null && prev.moving && this.moving && prev.counts.every((n) => n === 1);
      this.before = single ? prev : null;
      this.prev = block;
      this.wentBefore = false;
    } else if (into === this.before) this.wentBefore = true;
    else if (into === prev) {
      // Folded into the last one: in turn if the turn before went into the upper one, else a repeat, which ends it.
      if (!this.wentBefore) this.before = null;
      this.wentBefore = false;
    }
    this.target = null;
    this.moving = false;
    this.turn = noLines();
    this.folded = 0;
    this.taken = [];
    this.broken = false;
  }

  /** Nothing to fold into: the window cleared, or the cursor put somewhere of the game's choosing. */
  private forget(): void {
    this.prev = null;
    this.before = null;
    this.target = null;
    this.turn = noLines();
    this.folded = 0;
    this.taken = [];
    this.broken = true;
  }

  /** Where row `n` (TextWindow.started) of the current window is now, or -1 if it has scrolled away. */
  private rowAt(n: number): number {
    const w = this.win;
    const y = w.y - (w.started - n);
    return y >= 0 ? y : -1;
  }

  /**
   * Recolour what window `id` has written since its row count was `since` (TextWindow.started) - those rows still in
   * sight - from colour `from` to `to`: its letters only, drawn again (the Modern karma's tint on the words of a deed).
   */
  recolourSince(id: number, since: number, from: number, to: number): void {
    const w = this.windows[id];
    const first = w.y - (w.started - since);
    const r1 = w.top + Math.max(0, first);
    const r2 = w.top + w.y;
    const record = id === this.stageWindow ? this.staged : this.cells;
    for (let r = r1; r <= Math.min(r2, w.bottom); r++)
      for (let c = w.left; c <= w.right; c++) {
        const cell = record[r][c];
        if (cell.font >= 0 && cell.fg === from) cell.fg = to;
      }
    if (id !== this.stageWindow) this.redraw(w.left, r1, w.right, Math.min(r2, w.bottom), true);
  }

  /** What cells (c1..c2) of screen row `row` read as drawn (a cleared cell a space): the Standard look's marks check it. */
  screenText(row: number, c1: number, c2: number): string {
    let text = '';
    for (let c = c1; c <= c2; c++) text += this.at(row, c).ch;
    return text;
  }

  /** The cells of row `y` of the current window, as drawn (copies). */
  private rowCells(y: number): Cell[] {
    const w = this.win;
    const cells: Cell[] = [];
    for (let c = w.left; c <= w.right; c++) cells.push({ ...this.at(w.top + y, c) });
    return cells;
  }

  /** `text` as cells in the window's own look - the first font, its colours: a count added to a line (counted). */
  private plain(text: string): Cell[] {
    const w = this.win;
    return [...text].map((ch) => ({ ch, font: 0, fg: w.fg, bg: w.bg, underline: false, cap: 0 }));
  }

  /**
   * Row `y` of the current window made to show `line`: from the first place it reads differently, so what is kept -
   * the prompt's arrow, a word in its own colour - stays as it was drawn, and a count is simply added after it; and
   * from there each cell drawn as it was drawn (its font, colours, ink, a border's cap: the prompt's arrow in the
   * border's blue, as frame.ts capArrow prints it - the frame knows its caps by it), a space that looks as the cleared
   * row does left cleared.
   */
  private setRow(y: number, line: Cell[]): void {
    const w = this.win;
    const width = w.right - w.left + 1;
    const want = (i: number): Cell => line[i] ?? blank(w.bg);
    let from = 0;
    while (from < width && this.at(w.top + y, w.left + from).ch === want(from).ch) from++;
    if (from >= width) return;
    this.clearCells(w.left + from, w.top + y, w.right, w.top + y, w.bg);
    for (let i = from; i < width; i++) {
      const cell = want(i);
      if (cell.ch === ' ' && cell.bg === w.bg && !cell.underline) continue;
      this.put(w.top + y, w.left + i, cell);
    }
  }

  /**
   * Line `k` of the last turn's block as it reads: with its count, " (x3)", the text cut short where both would not
   * fit the window - at the last whole word that does ("Slow (x2)" for "Slow progress!", not "Slow progre (x2)"), or
   * the letters that fit where not even the first word does - but for a line a long message only wrapped from, whose
   * count is the one on the message's last. The line's own cells as drawn; the count in the window's own look.
   */
  private counted(block: Folded, k: number): Cell[] {
    const line = block.cells[k];
    const count = block.counts[k];
    if (count < 2 || block.soft[k]) return line;
    const tail = ` (x${count})`;
    const width = this.win.right - this.win.left + 1;
    const room = Math.max(0, width - tail.length);
    const whole = block.texts[k];
    const words = whole.slice(0, room + 1).lastIndexOf(' ');
    const kept = whole.length <= room ? whole : (words > 0 ? whole.slice(0, words) : whole.slice(0, room)).trimEnd();
    return [...line.slice(0, kept.length), ...this.plain(tail)];
  }

  /**
   * At the end of a line: if this turn has matched the last turn's block so far, straight below it, and this line
   * matches its next line too, fold it in - count up, leave the cursor where the line began - and say so. Otherwise
   * the line is the turn's own; lines folded earlier in this turn are taken back and printed again ahead of it, so a
   * turn that only begins like the last one is shown whole.
   */
  private fold(soft: boolean): boolean {
    const w = this.win;
    const drawn = this.rowCells(w.y);
    const raw = drawn
      .map((c) => c.ch)
      .join('')
      .trimEnd();
    const k = this.folded;
    const same = (b: Folded | null): b is Folded =>
      b !== null && k < b.texts.length && b.texts[k] === raw && b.soft[k] === soft && this.rowAt(b.rows[k]) >= 0;
    if (k === 0 && !this.broken && this.moving && raw !== '') {
      // The last block, straight above; or, the last turn having gone the other way, the block above that one.
      const last = this.prev;
      const lastBelow = last !== null && last.moving && last.rows[last.rows.length - 1] === w.started - 1;
      const up = this.before;
      if (lastBelow && same(last)) this.target = last;
      else if (lastBelow && !this.wentBefore && up && up.rows[up.rows.length - 1] === last.rows[0] - 1 && same(up)) this.target = up;
    }
    const into = this.target;
    if (!this.broken && this.moving && raw !== '' && same(into)) {
      into.counts[k]++;
      this.taken.push(drawn);
      this.clearRow(w.y);
      this.setRow(this.rowAt(into.rows[k]), this.counted(into, k));
      this.folded++;
      return true;
    }
    if (this.folded > 0) this.unfold(drawn);
    this.broken = true;
    this.turn.texts.push(raw);
    this.turn.cells.push(drawn);
    this.turn.rows.push(w.started);
    this.turn.soft.push(soft);
    return false;
  }

  /**
   * Take back the lines folded this turn and print them again as its own, as they were drawn, ahead of `pending` (the
   * line on the cursor's row, as drawn).
   */
  private unfold(pending: Cell[] | null): void {
    const prev = this.target!;
    const w = this.win;
    const lines = this.taken;
    const soft = prev.soft.slice(0, this.folded);
    this.taken = [];
    lines.forEach((_, i) => {
      prev.counts[i]--;
      const y = this.rowAt(prev.rows[i]);
      if (y >= 0) this.setRow(y, this.counted(prev, i));
    });
    this.folded = 0;
    lines.forEach((cells, i) => {
      this.setRow(w.y, cells);
      this.turn.texts.push(prev.texts[i]);
      this.turn.cells.push(cells);
      this.turn.rows.push(w.started);
      this.turn.soft.push(soft[i]);
      this.nextRow();
    });
    if (pending !== null) this.setRow(w.y, pending);
  }

  // --- The screen, with what it shows kept -------------------------------------------------------------------

  /**
   * A border's cap at the cursor, as printChar prints: its glyph (2 the left cap, 1 the right) and the two white lines
   * joining it to the border, kept in the record like any glyph so it is drawn again with it.
   */
  printCap(side: number): void {
    this.capNext = side;
    this.printChar(side);
    this.capNext = 0;
  }

  /**
   * Lay an overlay over window `window`'s cells (c1, r1)-(c2, r2) of the screen: from now until uncover, what that
   * window draws there is kept but not drawn, and what other windows draw there is drawn. One at a time.
   */
  cover(window: number, c1: number, r1: number, c2: number, r2: number): void {
    if (this.covering) throw new Error('a cover is already laid');
    const under: Cell[][] = [];
    for (let r = r1; r <= r2; r++) under.push(this.cells[r].slice(c1, c2 + 1).map((cell) => ({ ...cell })));
    this.covering = { window, c1, r1, c2, r2, under };
  }

  /** Take the overlay away: the window's record put back, and its cells drawn as they now are. */
  uncover(): void {
    const k = this.covering;
    if (!k) return;
    this.covering = null;
    for (let r = k.r1; r <= k.r2; r++) for (let c = k.c1; c <= k.c2; c++) this.cells[r][c] = k.under[r - k.r1][c - k.c1];
    this.redraw(k.c1, k.r1, k.c2, k.r2);
  }

  /** Cells (c1, r1)-(c2, r2) emptied in `colour`, whatever window is current (a layout's change of hands). */
  clearArea(c1: number, r1: number, c2: number, r2: number, colour = 0): void {
    const was = this.current;
    this.current = -1;
    this.clearCells(c1, r1, c2, r2, colour);
    this.current = was;
  }

  /**
   * Cells (c1, r1)-(c2, r2) as they are now kept: the function returned puts them back and draws them, whatever has
   * been written over them since (the Pause menu over a townsman's box: speech.ts).
   */
  keep(c1: number, r1: number, c2: number, r2: number): () => void {
    const kept = this.cells.slice(r1, r2 + 1).map((row) => row.slice(c1, c2 + 1).map((cell) => ({ ...cell })));
    return () => {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.cells[r][c] = { ...kept[r - r1][c - c1] };
      this.redraw(c1, r1, c2, r2);
    };
  }

  /** Whether cell (row, column) is under the cover for what the current window draws: kept, not drawn. */
  private hidden(row: number, column: number): boolean {
    const k = this.covering;
    return !!k && this.current === k.window && row >= k.r1 && row <= k.r2 && column >= k.c1 && column <= k.c2;
  }

  /** The record of cell (row, column) as the current window sees it: its own under a cover, else the screen's. */
  private at(row: number, column: number): Cell {
    if (this.staging) return this.staged[row][column];
    const k = this.covering;
    if (k && this.hidden(row, column)) return k.under[row - k.r1][column - k.c1];
    return this.cells[row][column];
  }

  private set(row: number, column: number, cell: Cell): void {
    if (this.staging) {
      this.staged[row][column] = cell;
      return;
    }
    const k = this.covering;
    if (k && this.hidden(row, column)) k.under[row - k.r1][column - k.c1] = cell;
    else this.cells[row][column] = cell;
  }

  /** Whether any of cells (c1, r1)-(c2, r2) lie under the cover for the current window. */
  private covers(c1: number, r1: number, c2: number, r2: number): boolean {
    const k = this.covering;
    return !!k && this.current === k.window && r1 <= k.r2 && r2 >= k.r1 && c1 <= k.c2 && c2 >= k.c1;
  }

  /**
   * Cells (c1, r1)-(c2, r2) drawn again as the record reads, but for any under the cover: a change of look, after which
   * the screen has let go of the lettering it drew (layout.ts relayout). `inked`: only the cells with a character,
   * those without left as they are - a border, whose chrome a blank cell's colour would paint over.
   */
  repaint(c1: number, r1: number, c2: number, r2: number, inked = false): void {
    this.redraw(c1, r1, c2, r2, inked);
  }

  /** Draw cells (c1, r1)-(c2, r2) again from the record, but for any under the cover (and, `inked`, any blank). */
  private redraw(c1: number, r1: number, c2: number, r2: number, inked = false): void {
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++) {
        if (this.hidden(r, c)) continue;
        const cell = this.cells[r][c];
        if (cell.font < 0 && inked) continue;
        if (cell.font < 0) this.out.clearCells(c, r, c, r, cell.bg);
        else if (cell.cap && this.out.cap) this.out.cap(cell.cap, c, r, cell.fg, cell.bg);
        else this.inked(cell, () => this.out.glyph(cell.font, cell.ch.charCodeAt(0), c, r, cell.fg, cell.bg, cell.underline, true));
      }
  }

  /** A glyph from the record drawn in the colour its rune word reads in, where it has one (Text.ink). */
  private inked(cell: Cell, draw: () => void): void {
    if (cell.ink === undefined || !this.out.ink) return draw();
    this.out.ink(cell.ink);
    draw();
    this.out.ink(this.ink);
  }

  /** A cell drawn again where it now goes, as it was drawn (a line folded: setRow), and kept in the record as glyph keeps it. */
  private put(row: number, column: number, cell: Cell): void {
    if (cell.font < 0) return this.clearCells(column, row, column, row, cell.bg);
    this.set(row, column, { ...cell });
    if (this.staging || this.hidden(row, column)) return;
    if (cell.cap && this.out.cap) this.out.cap(cell.cap, column, row, cell.fg, cell.bg);
    else this.inked(cell, () => this.out.glyph(cell.font, cell.ch.charCodeAt(0), column, row, cell.fg, cell.bg, cell.underline));
  }

  private glyph(font: number, code: number, column: number, row: number, fg: number, bg: number): void {
    const cap = this.capNext;
    const cell: Cell = { ch: String.fromCharCode(code), font, fg, bg, underline: this.underline, cap };
    if (this.ink !== null) cell.ink = this.ink;
    this.set(row, column, cell);
    if (this.staging || this.hidden(row, column)) return;
    if (cap && this.out.cap) this.out.cap(cap, column, row, fg, bg);
    else this.out.glyph(font, code, column, row, fg, bg, this.underline);
  }

  private clearCells(c1: number, r1: number, c2: number, r2: number, colour: number): void {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.set(r, c, blank(colour));
    if (this.staging) return;
    if (!this.covers(c1, r1, c2, r2)) return this.out.clearCells(c1, r1, c2, r2, colour);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (!this.hidden(r, c)) this.out.clearCells(c, r, c, r, colour);
  }

  private scrollCells(c1: number, r1: number, c2: number, r2: number, colour: number): void {
    for (let r = r1; r < r2; r++) for (let c = c1; c <= c2; c++) this.set(r, c, this.at(r + 1, c));
    for (let c = c1; c <= c2; c++) this.set(r2, c, blank(colour));
    if (this.staging) return;
    // Under a cover the screen cannot simply be moved up a row - the overlay would move with it: what shows is drawn
    // again from the record instead.
    if (!this.covers(c1, r1, c2, r2)) return this.out.scrollCells(c1, r1, c2, r2, colour);
    this.redraw(c1, r1, c2, r2);
  }

  /** The rows of the window off the screen (stageWindow), from its top: each as text, its trailing spaces off. */
  stagedLines(): string[] {
    const w = this.windows[this.stageWindow];
    if (!w) return [];
    const lines: string[] = [];
    for (let r = w.top; r <= w.bottom; r++)
      lines.push(
        this.staged[r]
          .slice(w.left, w.right + 1)
          .map((c) => c.ch)
          .join('')
          .trimEnd(),
      );
    return lines;
  }

  /**
   * Rows `from`..`from + count - 1` of the window off the screen drawn on the screen with their first column at
   * (`column`, `row`) - each letter in its own font and colour - `width` columns of them.
   */
  showStaged(from: number, count: number, column: number, row: number, width: number): void {
    const w = this.windows[this.stageWindow];
    for (let r = 0; r < count; r++)
      for (let c = 0; c < width; c++) {
        const cell = this.staged[w.top + from + r]?.[w.left + c];
        const [x, y] = [column + c, row + r];
        if (!cell || x > 39 || y > 24) continue;
        this.cells[y][x] = { ...cell };
        if (cell.font < 0) this.out.clearCells(x, y, x, y, cell.bg);
        else this.inked(cell, () => this.out.glyph(cell.font, cell.ch.charCodeAt(0), x, y, cell.fg, cell.bg, cell.underline));
      }
  }

  /** The first `n` rows of the window off the screen let go, those under them moved up in their place. */
  dropStaged(n: number): void {
    const w = this.windows[this.stageWindow];
    if (!w) return;
    for (let r = w.top; r <= w.bottom; r++)
      for (let c = w.left; c <= w.right; c++) this.staged[r][c] = r + n <= w.bottom ? this.staged[r + n][c] : blank(w.bg);
    if (w.y < n) w.x = 0; // its own row gone too: the next begins at the top
    w.y = Math.max(0, w.y - n);
  }

  /** A newline of print's own, wrapping a long message: the message goes on, and a count waits for its end (fold). */
  private softBreak(): void {
    this.soft = true;
    this.printChar(0x0a);
    this.soft = false;
  }

  /** ULTIMA_1850_PrintString: word-wrapped to the window, centred while centring is on. */
  print(s: string): void {
    if (s.length === 0) return;
    const at = (i: number): number => (i < s.length ? s.charCodeAt(i) : 0);
    const isBreak = (c: number): boolean => c === 0x0a || c === 0x0d || c === 0;
    const w = this.win;
    const width = w.right - w.left;
    const buf: number[] = [];
    let i = 0;
    let done = false;
    let wrapped = false;
    do {
      if (wrapped) this.softBreak();
      wrapped = false;
      let skipLead = false;
      let start = 0;
      const remaining = width - w.x;
      let c = 0;
      for (; !isBreak(at(i)) && c <= remaining; i++, c++) buf[c] = at(i);
      if (c === 0) {
        if (at(i) !== 0) this.printChar(at(i++));
        else done = true;
        continue;
      }
      if (c > remaining) {
        const savedC = c;
        const savedI = i;
        for (; at(i) !== 0x20 && c !== 0 && !isBreak(at(i)); c--, i--);
        if (c === 0) {
          c = savedC;
          i = savedI;
          if (w.x !== 0) {
            this.softBreak();
            skipLead = true;
          }
        } else {
          do c--;
          while (buf[c] === 0x20 || buf[c] === 0x0d || buf[c] === 0x0a);
          if (at(i) !== 0) i++;
          if (c < remaining) wrapped = true;
        }
        if (c > remaining) c--;
      } else {
        c--;
      }
      if (w.center) {
        if (c > width) this.printChar(0x0a);
        this.moveTo(Math.trunc((remaining - c) / 2), w.y);
      }
      if (skipLead) while (buf[start] === 0x20) start++;
      for (; start <= c; start++) this.printChar(buf[start]);
    } while (!done);
  }

  /** ULTIMA_1a3e_PrintNumber: at least `minLength` characters, padded in front with `filler`. */
  printNumber(n: number, minLength = 1, filler = ' '): void {
    const digits = String(Math.abs(Math.trunc(n)));
    const body = (n < 0 ? '-' : '') + digits;
    this.print(filler.repeat(Math.max(0, Math.min(39, minLength) - body.length)) + body);
  }
}
