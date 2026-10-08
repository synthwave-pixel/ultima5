/**
 * signLayout.ts
 *
 * A dungeon sign laid out anew for the Standard look, which carves it into the wall ahead larger than 1988 printed it
 * (framebuffer.ts carveSign): each rune one cell, 1988's lines kept where they fit the wall, one too wide broken
 * between its words (a word never broken), centred where 1988's sign was, at `scale` times 1988's cell, or smaller where
 * a single word is wider than the wall.
 */

/** The wall ahead, in the view, in DOS pixels: the face a sign is cut into (the left and right, the top and bottom). */
export const SIGN_WALL = { x1: 36, x2: 156, y1: 32, y2: 152 } as const;
/** How far in from the wall's edges either side a plate stands (3% of the wall), in DOS pixels. */
const PLATE_INSET = 4;
/**
 * The passage's walls as the view draws them (DNG1-3.16's pictures, in DOS pixels): each square's wall ahead a square
 * about the middle (x, y), half as wide as `halves` says - the party's own square's near edge, then one, two and three
 * squares on. The wall right ahead is the second (x 40-151, y 40-151); a side wall runs from one to the next.
 */
export const WALLS = { x: 96, y: 96, halves: [80, 56, 24, 8] } as const;
/** Kept clear of the wall's edges either side, in DOS pixels: the plate's inset and its edge. */
const MARGIN = PLATE_INSET + 3;
/** A plate's margin above and below its letters, beyond their own: 5% of the wall, in DOS pixels. */
const PLATE_HEAD = 6;

/** A letter of a sign, laid out: its rune (RUNES.CH's code), and where its cell's top left is, in DOS pixels. */
export interface SignLetter {
  code: number;
  x: number;
  y: number;
  /** Its place in the reading: the wave runs from the first letter, a line's letters one after another. */
  along: number;
}

export interface SignLayout {
  /** A letter's cell's side, in DOS pixels (not whole: the colour page's pixels are four to one). */
  cell: number;
  letters: SignLetter[];
  /** The riveted plate it may be cut into, round its letters, in DOS pixels (the left and right, the top and bottom). */
  plate: { x1: number; x2: number; y1: number; y2: number };
}

/**
 * Sign `text` (1988's lines, runes and spaces, padded to centre them), printed by 1988 from text column `left`, row
 * `top`: laid out at `scale` times its eight-pixel cell, in lines of whole words that fit the wall.
 */
export function signLayout(text: string, left: number, top: number, scale: number): SignLayout {
  const rows = text.split(/[\n\r]+/).filter((l) => l.length);
  const words = (row: string): string[] => row.split(' ').filter((w) => w.length);
  // Centred where 1988's sign was: its box, the longest line wide and a row a line.
  const wide = Math.max(1, ...rows.map((l) => l.length));
  const [cx, cy] = [(left + wide / 2) * 8, (top + rows.length / 2) * 8];
  const room = SIGN_WALL.x2 - SIGN_WALL.x1 - MARGIN * 2;
  const longest = Math.max(1, ...rows.flatMap(words).map((w) => w.length));
  const cell = Math.min(8 * scale, room / longest);
  const perLine = Math.max(1, Math.floor(room / cell));
  // 1988's lines as they were, where they fit; one too wide for the wall broken between its words.
  const lines: string[] = [];
  for (const row of rows) {
    const first = lines.length;
    for (const w of words(row)) {
      const last = lines.length - 1;
      if (last >= first && lines[last].length + 1 + w.length <= perLine) lines[last] += ` ${w}`;
      else lines.push(w);
    }
  }
  const letters: SignLetter[] = [];
  const high = lines.length * cell;
  const top0 = Math.max(SIGN_WALL.y1 + MARGIN, Math.min(cy - high / 2, SIGN_WALL.y2 - MARGIN - high));
  let along = 0;
  lines.forEach((line, n) => {
    const x0 = Math.max(SIGN_WALL.x1 + MARGIN, Math.min(cx - (line.length * cell) / 2, SIGN_WALL.x2 - MARGIN - line.length * cell));
    [...line].forEach((ch, i) => {
      along++;
      if (ch !== ' ') letters.push({ code: ch.charCodeAt(0), x: x0 + i * cell, y: top0 + n * cell, along });
    });
  });
  // The plate: round the letters, a little wider than them, kept in from the wall's edges; deeper than it is wide.
  const xs = letters.map((l) => l.x);
  const [padX, padY] = [cell * 0.6, cell * 0.45 + PLATE_HEAD];
  const plate = {
    x1: Math.max(SIGN_WALL.x1 + PLATE_INSET, Math.min(...xs) - padX),
    x2: Math.min(SIGN_WALL.x2 - PLATE_INSET, Math.max(...xs) + cell + padX),
    y1: Math.max(SIGN_WALL.y1 + PLATE_INSET, top0 - padY),
    y2: Math.min(SIGN_WALL.y2 - PLATE_INSET, top0 + high + padY),
  };
  return { cell, letters, plate };
}
