/**
 * storyText.ts
 *
 * The Standard look's story pages - the introduction, the gypsy, the ending - set in a real font (IM Fell English,
 * the blackletter UnifrakturMaguntia for a page's first letter) rather than the game's proportional one. The words
 * are the player's own (STORY.DAT, QUESTION.DAT, END.DAT); the pictures are the game's, where the game puts them.
 * What changes is where the words go: 1988 ran them in two justified spans round the picture, the lines between
 * pulled wide; here a page's prose is read a paragraph at a time (setSteps), ragged right at the one size, in the
 * page's clearest space, each paragraph a little lower than the last, the page's first letter dropped two lines in
 * blackletter. Where the steps will not go, all of it is one block, as large as it will go (setProse).
 *
 * This is the setting: which space, what size, where each line goes, as runs of text in the colour page's pixels
 * (four to an EGA pixel). The screen draws them (screen.ts).
 */

/** Colour page pixels to an EGA pixel. */
const K = 4;
const W = 320;
const H = 200;

/** A face a run is set in: the story's body and its initials, or the game's own lettering (the gypsy's choices). */
export type RunFace = 'body' | 'initial' | 'mono';

/**
 * A run of text to draw: its words, where its baseline starts (colour page pixels), its size, face and colour. Or,
 * with `panel`, no words but a dark box (colour page pixels, x1 y1 x2 y2) for the words after it to stand on.
 */
export interface Run {
  text: string;
  x: number;
  y: number;
  size: number;
  face: RunFace;
  colour: number;
  panel?: [number, number, number, number];
  /** A step's words (setSteps): taken off the page as the next step is set in their place. */
  step?: boolean;
}

