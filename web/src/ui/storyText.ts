/**
 * storyText.ts
 *
 * The Standard look's story pages - the introduction, the gypsy, the ending - set in a real font (IM Fell English,
 * the blackletter UnifrakturMaguntia for a page's first letter) rather than the game's proportional one. The words
 * are the player's own (STORY.DAT, QUESTION.DAT, END.DAT); the pictures are the game's, where the game puts them.
 * What changes is where the words go: 1988 ran them in two justified spans round the picture, the lines between
 * pulled wide; here all of a page's prose is one block, ragged right, in whichever clear space of the page lets it
 * be set largest, its first letter dropped two lines in blackletter.
 *
 * This is the setting: which space, what size, where each line goes, as runs of text in the colour page's pixels
 * (four to an EGA pixel). The screen draws them (screen.ts).
 */

/** Colour page pixels to an EGA pixel. */
const K = 4;
const W = 320;
const H = 200;

/** A run of text to draw: its words, where its baseline starts (colour page pixels), its size, face and colour. */
export interface Run {
  text: string;
  x: number;
  y: number;
  size: number;
  face: 'body' | 'initial';
  colour: number;
}

/** How wide `text` is at `size` in `face`, in colour page pixels (the screen's canvas measures). */
export type Measure = (text: string, size: number, face: 'body' | 'initial') => number;

/** A paragraph: its words, each in the pieces the game marks where it may be broken ('_'). */
interface Para {
  words: string[][];
  indent: boolean;
}

export const WHITE = 0xffffff;
export const GREY = 0x8c8c8c;
/** The frame's copper, for a dropped letter. */
export const COPPER = 0xe0a060;

/** The largest a page's prose is set, and the smallest before it gives up; colour page pixels. */
const LARGEST = 30;
const SMALLEST = 17;
const LEADING = 1.28;
/** Lines a dropped letter stands in, and the fewest a paragraph must have to carry one. */
const CAP_LINES = 2;
const CAP_MIN_LINES = 3;

/** Straight quotes curled: an opening one at a word's start, a closing one (or an apostrophe) elsewhere. */
function curl(w: string): string {
  return w.replace(/^"/, '“').replace(/"/g, '”').replace(/^'/, '‘').replace(/'/g, '’');
}

const words = (s: string): string[][] =>
  s
    .split(' ')
    .filter(Boolean)
    .map((w) => curl(w).split('_'));

/**
 * The game's prose as paragraphs: a line break ends one, '{' at its start indents it, '_' marks where a word may be
 * broken. The 1988 layout's blank lines (its way of moving the pen down) are dropped.
 */
export function paragraphs(text: string): Para[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => ({ indent: l.startsWith('{'), words: words(l.replace(/^\{/, '')) }));
}

interface Line {
  pieces: string[];
}

/** A paragraph broken into lines of `width(i)` for line i, a word broken at a mark (with a hyphen) only when it must. */
function breakLines(measure: Measure, size: number, para: Para, width: (i: number) => number, indent: number): Line[] {
  const m = (s: string): number => measure(s, size, 'body');
  const space = m(' ');
  const lines: Line[] = [];
  let cur: string[] = [];
  let used = 0;
  const avail = (): number => width(lines.length) - (lines.length === 0 ? indent : 0);
  const push = (): void => {
    lines.push({ pieces: cur });
    cur = [];
    used = 0;
  };
  for (const w of para.words) {
    let parts = w;
    for (;;) {
      const word = parts.join('');
      const need = (cur.length ? space : 0) + m(word);
      if (used + need <= avail()) {
        cur.push(word);
        used += need;
        break;
      }
      // A word too long for any line broken where the game marks it may be.
      let broke = false;
      if (!cur.length && parts.length > 1) {
        for (let k = parts.length - 1; k > 0; k--) {
          const head = parts.slice(0, k).join('') + '-';
          if (m(head) <= avail()) {
            cur.push(head);
            push();
            parts = parts.slice(k);
            broke = true;
            break;
          }
        }
      }
      if (broke) continue;
      if (!cur.length) {
        cur.push(word);
        push();
        break;
      }
      push();
    }
  }
  if (cur.length) push();
  return lines;
}

/** A clear rectangle of the page, EGA pixels: [x, y, width, height]. */
export type Rect = [number, number, number, number];

/**
 * The clear rectangles of a page worth setting prose in: its pictures (`lit`, 320 by 200, nonzero where drawn) kept
 * `margin` pixels clear, and the screen's edges; the largest at each of a few shapes - wide, and tall.
 */