/** How wide `text` is at `size` in `face`, in colour page pixels (the screen's canvas measures). */
export type Measure = (text: string, size: number, face: RunFace) => number;

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
function breakLines(
  measure: Measure,
  size: number,
  para: Para,
  width: (i: number) => number,
  indent: number,
  face: RunFace = 'body',
): Line[] {
  const m = (s: string): number => measure(s, size, face);
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

/**
 * The gypsy's bowls' columns (EGA pixels), left and right: the answers are set under them, each centred on its
 * brazier (the braziers' rims span 35-97 and 219-281: centres 66 and 250), as wide as the screen's edge allows.
 */
export const CHOICE_COLUMNS: [number, number][] = [
  [6, 126],
  [190, 310],
];
/** The band under the bowls the answers go in (EGA pixels). */
const CHOICE_TOP = 150;
const CHOICE_BOTTOM = 197;
/**
 * The column between the bowls' smoke the question goes in, and its band above the Avatar (EGA pixels): a little
 * wider than the gap between the smoke, its dark panel just over the smoke's inner edges (the port's).
 */
const QUESTION_LEFT = 106;
const QUESTION_RIGHT = 214;
const QUESTION_TOP = 4;
const QUESTION_BOTTOM = 104;
/** The panel's margin about the question's lines (EGA pixels). */
const PANEL_MARGIN = 3;
/** The largest the choices are set in the game's lettering, and the smallest before they give up (colour page pixels). */
const CHOICE_LARGEST = 24;
const CHOICE_SMALLEST = 14;

/** The narrowest width a paragraph keeps its number of lines in: its lines as even as they go (no word left alone). */
function balanced(measure: Measure, size: number, para: Para, width: number, face: RunFace = 'body'): Line[] {
  const lines = breakLines(measure, size, para, () => width, 0, face);
  if (lines.length < 2) return lines;
  let best = lines;
  for (let w = width - 8; w > width / 2; w -= 8) {
    const tried = breakLines(measure, size, para, () => w, 0, face);
    if (tried.length !== lines.length) break;
    best = tried;
  }
  return best;
}

/** A question that runs on into its answers ("...Dost thou"), trailing off as it does: "Dost thou...". */
const trailing = (t: string): string => (/[.?!:]$/.test(t.trimEnd()) ? t : `${t.trimEnd()}...`);

/** An answer set on its own: its first letter capital, the punctuation that ran it on into the question gone. */
const answer = (t: string): string => t.replace(/[\s?;,.]+$/, '').replace(/^./, (c) => c.toUpperCase());

/**
 * The gypsy's question as the Standard look sets it, in the game's own lettering: the question in the column between
 * the bowls, above the Avatar, on a dark panel over the smoke's inner edges; and each answer centred under its bowl -
 * grey, or white for the one the Avatar stands at (`lit`: 0 the left, 1 the right, -1 neither) - all at the one
 * size, the largest at which each fits its band.
 */
export function setChoice(question: string, left: string, right: string, lit: number, measure: Measure): Run[] {
  const answers = [left, right].map((t) => ({ indent: false, words: words(answer(t)) }));
  const q = { indent: false, words: words(trailing(question)) };
  for (let size = CHOICE_LARGEST; ; size--) {
    const lh = size * LEADING;
    const cols = answers.map((a, i) => balanced(measure, size, a, (CHOICE_COLUMNS[i][1] - CHOICE_COLUMNS[i][0]) * K, 'mono'));
    const ql = balanced(measure, size, q, (QUESTION_RIGHT - QUESTION_LEFT - 2 * PANEL_MARGIN) * K, 'mono');
    const answerLines = Math.max(...cols.map((c) => c.length));
    const fits =
      answerLines * lh <= (CHOICE_BOTTOM - CHOICE_TOP) * K && ql.length * lh <= (QUESTION_BOTTOM - QUESTION_TOP - 2 * PANEL_MARGIN) * K;
    if (!fits && size > CHOICE_SMALLEST) continue;
    const runs: Run[] = [];
    const centred = (text: string, c1: number, c2: number, y: number, colour: number): void => {
      const w = measure(text, size, 'mono');
      runs.push({ text, x: ((c1 + c2) * K) / 2 - w / 2, y, size, face: 'mono', colour });
    };
    // The question in the middle of its band, on its panel: as wide as its widest line, and its lines' height.
    const qHeight = ql.length * lh;
    const qTop = QUESTION_TOP * K + Math.max(0, ((QUESTION_BOTTOM - QUESTION_TOP) * K - qHeight) / 2);
    const widest = Math.max(...ql.map((ln) => measure(ln.pieces.join(' '), size, 'mono')));
    const mid = ((QUESTION_LEFT + QUESTION_RIGHT) * K) / 2;
    const m = PANEL_MARGIN * K;
    runs.push({
      text: '',
      x: 0,
      y: 0,
      size,
      face: 'mono',
      colour: 0,
      panel: [mid - widest / 2 - m, qTop - m, mid + widest / 2 + m, qTop + qHeight + m],
    });
    ql.forEach((ln, j) => centred(ln.pieces.join(' '), QUESTION_LEFT, QUESTION_RIGHT, qTop + j * lh + size, WHITE));
    // Each answer under its bowl, at the top of its band.
    const top = CHOICE_TOP * K;
    cols.forEach((lines, i) =>
      lines.forEach((ln, j) =>
        centred(ln.pieces.join(' '), CHOICE_COLUMNS[i][0], CHOICE_COLUMNS[i][1], top + j * lh + size, lit === i ? WHITE : GREY),
      ),
    );
    return runs;
  }
}

/** The one size every step is set at (colour page pixels): today's largest page setting was 30. */
export const STEP_SIZE = 36;
/** Clear space kept above and below the steps (colour page pixels). */
const STEP_MARGIN = 12;
/** How much lower each step starts than the last, in lines, as far as the space allows. */
const STEP_WALK = 1.5;

/** A paragraph's sentences, each a run of its words: a sentence ends at a word ending in . ! or ?, a closing mark after. */
function sentences(para: Para): Para[] {
  const out: Para[] = [];
  let cur: string[][] = [];
  for (const w of para.words) {
    cur.push(w);
    if (/[.!?][”’"')]*$/.test(w.join(''))) {
      out.push({ indent: false, words: cur });
      cur = [];
    }
  }
  if (cur.length) out.push({ indent: false, words: cur });
  return out;
}

/** A step: its words, and whether it carries the page's dropped letter. */
interface Step {
  para: Para;
  cap: boolean;
}

/** A step's lines at STEP_SIZE in a column `width` wide, its first letter dropped where it carries the cap and is long enough to. */
function stepLines(measure: Measure, step: Step, width: number): Setting['laid'][number] {
  return setAt(measure, [step.para], STEP_SIZE, width, step.cap).laid[0];
}

/**
 * A paragraph as steps that each fit `height`: whole where it does; else cut at its sentences into as few pieces as
 * will fit, as even as the sentences allow (the tallest piece as short as it can be). Null where one sentence alone
 * will not fit.
 */
function splitPara(measure: Measure, para: Para, cap: boolean, width: number, height: number): Step[] | null {
  const lh = STEP_SIZE * LEADING;
  const tall = (st: Step): number => stepLines(measure, st, width).lines.length * lh;
  if (tall({ para, cap }) <= height) return [{ para, cap }];
  const parts = sentences(para);
  const n = parts.length;
  // The height of sentences i..j-1 as one step (the first carrying the cap).
  const memo = new Map<string, number>();
  const span = (i: number, j: number): number => {
    const key = `${i},${j}`;
    let h = memo.get(key);
    if (h === undefined) {
      h = tall({ para: { indent: false, words: parts.slice(i, j).flatMap((p) => p.words) }, cap: cap && i === 0 });
      memo.set(key, h);
    }
    return h;
  };
  for (let pieces = 2; pieces <= n; pieces++) {
    // best(i, k): the least tallest piece cutting sentences i.. into k pieces, and where the first cut falls.
    const best = new Map<string, [number, number]>();
    const solve = (i: number, k: number): [number, number] => {
      const key = `${i},${k}`;
      const got = best.get(key);
      if (got) return got;
      let out: [number, number] = [Infinity, -1];
      if (k === 1) out = [span(i, n), n];
      else
        for (let j = i + 1; j <= n - k + 1; j++) {
          const here = span(i, j);
          if (here > height) break;
          const tallest = Math.max(here, solve(j, k - 1)[0]);
          if (tallest < out[0]) out = [tallest, j];
        }
      best.set(key, out);
      return out;
    };
    if (solve(0, pieces)[0] > height) continue;
    const steps: Step[] = [];
    for (let i = 0, k = pieces; i < n; k--) {
      const j = solve(i, k)[1];
      steps.push({ para: { indent: false, words: parts.slice(i, j).flatMap((p) => p.words) }, cap: cap && i === 0 });
      i = j;
    }
    return steps;
  }
  return null;
}

/**
 * A page's prose (its texts, in order) as steps read one after another over the same picture, each its own runs: a
 * paragraph a step, at STEP_SIZE, a paragraph too long for the space cut evenly at its sentences. All are set in the
 * one clear space of the page that takes them in the fewest steps (the largest, of those), each starting a line and
 * a half lower than the last, as far as the space allows, so the eye walks down the page rather than going back to
 * its top; the page's first letter dropped on its first step. Null where they will not go at that size (setProse
 * then sets the page as one block).
 */
export function setSteps(texts: string[], lit: Uint8Array, measure: Measure): Run[][] | null {
  const paras = texts.flatMap(paragraphs);
  if (!paras.length) return [];
  const lh = STEP_SIZE * LEADING;
  let best: { rect: Rect; steps: Step[] } | null = null;
  for (const rect of clearSpaces(lit)) {
    const width = rect[2] * K;
    const height = rect[3] * K - 2 * STEP_MARGIN;
    const steps: Step[] = [];
    let fits = true;
    for (const [pi, para] of paras.entries()) {
      const got = splitPara(measure, para, pi === 0, width, height);
      if (!got) {
        fits = false;
        break;
      }
      steps.push(...got);
    }
    if (!fits) continue;
    if (
      !best ||
      steps.length < best.steps.length ||
      (steps.length === best.steps.length && rect[2] * rect[3] > best.rect[2] * best.rect[3])
    )
      best = { rect, steps };
  }
  if (!best) return null;
  const { rect, steps } = best;
  const width = rect[2] * K;
  const height = rect[3] * K - 2 * STEP_MARGIN;
  const top0 = rect[1] * K + STEP_MARGIN;
  const x0 = rect[0] * K;
  const laid = steps.map((st) => stepLines(measure, st, width));
  const n = laid.length;
  const tallest = Math.max(...laid.map((l) => l.lines.length * lh));
  const walk = n === 1 ? 0 : Math.min((n - 1) * lh * STEP_WALK, height - tallest);
  const first = top0 + (height - tallest - walk) / 2;
  return laid.map((p, k) => {
    const top = n === 1 ? top0 + (height - p.lines.length * lh) / 2 : first + (walk * k) / (n - 1);
    const runs: Run[] = [];
    if (p.cap) {
      const size = STEP_SIZE;
      if (p.cap.quote) runs.push({ text: p.cap.quote, x: x0, y: top + size, size, face: 'body', colour: COPPER, step: true });
      runs.push({
        text: p.cap.letter,
        x: x0 + (p.cap.quote ? size * 0.35 : 0),
        y: top + lh * CAP_LINES - size * 0.28,
        size: Math.round(lh * CAP_LINES * 0.95),
        face: 'initial',
        colour: COPPER,
        step: true,
      });
    }
    p.lines.forEach((ln, i) => {
      const off = p.cap && i < CAP_LINES ? p.cap.width : 0;
      runs.push({
        text: ln.pieces.join(' '),
        x: x0 + off,
        y: top + i * lh + STEP_SIZE,
        size: STEP_SIZE,
        face: 'body',
        colour: WHITE,
        step: true,
      });
    });
    return runs;
  });
}