export function clearSpaces(lit: Uint8Array, margin = 5): Rect[] {
  // How many lit pixels lie in each window round a pixel, by a summed-area table.
  const sum = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      sum[(y + 1) * (W + 1) + x + 1] =
        (lit[y * W + x] ? 1 : 0) + sum[y * (W + 1) + x + 1] + sum[(y + 1) * (W + 1) + x] - sum[y * (W + 1) + x];
  const litIn = (x1: number, y1: number, x2: number, y2: number): number => {
    [x1, y1, x2, y2] = [Math.max(0, x1), Math.max(0, y1), Math.min(W - 1, x2), Math.min(H - 1, y2)];
    return sum[(y2 + 1) * (W + 1) + x2 + 1] - sum[y1 * (W + 1) + x2 + 1] - sum[(y2 + 1) * (W + 1) + x1] + sum[y1 * (W + 1) + x1];
  };
  const free = (x: number, y: number): boolean =>
    x >= 6 && x < W - 6 && y >= 5 && y < H - 5 && litIn(x - margin, y - margin, x + margin, y + margin) === 0;
  // Every rectangle as tall as it can be at its row, from each row's histogram of clear heights.
  const heights = new Int32Array(W + 1);
  const shapes: [number, number][] = [
    [110, 1],
    [150, 1],
    [200, 1],
    [260, 1],
    [300, 1],
    [90, 100],
    [90, 140],
    [90, 170],
  ];
  const best: (Rect | null)[] = shapes.map(() => null);
  const consider = (x: number, y: number, w: number, h: number): void => {
    shapes.forEach(([minW, minH], i) => {
      if (w < minW || h < minH) return;
      const b = best[i];
      if (!b || w * h > b[2] * b[3]) best[i] = [x, y - h + 1, w, h];
    });
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) heights[x] = free(x, y) ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= W; x++) {
      const h = x < W ? heights[x] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const i = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        if (heights[i] > 0) consider(left, y, x - left, heights[i]);
      }
      stack.push(x);
    }
  }
  const seen = new Set<string>();
  return best.filter((r): r is Rect => !!r && !seen.has(r.join()) && !!seen.add(r.join()));
}

interface Setting {
  size: number;
  rect: Rect;
  laid: { lines: Line[]; cap: { letter: string; quote: string; width: number } | null; indent: number; first: number }[];
  count: number;
}

/** The paragraphs set at `size` in a column `width` wide: their lines, the first paragraph's first letter dropped. */
function setAt(measure: Measure, paras: Para[], size: number, width: number, initial: boolean): Omit<Setting, 'rect'> {
  const laid: Setting['laid'] = [];
  let count = 0;
  paras.forEach((para, pi) => {
    let body = para;
    let cap: Setting['laid'][number]['cap'] = null;
    const m = initial && pi === 0 ? para.words[0]?.join('').match(/^([“‘]?)([A-Za-z])(.*)$/) : null;
    if (m) {
      const glyph = measure(m[2], Math.round(size * LEADING * CAP_LINES * 0.95), 'initial');
      const quote = m[1] ? measure(m[1], size, 'body') : 0;
      cap = { letter: m[2], quote: m[1], width: quote + glyph + size * 0.3 };
      body = { ...para, words: m[3] ? [[m[3]], ...para.words.slice(1)] : para.words.slice(1) };
    }
    const indent = !cap && para.indent && pi > 0 ? size * 1.2 : 0;
    let lines = breakLines(measure, size, body, (i) => width - (cap && i < CAP_LINES ? cap.width : 0), indent);
    if (cap && lines.length < CAP_MIN_LINES) {
      // Too short to carry a dropped letter: set as it is.
      cap = null;
      lines = breakLines(measure, size, para, () => width, indent);
    }
    laid.push({ lines, cap, indent, first: count });
    count += lines.length;
  });
  return { size, laid, count };
}

/**
 * A page's prose (its texts, in order) set in the page's clearest space, as large as it will go: the runs to draw,
 * or null if it will not go at all (the page is then set as 1988 set it).
 */
export function setProse(texts: string[], lit: Uint8Array, measure: Measure): Run[] | null {
  const paras = texts.flatMap(paragraphs);
  if (!paras.length) return [];
  let best: Setting | null = null;
  for (const rect of clearSpaces(lit)) {
    for (let size = LARGEST; size >= SMALLEST; size--) {
      const s = setAt(measure, paras, size, rect[2] * K, true);
      if (s.count * size * LEADING <= rect[3] * K) {
        if (!best || size > best.size || (size === best.size && rect[2] * rect[3] > best.rect[2] * best.rect[3])) best = { ...s, rect };
        break;
      }
    }
  }
  if (!best) return null;
  const { size, rect, laid, count } = best;
  const lh = size * LEADING;
  const top = rect[1] * K + Math.max(0, (rect[3] * K - count * lh) / 2);
  const x0 = rect[0] * K;
  const runs: Run[] = [];
  for (const p of laid) {
    if (p.cap) {
      if (p.cap.quote) runs.push({ text: p.cap.quote, x: x0, y: top + p.first * lh + size, size, face: 'body', colour: COPPER });
      runs.push({
        text: p.cap.letter,
        x: x0 + (p.cap.quote ? size * 0.35 : 0),
        y: top + p.first * lh + lh * CAP_LINES - size * 0.28,
        size: Math.round(lh * CAP_LINES * 0.95),
        face: 'initial',
        colour: COPPER,
      });
    }
    p.lines.forEach((ln, i) => {
      const off = (p.cap && i < CAP_LINES ? p.cap.width : 0) + (i === 0 ? p.indent : 0);
      runs.push({ text: ln.pieces.join(' '), x: x0 + off, y: top + (p.first + i) * lh + size, size, face: 'body', colour: WHITE });
    });
  }
  return runs;
}

/** The gypsy's bowls' columns (EGA pixels), left and right: the answers are set under them. */
export const CHOICE_COLUMNS: [number, number][] = [
  [6, 154],
  [166, 314],
];
/**
 * How far the Standard look lowers the gypsy's braziers on every question (EGA pixels), the same each time so they
 * never move: the question goes in the band above them, the answers under the bowls (intro.ts dilemma, the stage).
 */
export const GYPSY_DROP = 26;
/** The band under the bowls the answers go in, and the band above the braziers the question does (EGA pixels). */
const CHOICE_TOP = 150 + GYPSY_DROP;
const CHOICE_BOTTOM = 197;
const QUESTION_TOP = 2;
const QUESTION_BOTTOM = GYPSY_DROP - 1;

/** The narrowest width a paragraph keeps its number of lines in: its lines as even as they go (no word left alone). */
function balanced(measure: Measure, size: number, para: Para, width: number): Line[] {
  const lines = breakLines(measure, size, para, () => width, 0);
  if (lines.length < 2) return lines;
  let best = lines;
  for (let w = width - 8; w > width / 2; w -= 8) {
    const tried = breakLines(measure, size, para, () => w, 0);
    if (tried.length !== lines.length) break;
    best = tried;
  }
  return best;
}

/** An answer set on its own: its first letter capital, the punctuation that ran it on into the question gone. */
const answer = (t: string): string => t.replace(/[\s?;,.]+$/, '').replace(/^./, (c) => c.toUpperCase());

/**
 * The gypsy's question as the Standard look sets it: the question across the top of the page, over the braziers, and
 * each answer centred under its bowl - grey, or white for the one the Avatar stands at (`lit`: 0 the left, 1 the
 * right, -1 neither) - both at the one size, the largest at which each fits its band.
 */
export function setChoice(question: string, left: string, right: string, lit: number, measure: Measure): Run[] {
  const answers = [left, right].map((t) => ({ indent: false, words: words(answer(t)) }));
  const q = { indent: false, words: words(question) };
  for (let size = 26; ; size--) {
    const lh = size * LEADING;
    const cols = answers.map((a, i) => balanced(measure, size, a, (CHOICE_COLUMNS[i][1] - CHOICE_COLUMNS[i][0]) * K));
    const ql = balanced(measure, size, q, (W - 12) * K);
    const answerLines = Math.max(...cols.map((c) => c.length));
    const fits = answerLines * lh <= (CHOICE_BOTTOM - CHOICE_TOP) * K && ql.length * lh <= (QUESTION_BOTTOM - QUESTION_TOP) * K;
    if (!fits && size > 12) continue;
    const runs: Run[] = [];
    const centred = (text: string, c1: number, c2: number, y: number, colour: number): void => {
      const w = measure(text, size, 'body');
      runs.push({ text, x: ((c1 + c2) * K) / 2 - w / 2, y, size, face: 'body', colour });
    };
    const top = CHOICE_TOP * K;
    cols.forEach((lines, i) =>
      lines.forEach((ln, j) =>
        centred(ln.pieces.join(' '), CHOICE_COLUMNS[i][0], CHOICE_COLUMNS[i][1], top + j * lh + size, lit === i ? WHITE : GREY),
      ),
    );
    // The question in the middle of its band.
    const qTop = QUESTION_TOP * K + Math.max(0, ((QUESTION_BOTTOM - QUESTION_TOP) * K - ql.length * lh) / 2);
    ql.forEach((ln, j) => centred(ln.pieces.join(' '), 6, W - 6, qTop + j * lh + size, WHITE));
    return runs;
  }
}
