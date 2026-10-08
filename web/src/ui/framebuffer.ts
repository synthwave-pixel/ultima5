/**
 * framebuffer.ts
 *
 * The EGA screen as the DOS game drew it: 320 by 200 pixels of the 16
 * colours, two pages (the second for copies and effects), drawn by the
 * operations of u5d's graphics driver (graphics/grap_buf.c) and shown on
 * a canvas once a frame.
 *
 * Beside each EGA page is a colour page at four times the size (1280 by
 * 800, the ultima3 port's scale: a tile is 64 pixels across), which every
 * operation also draws and which is what the canvas shows: EGA colours
 * enlarged, and the tiles as the chosen tile art draws them (the EGA
 * tiles enlarged for Original, 64-pixel art for Standard). The EGA pages
 * stay the game's own, for anything that reads them.
 *
 * Over each page, too, the Standard look's story words (storyText.ts): kept
 * as words, not pixels, and set by the screen at its own resolution over
 * the page it shows (screen.ts), so they are as sharp as the display is.
 * They go where a page's pixels go - copied with it, cleared with it, put
 * back with it.
 */

import { carve, plate, type CarveStyle } from './carve.ts';
import { GLYPH_SIZE, type Font } from '../data/font.ts';
import { EGA_PALETTE } from '../data/tiles.ts';
import type { BitPicture, Picture } from '../data/images.ts';
import type { Figure, Mark, Place } from '../game/io.ts';
import { EXTRA_RGB } from './colours.ts';
import { DISSOLVE_MS, DISSOLVE_ORDER, HOLD_MS, RuneReveal, STAGGER_MS, type RuneCell } from './runeReveal.ts';
import { SIGN_WALL, WALLS, signLayout } from './signLayout.ts';
import type { Run } from './storyText.ts';

export const WIDTH = 320;
export const HEIGHT = 200;
/** The viewport's top-left pixel (tile cell 0, 0). */
export const TILE_X = 8;
export const TILE_Y = 8;

/** How a picture shows on the colour page, if not in its EGA colours (Framebuffer.image). */
export type ImageOver = { kind: 'rgba'; px: Uint32Array; width: number; scale: number };

/** A line of the story's words over a page: its run, the box it covers (colour page pixels, x1 y1 inclusive, x2 y2 not), and how much of it shows. */
export interface Words {
  run: Run;
  box: [number, number, number, number];
  alpha: number;
}

/** A page's contents, both layers and its words (to put back with restorePage or restoreRect). */
export interface Snapshot {
  ega: Uint8Array;
  hi: Uint32Array;
  words?: Words[];
  letters?: Map<number, Letter>;
}

/**
 * Which of the port's faces a letter is set in: the lettering, the runes, a rune's English - or the game's own symbol
 * (its text `font:code`), its smoothed shape filled as an outline (symbolMask).
 */
export type Face = 'mono' | 'runes' | 'symbol';

/**
 * A text cell's letter set in a real font by the screen at its own resolution (the Standard look), over the colour
 * page's cell, which holds only its ground: the face and what to set, its colour (0xRRGGBB), and the game's own
 * pixels of the cell as the glyph drew them - by which it is known to stand still, whatever has been drawn since. A
 * rune being read gives way to its English: `to`, `k` of the way there.
 */
export interface Letter {
  face: Face;
  text: string;
  colour: number;
  x: number;
  y: number;
  ega: Uint8Array;
  /** What it gives way to (a rune its English), in `colour` where given - a word's kind (dialog's runes) - else its own. */
  to?: { face: Face; text: string; colour?: number } | undefined;
  k: number;
  /** How much of it shows (a page dissolved to, the reveals); while below 1 it is not held to its pixels. */
  alpha: number;
}

/** A sign drawn flat to be seen from further off (Framebuffer.flatSign): its pixels, and which are its letters'. */
interface Flat {
  px: Uint32Array;
  ink: Uint8Array;
  w: number;
  h: number;
}

/** RUNES.CH's rune letters, 0x41 to 0x5f, as Britannian Runes II sets them: A to Z, then TH, EE, NG, EA and ST. */
export const RUNE_LETTER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '\u00e6', '\u00e7', '\u00e8', '\u00e9', '\u00ea'];
/** Their English: a letter, or the two that one rune stands for. */
export const RUNE_ENGLISH = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'TH', 'EE', 'NG', 'EA', 'ST'];

/** An RGBA colour of the colour pages (ABGR in memory) as 0xRRGGBB. */
const rgbOf = (v: number): number => ((v & 0xff) << 16) | (v & 0xff00) | ((v >>> 16) & 0xff);

/** A figure's opaque part in its square (a frame of it): x1 below 0 where it has none. */
export function figureBounds(px: Uint32Array): Bounds {
  const n = Math.round(Math.sqrt(px.length));
  let [x0, y0, x1, y1] = [n, n, -1, -1];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (px[y * n + x] >>> 24 < 200) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1];
}

/** A letter's key in its page's map: its cell's top-left pixel. */
const cellKey = (x: number, y: number): number => y * WIDTH + x;

/** A figure's outline in its square (x0, y0, x1, y1, inclusive): the opaque part of it, or of all its frames. */
export type Bounds = [number, number, number, number];

/** The colour pages' scale. */
export const HI = 4;
export const HI_WIDTH = WIDTH * HI;
/** A sign's letters and plate are cut in squares of this many colour pixels: the corridor pictures' grain. */
const GRAIN = HI / 2;
export const HI_HEIGHT = HEIGHT * HI;

/** EGA colours as the colour pages hold them (RGBA in memory order, so a Uint32 is ABGR on little-endian). */
export const EGA_RGBA = EGA_PALETTE.map((rgb) => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0);

/** A colour number as the colour pages hold it: an EGA colour, or one of the port's extra ones (colours.ts). */
export const colourRGBA = (c: number): number => {
  const extra = EXTRA_RGB[c >> 4];
  if (!extra) return EGA_RGBA[c & 15];
  return (0xff000000 | ((extra & 0xff) << 16) | (extra & 0xff00) | (extra >> 16)) >>> 0;
};

/** The ultima3 port's burst's colours (memory order): its darker centre, its body, its bright rim - red, and blue. */
const rgbaOf = (rgb: number): number => (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
const BURST_RED = [0xa01818, 0xe02020, 0xff5040].map(rgbaOf);
const BURST_BLUE = [0x1830a0, 0x2060e8, 0x60b0ff].map(rgbaOf);

/** Where the colour pages' tiles come from. */
export interface TileArt {
  /**
   * Draw `tile` into a colour page with its top-left at (x, y) in that page's pixels, over `ground` if it has
   * see-through parts (and `ground` over `floor`, where it has them too: a figure on a barrel, the barrel on the
   * floor round it); `place`, where on the world map the square is, for art that draws its shore from the map.
   */
  draw(page: Uint32Array, tile: number, x: number, y: number, ground?: number, place?: Place, tint?: number, floor?: number): void;
  /** The party on foot as its members (a grid of four), where the art draws them so; see StandardArt.party. */
  party?(page: Uint32Array, figures: Figure[], x: number, y: number, terrain: number, floor?: number, place?: Place): void;
  /** The colour of one pixel of a tile at EGA resolution, as a block of HI by HI (for the reveal). */
  block(page: Uint32Array, tile: number, rx: number, ry: number, x: number, y: number): void;
  /**
   * A letter of the set's own lettering, if it has any: sixteen rows of sixteen, nonzero where the ink is, for the
   * character `code` - or null, and the game's own font is shown as it is.
   */
  glyph?(code: number): Uint8Array | null;
  /**
   * The English for a rune letter of RUNES.CH (0x41 to 0x5f: A to Z, then TH, EE, NG, EA and ST), thirty-two rows
   * of thirty-two, if the art reads the runes for the player (runeReveal.ts) - or null, and the runes stay runes.
   */
  reading?(code: number): Uint8Array | null;
  /**
   * The top `rows` EGA rows of `tile` drawn at the foot of the square at (x, y) in a colour page's pixels, over what
   * is there (its see-through parts leaving it): a moongate rising out of the ground. Absent where the art has no
   * figures of its own, and the EGA tile is built and drawn whole.
   */
  rising?(page: Uint32Array, tile: number, rows: number, x: number, y: number): void;
  /** Whether RUNES.CH is drawn at the lettering's grain (doubled twice by EPX): the runes, the signs' frames, the icons. */
  fineRunes?: boolean;
  /**
   * Whether a symbol of IBM.CH the lettering has not (`code` below the space) is drawn at its grain too: the waiting
   * cursor, the arrows, the regalia, a list box's frame - never the border's caps, which the chrome makes copper.
   */
  fineSymbol?(code: number): boolean;
  /**
   * A border's cap as the art draws it (the ultima3 port's Standard UI sheet): side 2 the one before a title, pointing
   * right; 1 the one after, pointing left. A text cell's square at the colour page's grain (32 by 32, memory order),
   * or none, where the frame's own blue is cut to a wedge instead.
   */
  capPiece?(side: number): Uint32Array | null;
}

/** The moongate's tile. */
const GATE = 0xdc;

/** A colour as the canvas's image holds it (little-endian RGBA). */
const rgba = (v: number): number => (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
/**
 * The Standard frame's copper, as the ultima3 port's Standard UI sheet cuts it: eight pixels of bevel along an
 * edge that faces the light (top or left), from the edge in - a ridge of light that falls away to the base - and
 * eight of shade along a foot or right edge, darkest at the edge; and the dark rim where the EGA frame has white.
 */
const COPPER_LIGHT = [0xb36234, 0xb36234, 0xc26834, 0xce7039, 0xb6683b, 0x995c39, 0x7c4d32, 0x693f27].map(rgba);
const COPPER_SHADE = [0x3e210f, 0x412210, 0x452411, 0x4a2713, 0x502a14, 0x552d15, 0x5b3017, 0x5f3218].map(rgba);
const COPPER = rgba(0x623318);
const COPPER_RIM = rgba(0x3e210f);
const BEVEL = COPPER_LIGHT.length;
/** The map's square: inside it, only the outer three pixels (a menu's border) take the frame's colours. */
const VIEW_LEFT = TILE_X;
const VIEW_RIGHT = TILE_X + 11 * 16 - 1;

/** The marks' two colours each (framebuffer aim), one fading to the other and back; a direction's, white alone. */
const MARK_COLOURS: Record<Mark, [number[], number[]]> = {
  attack: [
    [236, 32, 28],
    [190, 78, 8],
  ],
  spell: [
    [138, 52, 196],
    [44, 58, 178],
  ],
  heal: [
    [52, 212, 84],
    [18, 118, 44],
  ],
  direction: [
    [255, 255, 255],
    [255, 255, 255],
  ],
};

/** A colour-page pixel (RGBA in memory order) at half its brightness: a rim's half black over what is there. */
function halfDark(v: number): number {
  const half = (sh: number): number => ((v >>> sh) & 0xff) >> 1;
  return (0xff000000 | (half(16) << 16) | (half(8) << 8) | half(0)) >>> 0;
}
const RING = 3;

export class Framebuffer {
  readonly pages = [new Uint8Array(WIDTH * HEIGHT), new Uint8Array(WIDTH * HEIGHT)];
  /**
   * Standard's chrome: while the game is on screen, the EGA blue of the frame, its caps and the menus' borders is
   * shown as bevelled copper, and the white lines along it as a dark rim (the ultima3 Standard frame).
   */
  chrome = false;
  /** The first row the chrome applies from (the title keeps its logo's blue above its menu). */
  chromeFrom = 0;
  /** A dialog's box over the map (EGA pixels, inclusive), whose blue border the chrome takes as the frame's. */
  chromeBox: [number, number, number, number] | null = null;
  /**
   * Parts of the screen that are the frame's wherever they have its blue (EGA pixels, inclusive), beside what the
   * rules below allow: the dialogs' own frames at the title, one over another, above the rows the copper runs from.
   */
  chromeAlso: [number, number, number, number][] = [];

  /** The first row the frame may be on: where the copper runs from, or a dialog's frame above it. */
  private get chromeTop(): number {
    return Math.min(this.chromeFrom, ...this.chromeAlso.map((r) => r[1]));
  }
  /** A part of the screen that is never the frame (EGA pixels, inclusive): the attract mode's scene. */
  chromeHole: [number, number, number, number] | null = null;
  /** Standard's flash: a half-white pulse in place of a full inversion of the map. */
  softFlash = false;
  /** How a sign's letters are cut into the wall they are on (carve.ts): a groove, in the runes' red (?carve= others). */
  carve: CarveStyle = 'groove';
  /** The colour they are cut in (0xRRGGBB, colours.ts signInk): the dungeon's; 0 for the cut's own stone. */
  signInk = 0;
  private pulse: { saved: Uint32Array; shown: Uint32Array } | null = null;
  readonly hi = [new Uint32Array(HI_WIDTH * HI_HEIGHT), new Uint32Array(HI_WIDTH * HI_HEIGHT)];
  /** Each page's story words, set over it by the screen (page 0's, as it shows it). */
  words: Words[][] = [[], []];
  /** Each page's letters set by the screen (the Standard look), by their cell (cellKey). */
  letters: Map<number, Letter>[] = [new Map<number, Letter>(), new Map<number, Letter>()];
  /**
   * Whether (and how) a glyph of the game's is set as a letter by the screen: IBM.CH's letters and figures in the
   * lettering's face, RUNES.CH's rune letters in the runes'. Unset (the EGA look, or before the faces have loaded),
   * every glyph is drawn on the colour page.
   */
  letterOf?: ((font: number, code: number) => { face: Face; text: string } | null) | undefined;
  /** A letter as a stencil `side` square (32 unless given), nonzero the ink (a sign carved into a wall). */
  letterMask?: ((face: Face, text: string, side?: number) => Uint8Array | null) | undefined;
  /** The tile art the colour pages use (the EGA tiles doubled until one is set). */
  art: TileArt;
  /** The page drawn on (DRV_0f). */
  page = 0;
  pen = 15;
  dirty = true;
  private revealSeed = 0;
  /**
   * Glyphs drawn over the Standard chrome, by the key 'row:side' (the party panel's active arrow and state letters):
   * at a text cell's place, only their ink, over the copper once it is cut. `shown` says whether one still belongs.
   */
  readonly marks = new Map<string, { column: number; row: number; code: number; colour: number }>();
  markShown: (mark: { column: number; row: number }) => boolean = () => true;
  /** Rune letters waiting to dissolve into their English (the Standard look; runeReveal.ts). */
  readonly runes = new RuneReveal();
  /**
   * A sign drawn anew with each frame of a view (the dungeon's): which it is, and when it was first shown - so that
   * each drawing of it shows it as far read as it now is, rather than its runes afresh (readSign).
   */
  private sign = { key: '', since: 0 };
  /** While a sign is being drawn: when it was first shown, and the cell its wave runs from. */
  private reading: { since: number; origin: [number, number] | null } | null = null;
  /** While a sign not yet read is being drawn: its runes, and no English waiting behind them. */
  private sealed = false;
  /** RUNES.CH's letters doubled twice by EPX, as the runes are drawn beside their English. */
  private smoothed: (Uint8Array | undefined)[][] = [[], []];

  constructor(
    /** TILES.16 expanded: 512 tiles of 128 bytes, two pixels a byte; animated in place. */
    readonly tiles: Uint8Array,
    readonly fonts: Font[],
  ) {
    this.art = new EgaArt(tiles);
  }

  private get px(): Uint8Array {
    return this.pages[this.page];
  }

  private get hx(): Uint32Array {
    return this.hi[this.page];
  }

  /** Whether a box of words meets EGA pixels (x1, y1)-(x2, y2), inclusive. */
  private static meets(w: Words, x1: number, y1: number, x2: number, y2: number): boolean {
    const [a, b, c, d] = w.box;
    return a < (x2 + 1) * HI && c > x1 * HI && b < (y2 + 1) * HI && d > y1 * HI;
  }

  /** Whether a box of words stands within EGA pixels (x1, y1)-(x2, y2): its middle does. */
  private static within(w: Words, x1: number, y1: number, x2: number, y2: number): boolean {
    const cx = (w.box[0] + w.box[2]) / 2 / HI;
    const cy = (w.box[1] + w.box[3]) / 2 / HI;
    return cx >= x1 && cx < x2 + 1 && cy >= y1 && cy < y2 + 1;
  }

  /** The words on a page that anything drawn over (x1, y1)-(x2, y2) covers: gone, as pixels drawn over them would be. */
  private dropWords(page: number, x1: number, y1: number, x2: number, y2: number): void {
    const list = this.words[page];
    if (!list.length) return;
    const kept = list.filter((w) => !Framebuffer.meets(w, x1, y1, x2, y2));
    if (kept.length === list.length) return;
    this.words[page] = kept;
    if (page === 0) this.dirty = true;
  }

  /** The game's own pixels of the 8 by 8 cell at (x, y) of a page. */
  private cellPixels(page: number, x: number, y: number): Uint8Array {
    const p = this.pages[page];
    const out = new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);
    for (let r = 0; r < GLYPH_SIZE; r++) out.set(p.subarray((y + r) * WIDTH + x, (y + r) * WIDTH + x + GLYPH_SIZE), r * GLYPH_SIZE);
    return out;
  }

  /**
   * Page 0's letters that still stand - their cells' pixels as the glyph drew them - the rest let go: whatever was
   * drawn over one (a tile, a menu, a cleared line) has taken it away, as it took the glyph.
   */
  lettersShown(): Letter[] {
    const map = this.letters[0];
    const out: Letter[] = [];
    for (const [key, l] of map) {
      if (l.alpha >= 1) {
        const now = this.cellPixels(0, l.x, l.y);
        let same = true;
        for (let i = 0; i < now.length && same; i++) same = now[i] === l.ega[i];
        if (!same) {
          map.delete(key);
          continue;
        }
      }
      out.push(l);
    }
    return out;
  }

  /** The letters of a page whose cells lie within EGA pixels (x1, y1)-(x2, y2), inclusive. */
  private lettersWithin(page: number, x1: number, y1: number, x2: number, y2: number): Letter[] {
    const out: Letter[] = [];
    for (const l of this.letters[page].values())
      if (l.x >= x1 && l.y >= y1 && l.x + GLYPH_SIZE - 1 <= x2 && l.y + GLYPH_SIZE - 1 <= y2) out.push(l);
    return out;
  }

  /** The letters of a page whose cells meet EGA pixels (x1, y1)-(x2, y2), gone. */
  private dropLetters(page: number, x1: number, y1: number, x2: number, y2: number): void {
    const map = this.letters[page];
    if (!map.size) return;
    for (const [key, l] of map) if (l.x <= x2 && l.x + GLYPH_SIZE - 1 >= x1 && l.y <= y2 && l.y + GLYPH_SIZE - 1 >= y1) map.delete(key);
  }

  /** Letters put on a page at an offset (moved or copied there with their pixels). */
  private placeLetters(page: number, letters: Letter[], dx: number, dy: number): void {
    const map = this.letters[page];
    for (const l of letters) {
      const [x, y] = [l.x + dx, l.y + dy];
      if (x < 0 || y < 0 || x + GLYPH_SIZE > WIDTH || y + GLYPH_SIZE > HEIGHT) continue;
      map.set(cellKey(x, y), { ...l, x, y });
    }
  }

  /** Story words set over a page (screen.ts, from storyText.ts's setting). */
  addWords(page: number, words: Words[]): void {
    this.words[page] = [...this.words[page], ...words];
    if (page === 0) this.dirty = true;
  }

  /**
   * The words of page 1 within (x1, y1)-(x2, y2) coming onto page 0 as it is dissolved to there (the reveals), and
   * those of page 0 there going: `step` shows them `t` of the way (0 to 1), and at 1 the change is made.
   */
  revealWords(x1: number, y1: number, x2: number, y2: number): (t: number) => void {
    const going = this.words[0].filter((w) => Framebuffer.meets(w, x1, y1, x2, y2));
    const coming = this.words[1].filter((w) => Framebuffer.within(w, x1, y1, x2, y2)).map((w) => ({ ...w, alpha: 0 }));
    // The letters likewise: those there fade as the pixels under them go, those coming fade in, each over the other
    // in a cell they share. Neither is held to its pixels until the reveal is done (lettersShown).
    const going2 = [...this.letters[0].entries()].filter(
      ([, l]) => l.x <= x2 && l.x + GLYPH_SIZE - 1 >= x1 && l.y <= y2 && l.y + GLYPH_SIZE - 1 >= y1,
    );
    const coming2 = this.lettersWithin(1, x1, y1, x2, y2).map((l) => ({ ...l, alpha: 0 }));
    if (!going.length && !coming.length && !going2.length && !coming2.length) return () => undefined;
    this.words[0] = [...this.words[0], ...coming];
    for (const [key] of going2) this.letters[0].delete(key);
    const fading = [...going2.map(([, l]) => l), ...coming2];
    // Page 0 shows both while the reveal runs: kept aside from its map, which the reveal's pixels would unsettle.
    this.revealing = fading;
    for (const [, l] of going2) l.alpha = 0.999;
    return (t) => {
      for (const w of going) w.alpha = 1 - t;
      for (const w of coming) w.alpha = t;
      for (const [, l] of going2) l.alpha = Math.min(0.999, 1 - t);
      for (const l of coming2) l.alpha = Math.min(0.999, t);
      if (t >= 1) {
        this.words[0] = this.words[0].filter((w) => !going.includes(w));
        this.revealing = [];
        for (const l of coming2) {
          l.alpha = 1;
          this.letters[0].set(cellKey(l.x, l.y), l);
        }
      }
      this.dirty = true;
    };
  }

  /** Letters fading on page 0 while a reveal runs (revealWords): shown beside its own. */
  revealing: Letter[] = [];

  /**
   * What of each colour page gives a light of its own, which the dark shows (darkenUnlit) - a skeleton's eyes, a
   * field's crackle: whether each pixel does, and the colour it was drawn in, a pixel drawn over since in another
   * colour no longer counting. Made as it is first needed.
   */
  private shine: ({ lit: Uint8Array; colour: Uint32Array } | undefined)[] = [];
  /** Whether what the pen draws now gives a light of its own (shine). */
  private emitting = false;

  /** From now, what is drawn gives a light of its own (shine), or not: as ever. */
  emit(on: boolean): void {
    this.emitting = on;
  }

  private shineOf(page: number): { lit: Uint8Array; colour: Uint32Array } {
    return (this.shine[page] ??= { lit: new Uint8Array(HI_WIDTH * HI_HEIGHT), colour: new Uint32Array(HI_WIDTH * HI_HEIGHT) });
  }

  /** Whether pixel `i` of colour page `page` gives a light of its own, as it stands. */
  private shines(page: number, i: number): boolean {
    const s = this.shine[page];
    return !!s && s.lit[i] !== 0 && s.colour[i] === this.hi[page][i];
  }

  /** Pixel `i` of the colour page drawn on as giving a light of its own, in the colour it now has. */
  private shineAt(i: number): void {
    const s = this.shineOf(this.page);
    s.lit[i] = 1;
    s.colour[i] = this.hx[i];
  }

  /**
   * The dark, where the party has no light (the Standard look's dungeon): all of the box (EGA pixels, inclusive) of
   * the page being drawn black but what gives a light of its own - the eyes, a field - drawn as if lit.
   */
  darkenUnlit(x1: number, y1: number, x2: number, y2: number): void {
    const [h, p] = [this.hx, this.px];
    for (let y = y1 * HI; y < (y2 + 1) * HI; y++)
      for (let x = x1 * HI; x < (x2 + 1) * HI; x++) {
        const i = y * HI_WIDTH + x;
        if (!this.shines(this.page, i)) h[i] = 0xff000000;
      }
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) if (!this.shines(this.page, y * HI * HI_WIDTH + x * HI)) p[y * WIDTH + x] = 0;
    this.dirty = true;
  }

  /** A colour page's block for EGA pixel (x, y). */
  private block(page: Uint32Array, x: number, y: number, rgba: number): void {
    const o = y * HI * HI_WIDTH + x * HI;
    for (let r = 0; r < HI; r++) page.fill(rgba, o + r * HI_WIDTH, o + r * HI_WIDTH + HI);
  }

  private put(x: number, y: number, c: number): void {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
      this.px[y * WIDTH + x] = c & 15;
      this.block(this.hx, x, y, EGA_RGBA[c & 15]);
      if (this.emitting) for (let r = 0; r < HI; r++) for (let k = 0; k < HI; k++) this.shineAt((y * HI + r) * HI_WIDTH + x * HI + k);
    }
  }

  fill(x1: number, y1: number, x2: number, y2: number, c = this.pen): void {
    x1 = Math.max(0, x1);
    y1 = Math.max(0, y1);
    x2 = Math.min(WIDTH - 1, x2);
    y2 = Math.min(HEIGHT - 1, y2);
    const p = this.px;
    for (let y = y1; y <= y2; y++) p.fill(c & 15, y * WIDTH + x1, y * WIDTH + x2 + 1);
    const h = this.hx;
    if (this.runes.active) this.runes.forget(x1 >> 3, y1 >> 3, x2 >> 3, y2 >> 3, h);
    if (x2 >= x1) for (let y = y1 * HI; y < (y2 + 1) * HI; y++) h.fill(colourRGBA(c), y * HI_WIDTH + x1 * HI, y * HI_WIDTH + (x2 + 1) * HI);
    // Filled over, nothing there gives light any more (shine) - but what the pen fills, giving it (emit).
    const shine = this.shine[this.page];
    if (shine && x2 >= x1 && !this.emitting)
      for (let y = y1 * HI; y < (y2 + 1) * HI; y++) shine.lit.fill(0, y * HI_WIDTH + x1 * HI, y * HI_WIDTH + (x2 + 1) * HI);
    if (this.emitting && x2 >= x1)
      for (let y = y1 * HI; y < (y2 + 1) * HI; y++) for (let x = x1 * HI; x < (x2 + 1) * HI; x++) this.shineAt(y * HI_WIDTH + x);
    this.dropWords(this.page, x1, y1, x2, y2);
    this.dirty = true;
  }

  /** XOR with the pen (white inverts). */
  xorFill(x1: number, y1: number, x2: number, y2: number, c = this.pen): void {
    if (this.softFlash && x1 === VIEW_LEFT && y1 === VIEW_LEFT && x2 === VIEW_RIGHT && y2 === VIEW_RIGHT && (c & 15) === 15) {
      this.flash(x1, y1, x2, y2);
      return;
    }
    const p = this.px;
    const h = this.hx;
    for (let y = Math.max(0, y1); y <= Math.min(HEIGHT - 1, y2); y++) {
      for (let x = Math.max(0, x1); x <= Math.min(WIDTH - 1, x2); x++) {
        const was = p[y * WIDTH + x];
        const now = (p[y * WIDTH + x] ^= c & 15);
        // Where the colour page shows the EGA colour, the new one; over art, its colours turned (the same flash).
        for (let dy = 0; dy < HI; dy++) {
          for (let dx = 0; dx < HI; dx++) {
            const o = (y * HI + dy) * HI_WIDTH + x * HI + dx;
            h[o] = h[o] === EGA_RGBA[was] ? EGA_RGBA[now] : c & 15 ? (h[o] ^ 0x00ffffff) >>> 0 : h[o];
          }
        }
      }
    }
    // A letter whose cell is inverted whole is inverted with it (a member's line flashed, a shop's line chosen), its
    // pixels and its colour, and stands again when it is inverted back; one cut across is let go (lettersShown).
    if ((c & 15) === 15)
      for (const l of this.lettersWithin(this.page, x1, y1, x2, y2)) {
        for (let i = 0; i < l.ega.length; i++) l.ega[i] ^= 15;
        l.colour ^= 0xffffff;
      }
    this.dirty = true;
  }

  /**
   * The soft flash: the first inversion of the map square lightens it halfway to white, the second puts back every
   * pixel still as the first left it (the EGA page is inverted and back as ever, for anything that reads it).
   */
  private flash(x1: number, y1: number, x2: number, y2: number): void {
    const p = this.px;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) p[y * WIDTH + x] ^= 15;
    const h = this.hx;
    const w = (x2 - x1 + 1) * HI;
    const rows = (y2 - y1 + 1) * HI;
    const at = (r: number): number => (y1 * HI + r) * HI_WIDTH + x1 * HI;
    if (!this.pulse) {
      const saved = new Uint32Array(w * rows);
      const shown = new Uint32Array(w * rows);
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < w; i++) {
          const v = h[at(r) + i];
          saved[r * w + i] = v;
          const lift = (sh: number): number => (((v >>> sh) & 0xff) + 255) >> 1;
          const lit = (0xff000000 | (lift(16) << 16) | (lift(8) << 8) | lift(0)) >>> 0;
          shown[r * w + i] = lit;
          h[at(r) + i] = lit;
        }
      }
      this.pulse = { saved, shown };
    } else {
      const { saved, shown } = this.pulse;
      for (let r = 0; r < rows; r++) for (let i = 0; i < w; i++) if (h[at(r) + i] === shown[r * w + i]) h[at(r) + i] = saved[r * w + i];
      this.pulse = null;
    }
    this.dirty = true;
  }

  /**
   * The ultima3 Standard combat outline round the 16-pixel square at (x, y): rounded, two game pixels wide just
   * outside the square, in `rgba` (white, or the member's state's colour), on the colour page only and within the map.
   */
  marker(x: number, y: number, rgba = EGA_RGBA[15]): void {
    const h = this.hx;
    const stroke = 2 * HI;
    const left = (x - 2) * HI;
    const top = (y - 2) * HI;
    const size = 20 * HI;
    const r = 3 * HI;
    const lo = VIEW_LEFT * HI;
    const hi = (VIEW_RIGHT + 1) * HI;
    for (let py = top; py < top + size; py++) {
      if (py < lo || py >= hi) continue;
      for (let px = left; px < left + size; px++) {
        if (px < lo || px >= hi) continue;
        // Distance inside the rounded square's edge: the stroke is the outer `stroke` of it.
        const dx = Math.max(left + r - px - 0.5, 0, px + 0.5 - (left + size - r));
        const dy = Math.max(top + r - py - 0.5, 0, py + 0.5 - (top + size - r));
        const out = Math.hypot(dx, dy) - r;
        const edge = Math.min(px + 0.5 - left, left + size - px - 0.5, py + 0.5 - top, top + size - py - 0.5);
        const depth = dx > 0 && dy > 0 ? -out : edge;
        if (out <= 0 && depth <= stroke) h[py * HI_WIDTH + px] = rgba;
      }
    }
    this.dirty = true;
  }

  /**
   * The Standard marks round the 16-pixel square at (x, y): four triangles at its sides, drawn in game pixels (four
   * colour-page pixels) with a half-black rim like the figures'. A weapon's aim, a spell's and a member a spell is
   * for point in, their two colours fading one to the other and back over a second (`ms`, a clock in
   * milliseconds); a direction asked points out, white. On the colour page only, and within the map.
   */
  aim(x: number, y: number, ms: number, mark: Mark = 'attack'): void {
    const h = this.hx;
    const g = HI; // one game pixel
    const base = 5 * g; // each triangle's width at its foot (six cells, the nearest to the square's centre)
    const depth = 3 * g; // and its height, foot to point
    const inset = -3.5 * g; // its foot this far outside the square's side
    const left = x * HI;
    const top = y * HI;
    const size = 16 * HI;
    const lo = VIEW_LEFT * HI;
    const hi = (VIEW_RIGHT + 1) * HI;
    // The triangle pointing down from above the square, in game pixels; the others are its turns.
    const cells = new Set<number>();
    const key = (px: number, py: number): number => py * HI_WIDTH + px;
    for (let d = 0; d < depth; d += g) {
      const half = Math.round((((depth - d) / depth) * (base / 2)) / g) * g;
      for (let k = -half; k < half; k += g) {
        const mid = size / 2 + k;
        // Pointing in, the point is nearest the square; pointing out, the foot is - clear of the turn's outline, two
        // game pixels round the square - and the point furthest off.
        const at = mark === 'direction' ? -3 * g - d : inset + d;
        const near = Math.round(at);
        const far = size - Math.round(at) - g;
        cells.add(key(left + mid, top + near));
        cells.add(key(left + mid, top + far));
        cells.add(key(left + near, top + mid));
        cells.add(key(left + far, top + mid));
      }
    }
    const fill = (at: number, colour: number, half: boolean): void => {
      const px0 = at % HI_WIDTH;
      const py0 = Math.floor(at / HI_WIDTH);
      for (let dy = 0; dy < g; dy++)
        for (let dx = 0; dx < g; dx++) {
          const px = px0 + dx;
          const py = py0 + dy;
          if (px < lo || px >= hi || py < lo || py >= hi) continue;
          const i = py * HI_WIDTH + px;
          h[i] = half ? halfDark(h[i]) : colour;
        }
    };
    // The rim first, half black round the triangles; then the triangles in the moment's colour.
    const rim = new Set<number>();
    for (const at of cells)
      for (const [dx, dy] of [
        [-g, 0],
        [g, 0],
        [0, -g],
        [0, g],
        [-g, -g],
        [g, g],
        [-g, g],
        [g, -g],
      ]) {
        const next = at + dy * HI_WIDTH + dx;
        if (!cells.has(next)) rim.add(next);
      }
    for (const at of rim) fill(at, 0, true);
    const [from, to] = MARK_COLOURS[mark];
    const k = (1 - Math.cos((2 * Math.PI * (ms % 1000)) / 1000)) / 2;
    const [r, gr, b] = [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * k));
    const colour = (0xff000000 | (b << 16) | (gr << 8) | r) >>> 0;
    for (const at of cells) fill(at, colour, false);
    this.dirty = true;
  }

  /** What an overlay (a burst, a spell's pulse) covered on the colour page, to put back: its rectangle and pixels. */
  private covered: { x: number; y: number; w: number; h: number; px: Uint32Array } | null = null;

  /** Keep the colour page's pixels in a rectangle (colour-page pixels) under an overlay about to be drawn. */
  private cover(x: number, y: number, w: number, h: number): void {
    this.uncover();
    const px = new Uint32Array(w * h);
    for (let r = 0; r < h; r++) px.set(this.hx.subarray((y + r) * HI_WIDTH + x, (y + r) * HI_WIDTH + x + w), r * w);
    this.covered = { x, y, w, h, px };
  }

  /** Put back what the last overlay covered. */
  uncover(): void {
    const c = this.covered;
    if (!c) return;
    for (let r = 0; r < c.h; r++) this.hx.set(c.px.subarray(r * c.w, (r + 1) * c.w), (c.y + r) * HI_WIDTH + c.x);
    this.covered = null;
    this.dirty = true;
  }

  /**
   * A hit, as the ultima3 port's Standard look draws it: a burst over view square (x, y) that grows over three
   * frames, on the grid of sixteen - discs with a bright rim round a darker centre, then a ring the target shows
   * through - red for a blow or a missile, blue for magic. Frame 0 takes it away. On the colour page only.
   */
  burst(x: number, y: number, frame: number, magic: boolean): void {
    const left = (TILE_X + x * 16) * HI;
    const top = (TILE_Y + y * 16) * HI;
    const size = 16 * HI;
    if (frame === 0) {
      this.uncover();
      return;
    }
    if (this.covered) this.uncover();
    this.cover(left, top, size, size);
    const [centre, body, rim] = magic ? BURST_BLUE : BURST_RED;
    const radius = [0, 2.6, 4.6, 6.8][frame] ?? 6.8;
    const inner = frame === 3 ? 4.6 : frame === 2 ? 3.0 : 0;
    for (let py = 0; py < 16; py++)
      for (let px = 0; px < 16; px++) {
        const d = Math.hypot(px - 7.5, py - 7.5);
        if (d > radius || (frame === 3 && d <= inner)) continue;
        const c = d <= inner ? centre : d > radius - 1.2 ? rim : body;
        for (let r = 0; r < HI; r++)
          this.hx.fill(c, (top + py * HI + r) * HI_WIDTH + left + px * HI, (top + py * HI + r) * HI_WIDTH + left + px * HI + HI);
      }
    this.dirty = true;
  }

  /**
   * A spell's pulse, as the ultima3 port's Standard look draws it: the view (or one square of it, view square
   * (x, y), where the spell falls on one member) washed half white. `uncover` takes it away. On the colour page only.
   */
  spellPulse(square: [number, number] | null): void {
    const [x, y, w, h] = square
      ? [(TILE_X + square[0] * 16) * HI, (TILE_Y + square[1] * 16) * HI, 16 * HI, 16 * HI]
      : [TILE_X * HI, TILE_Y * HI, 11 * 16 * HI, 11 * 16 * HI];
    this.cover(x, y, w, h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const i = (y + r) * HI_WIDTH + x + c;
        const v = this.hx[i];
        const half = (k: number): number => (((v >> k) & 0xff) + 255) >> 1;
        this.hx[i] = (0xff000000 | (half(16) << 16) | (half(8) << 8) | half(0)) >>> 0;
      }
    this.dirty = true;
  }

  /** Bresenham, as PlotLine. */
  line(x1: number, y1: number, x2: number, y2: number, c = this.pen): void {
    const dx = Math.abs(x2 - x1);
    const sx = x1 < x2 ? 1 : -1;
    const dy = -Math.abs(y2 - y1);
    const sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x1, y1, c);
      const e2 = 2 * err;
      if (e2 >= dy) {
        if (x1 === x2) break;
        err += dy;
        x1 += sx;
      }
      if (e2 <= dx) {
        if (y1 === y2) break;
        err += dx;
        y1 += sy;
      }
    }
    this.dirty = true;
  }

  plot(x: number, y: number, c = this.pen): void {
    this.put(x, y, c);
    this.dirty = true;
  }

  /**
   * A tile from `tiles` (or another packed set, drawn as its EGA pixels) with its top-left at (x, y); the colour page
   * draws it from the tile art, over `ground` where the art lets it show, its shore drawn from the map at `place`.
   */
  tile(tile: number, x: number, y: number, set: Uint8Array = this.tiles, ground?: number, place?: Place, tint = 0, floor?: number): void {
    const base = tile * 128;
    const p = this.px;
    for (let r = 0; r < 16; r++) {
      const yy = y + r;
      if (yy < 0 || yy >= HEIGHT) continue;
      for (let b = 0; b < 8; b++) {
        const v = set[base + r * 8 + b];
        const xx = x + b * 2;
        if (xx >= 0 && xx < WIDTH) p[yy * WIDTH + xx] = v >> 4;
        if (xx + 1 >= 0 && xx + 1 < WIDTH) p[yy * WIDTH + xx + 1] = v & 15;
      }
    }
    if (set === this.tiles && x >= 0 && y >= 0 && x + 16 <= WIDTH && y + 16 <= HEIGHT)
      this.art.draw(this.hx, tile, x * HI, y * HI, ground, place, tint, floor);
    else {
      const h = this.hx;
      for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
          const xx = x + c;
          const yy = y + r;
          if (xx < 0 || xx >= WIDTH || yy < 0 || yy >= HEIGHT) continue;
          this.block(h, xx, yy, EGA_RGBA[p[yy * WIDTH + xx]]);
        }
      }
    }
    this.dirty = true;
  }

  /**
   * The party on foot as its members, where the tile art draws it so (the Standard look's grid of four); otherwise
   * `tile`, the party's own figure. The EGA page has the party's tile either way.
   */
  party(tile: number, figures: Figure[], x: number, y: number, terrain: number, floor?: number, place?: Place): void {
    this.tile(tile, x, y, this.tiles, terrain, place);
    if (!this.art.party || !figures.length) return;
    if (x >= 0 && y >= 0 && x + 16 <= WIDTH && y + 16 <= HEIGHT) this.art.party(this.hx, figures, x * HI, y * HI, terrain, floor, place);
  }

  /** One pixel of the tile reveal (GRAP_BUF_PutTileRevealStep). */
  revealStep(tile: number, x: number, y: number, step: number): void {
    let rx = 0;
    let ry = 0;
    if (step !== 0) {
      let seed = this.revealSeed;
      if (step === 1 || seed === 0) seed = 1;
      rx = seed >> 4;
      ry = seed & 0xf;
      const carry = seed & 1;
      seed >>= 1;
      if (carry) seed ^= 0xb8;
      this.revealSeed = seed;
    }
    const v = this.tiles[tile * 128 + ry * 8 + (rx >> 1)];
    // The EGA page takes the tile's pixel; the colour page is the tile art's (a see-through tile's ground left there).
    if (x + rx >= 0 && x + rx < WIDTH && y + ry >= 0 && y + ry < HEIGHT) {
      this.px[(y + ry) * WIDTH + x + rx] = (rx & 1 ? v & 15 : v >> 4) & 15;
      this.art.block(this.hx, tile, rx, ry, (x + rx) * HI, (y + ry) * HI);
    }
    this.dirty = true;
  }

  /**
   * A moongate rising `rows` pixels out of `floor` (a tile) at pixel (x, y) (AnimateTile_BuildMoongateTile): the
   * floor with the gate's top rows at its foot. Where the art draws the gate its own way, the floor is its floor and
   * the gate its gate, as the squares round it are drawn.
   */
  moongateRise(rows: number, floor: number, x: number, y: number): void {
    const t = new Uint8Array(128);
    t.set(this.tiles.subarray(floor * 128, floor * 128 + 128));
    const n = rows * 8;
    if (n) t.set(this.tiles.subarray(GATE * 128, GATE * 128 + n), 128 - n);
    if (!this.art.rising || x < 0 || y < 0 || x + 16 > WIDTH || y + 16 > HEIGHT) return this.tile(0, x, y, t);
    this.tile(floor, x, y);
    // The EGA page as the game built it; the colour page the art's gate over the art's floor.
    for (let r = 16 - rows; r < 16; r++)
      for (let b = 0; b < 8; b++) {
        const v = t[r * 8 + b];
        this.px[(y + r) * WIDTH + x + b * 2] = v >> 4;
        this.px[(y + r) * WIDTH + x + b * 2 + 1] = v & 15;
      }
    if (rows) this.art.rising(this.hx, GATE, rows, x * HI, y * HI);
    this.dirty = true;
  }

  /**
   * A glyph at text cell (column, row); `again` when it is drawn again from the text's record (text.ts redraw), where
   * a rune letter is drawn as read - it was read when it was first shown, or would have been.
   */
  glyph(font: number, code: number, column: number, row: number, fg: number, bg: number, again = false): void {
    const rows = this.fonts[font].rows;
    const x = column * GLYPH_SIZE;
    const y = row * GLYPH_SIZE;
    const p = this.px;
    // A sign, in the Standard look, is painted on the wall ahead rather than on 1988's plate: its cells keep the wall
    // beneath them (as the colour page had it before), and only the letters' ink is laid on it.
    const onWall = !!this.reading && font === 1 && !!this.art.fineRunes && x + GLYPH_SIZE <= WIDTH && y + GLYPH_SIZE <= HEIGHT;
    const wall = onWall ? this.cellOf(this.hx, column, row) : undefined;
    for (let r = 0; r < GLYPH_SIZE; r++) {
      const bits = rows[(code & 0x7f) * 8 + r];
      if (y + r >= HEIGHT) break;
      for (let c = 0; c < GLYPH_SIZE; c++) {
        if (x + c < WIDTH) {
          const set = (bits & (0x80 >> c)) !== 0;
          if (onWall && !set) continue;
          const col = set ? fg : bg;
          p[(y + r) * WIDTH + x + c] = col & 15;
          this.block(this.hx, x + c, y + r, colourRGBA(col));
        }
      }
    }
    // The tile set's own lettering over it on the colour page (the ultima3 port's Standard font), for the letters
    // and figures it has: twice the EGA font's grain, so its strokes are rounded where the EGA's are stepped. The
    // game's frame corners stay the game's. Its symbols are drawn as finely, and RUNES.CH - the runes, the signs'
    // frames and dividers, the moons and icons - and a rune letter waits to be read, or is shown read if drawn again.
    const c7 = code & 0x7f;
    const english = font === 1 && !this.sealed ? this.art.reading?.(c7) : null;
    // A sign read by its own clock: how far this letter is read now that it is drawn again.
    let signed: { start: number; k: number } | null = null;
    if (english && !again && this.reading) {
      const r = this.reading;
      r.origin ??= [column, row];
      const along = Math.max(0, column - r.origin[0] + (row - r.origin[1]) * 2);
      const start = r.since + HOLD_MS + along * STAGGER_MS;
      signed = { start, k: (performance.now() - start) / DISSOLVE_MS };
      if (signed.k >= 1) again = true; // read: its English, as a letter drawn again is
    }
    const reads = !!english && !again;
    // A letter the screen sets in a font (the Standard look's faces, loaded): the colour page keeps only its ground,
    // and the letter is kept over the cell - a rune with the English it will give way to. On a wall, a sign is carved
    // into the colour page from the faces' own shapes (letterMask), which must hold it.
    const fits = x + GLYPH_SIZE <= WIDTH && y + GLYPH_SIZE <= HEIGHT;
    const set = fits ? (this.letterOf?.(font, c7) ?? null) : null;
    const letters = this.letters[this.page];
    letters.delete(cellKey(x, y));
    if (set && !onWall) {
      const side = GLYPH_SIZE * HI;
      const ground = colourRGBA(bg);
      for (let r = 0; r < side; r++) this.hx.fill(ground, (y * HI + r) * HI_WIDTH + x * HI, (y * HI + r) * HI_WIDTH + x * HI + side);
      const read = english ? RUNE_ENGLISH[c7 - 0x41] : undefined;
      const own = rgbOf(colourRGBA(fg));
      const readAlready = !!(english && again && read);
      const shown = readAlready && read ? { face: 'mono' as const, text: read } : set;
      letters.set(cellKey(x, y), {
        ...shown,
        colour: readAlready ? (this.readInk ?? own) : own,
        x,
        y,
        ega: this.cellPixels(this.page, x, y),
        to: reads && read ? { face: 'mono', text: read, ...(this.readInk !== null ? { colour: this.readInk } : {}) } : undefined,
        k: 0,
        alpha: 1,
      });
    }
    const ink =
      set && !onWall
        ? null
        : font === 0
          ? (this.art.glyph?.(c7) ?? (this.art.fineSymbol?.(c7) ? this.smooth(0, c7) : null))
          : english && again
            ? (this.carved('english', c7) ?? english)
            : font === 1 && this.art.fineRunes
              ? (this.carved('runes', c7) ?? this.smooth(1, c7))
              : null;
    if (ink && fits) this.ink(this.hx, column, row, fg, bg, ink, undefined, wall);
    if (reads && signed) {
      const cell = this.runes.addAt(column, row, c7, fg, bg, this.hx, signed.start, wall);
      if (signed.k > 0) this.readRune(cell, signed.k);
    } else if (reads) this.runes.add(column, row, c7, fg, bg, this.hx, performance.now());
    else if (this.runes.active) this.runes.forget(column, row, column, row, this.hx);
    this.dirty = true;
  }

  /** A glyph of the lettering's grain (32 by 32, nonzero the ink) over text cell (column, row) of a colour page. */
  /**
   * A glyph of the lettering's grain (32 by 32, nonzero the ink) over text cell (column, row) of a colour page: where
   * there is no ink, `bg` - or, given the cell as it was (`wall`), that.
   */
  private ink(
    page: Uint32Array,
    column: number,
    row: number,
    fg: number,
    bg: number,
    ink: Uint8Array,
    over?: (i: number) => number,
    wall?: Uint32Array,
  ): void {
    const size = Math.round(Math.sqrt(ink.length)); // the glyph's side: 32, a colour pixel to each
    const k = (GLYPH_SIZE * HI) / size; // colour pixels to one of the lettering's
    const [on, off] = [colourRGBA(fg), colourRGBA(bg)];
    const [x, y] = [column * GLYPH_SIZE * HI, row * GLYPH_SIZE * HI];
    const side = GLYPH_SIZE * HI;
    if (wall && k === 1) {
      // A sign on the wall: its letter cut into it (carve.ts).
      const mask = new Uint8Array(size * size);
      for (let i = 0; i < mask.length; i++) mask[i] = (over ? over(i) : ink[i]) ? 1 : 0;
      const cut = carve(mask, wall, side, this.carve, on, this.signInk ? rgba(this.signInk) : 0);
      for (let r = 0; r < side; r++) page.set(cut.subarray(r * side, r * side + side), (y + r) * HI_WIDTH + x);
      return;
    }
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        const i = gy * size + gx;
        const inked = over ? over(i) : ink[i];
        for (let dy = 0; dy < k; dy++) {
          const at = (y + gy * k + dy) * HI_WIDTH + x + gx * k;
          if (inked) page.fill(on, at, at + k);
          else if (wall) page.set(wall.subarray((gy * k + dy) * side + gx * k, (gy * k + dy) * side + gx * k + k), at);
          else page.fill(off, at, at + k);
        }
      }
    }
  }

  /** Text cell (column, row) of a colour page as it stands: its 32 by 32 pixels, row by row. */
  private cellOf(page: Uint32Array, column: number, row: number): Uint32Array {
    const side = GLYPH_SIZE * HI;
    const out = new Uint32Array(side * side);
    const [x, y] = [column * side, row * side];
    for (let r = 0; r < side; r++) out.set(page.subarray((y + r) * HI_WIDTH + x, (y + r) * HI_WIDTH + x + side), r * side);
    return out;
  }

  /**
   * A glyph of the game's (IBM.CH 0, RUNES.CH 1) at the lettering's grain: its eight rows doubled by EPX, and again,
   * the pixels past its edge taken as the edge's own - a sign's frame runs on into the next cell, so it is not
   * rounded off where they meet.
   */
  private smooth(font: number, code: number): Uint8Array {
    let bits = this.smoothed[font][code];
    if (!bits) {
      const rows = this.fonts[font].rows;
      const plain = new Uint8Array(64);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) plain[r * 8 + c] = rows[code * 8 + r] & (0x80 >> c) ? 1 : 0;
      bits = this.smoothed[font][code] = epx(epx(plain, 8, 8, true), 16, 16, true);
    }
    return bits;
  }

  /** A symbol of the game's at the lettering's grain (32 by 32, nonzero the ink): the shape the screen fills. */
  symbolMask(font: number, code: number): Uint8Array {
    return this.smooth(font, code & 0x7f);
  }

  /** The runes' reading moved on to `now` (the screen's frame): the cells begun, part rune and part English. */
  stepRunes(now: number): void {
    this.runes.step(now, (c, k) => this.readRune(c, k));
  }

  /** Every rune waiting read at once (a key): a sign in the view too, the next time it is drawn. */
  finishRunes(): void {
    this.runes.finish((c, k) => this.readRune(c, k));
    this.sign.since = -Infinity;
  }

  /**
   * The glyphs drawn from now until `readSign(null)` are sign `key` (its place and the way it is seen from, and which
   * reading of it): shown read as far as it now is since it was first drawn so, the same hold, wave and dissolve as
   * runes printed once; a sign not the last one drawn begins again. Not `read` (not yet bumped into, nor read with Read
   * sign), its runes alone, nothing waiting to be read.
   */
  readSign(key: string | null, read = true): void {
    this.sealed = key !== null && !read;
    if (key === null || !read) {
      this.reading = null;
      return;
    }
    if (key !== this.sign.key) this.sign = { key, since: performance.now() };
    this.reading = { since: this.sign.since, origin: null };
  }

  /** How much larger than 1988's cell a sign is carved into the wall ahead (main.ts ?signscale=, the runes page). */
  signScale = 1.5;
  /**
   * The colour the runes printed from now read into English in (0xRRGGBB), or null for their own: a conversation's
   * words by their kind (talk.ts flushWord, runeWords.ts) - a mantra blue, a dungeon's Word or name red, else grey.
   */
  readInk: number | null = null;
  /** Whether a sign is cut into a bolted plate on the wall rather than the wall itself (?signplate=off, runes page). */
  signPlate = true;
  /** When the sign carved last will have been read to its last letter (performance.now()); 0 while unread. */
  signReadBy = 0;

  /**
   * Sign `text` carved into the wall ahead as the Standard look draws it (dungeon.ts sign): laid out anew, larger
   * (signScale, signLayout.ts), each rune cut into the wall as the colour page has it; `read` - bumped into, or read
   * with Read sign - giving way to its English from when it was first drawn so (`key`, as readSign keys it), the
   * same hold, wave and dissolve as runes printed, as far as it has got each time the view is drawn. False where the
   * faces are not to hand, and the sign is printed as 1988 printed it.
   */
  carveSign(text: string, left: number, top: number, key: string, read: boolean): boolean {
    const mask = this.letterMask;
    if (!mask) return false;
    const layout = signLayout(text, left, top, this.signScale);
    const { cell, letters } = layout;
    // Cut at the grain of the corridor's pictures round it (shown at twice 1988's size): squares of GRAIN colour
    // pixels, a letter `side` of them across, each on that grid, as the plate is drawn.
    const side = Math.round((cell * HI) / GRAIN);
    const shapes = letters.map((l) =>
      l.code >= 0x41 && l.code <= 0x5f
        ? [mask('runes', RUNE_LETTER[l.code - 0x41], side), mask('mono', RUNE_ENGLISH[l.code - 0x41], side)]
        : [null, null],
    );
    if (shapes.some(([r, e], n) => letters[n].code >= 0x41 && letters[n].code <= 0x5f && (!r || !e))) return false;
    if (read && key !== this.sign.key) this.sign = { key, since: performance.now() };
    const last = Math.max(0, ...letters.map((l) => l.along));
    this.signReadBy = read ? this.sign.since + HOLD_MS + (last - 1) * STAGGER_MS + DISSOLVE_MS : 0;
    const now = performance.now();
    // A square of the letter's cell, as the dissolve's order has it for a cell of 32 (DISSOLVE_ORDER).
    const order = (i: number): number =>
      DISSOLVE_ORDER[Math.floor((Math.floor(i / side) * 32) / side) * 32 + Math.floor(((i % side) * 32) / side)];
    this.cutSign(this.hx, HI_WIDTH, 0, 0, layout, side, (n) => {
      const [rune, english] = shapes[n];
      if (!rune || !english) return null;
      const k = read ? (now - (this.sign.since + HOLD_MS + (letters[n].along - 1) * STAGGER_MS)) / DISSOLVE_MS : 0;
      return k <= 0 ? rune : k >= 1 ? english : rune.map((v, i) => (order(i) < k ? english[i] : v));
    });
    this.dirty = true;
    return true;
  }

  /**
   * A sign cut into `dst` (colour pixels, `stride` to a row, its top left the page's (ox, oy)): its plate, then each
   * letter as `shapeOf` gives it, carved into what is under it, at the grain of the corridor's pictures on the page's
   * own grid.
   */
  private cutSign(
    dst: Uint32Array,
    stride: number,
    ox: number,
    oy: number,
    { letters, plate: board }: ReturnType<typeof signLayout>,
    side: number,
    shapeOf: (n: number) => Uint8Array | null,
    ink?: Uint8Array,
  ): void {
    const on = (v: number): number => Math.round((v * HI) / GRAIN) * GRAIN;
    if (this.signPlate && letters.length) {
      const [x1, y1, x2, y2] = [board.x1, board.y1, board.x2, board.y2].map(on);
      plate(dst, stride, x1 - ox, y1 - oy, x2 - x1, y2 - y1, HI);
    }
    const [white, tint] = [colourRGBA(15), this.signInk ? rgba(this.signInk) : 0];
    letters.forEach((l, n) => {
      const shape = shapeOf(n);
      if (!shape) return;
      const [x, y] = [on(l.x) - ox, on(l.y) - oy];
      // The wall under it a square at a time (each square's top left pixel), cut, and put back a square at a time.
      const wall = new Uint32Array(side * side);
      for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) wall[r * side + c] = dst[(y + r * GRAIN) * stride + x + c * GRAIN];
      const cut = carve(shape, wall, side, this.carve, white, tint);
      for (let r = 0; r < side; r++)
        for (let c = 0; c < side; c++)
          for (let dy = 0; dy < GRAIN; dy++) {
            const at = (y + r * GRAIN + dy) * stride + x + c * GRAIN;
            dst.fill(cut[r * side + c], at, at + GRAIN);
            // Which pixels are the letters' (`ink`, where asked for): for drawing the sign smaller without losing them.
            if (ink && shape[r * side + c]) ink.fill(1, at, at + GRAIN);
          }
    });
  }

  /** Signs as seen from further off (farSign, sideSign): each drawn flat once, its runes on its plate, and kept. */
  private flats = new Map<string, Flat | null>();

  /**
   * Sign `text` as it would stand on the wall right ahead, in its runes on its plate - never read, too far off - on
   * nothing (see-through round it): the wall's box (SIGN_WALL), in colour pixels on the page's grid. Null where the
   * faces are not to hand or the sign has no plate. Kept, by the sign and how signs are cut.
   */
  private flatSign(text: string, left: number, top: number): Flat | null {
    const key = [text, left, top, this.carve, this.signScale, this.signInk, this.signPlate].join('|');
    if (this.flats.has(key)) return this.flats.get(key) ?? null;
    const mask = this.letterMask;
    let flat: Flat | null = null;
    if (mask && this.signPlate) {
      const layout = signLayout(text, left, top, this.signScale);
      const side = Math.round((layout.cell * HI) / GRAIN);
      const runes = layout.letters.map((l) => (l.code >= 0x41 && l.code <= 0x5f ? mask('runes', RUNE_LETTER[l.code - 0x41], side) : null));
      if (layout.letters.length && runes.every((r, n) => r || layout.letters[n].code < 0x41 || layout.letters[n].code > 0x5f)) {
        const [w, h] = [(SIGN_WALL.x2 - SIGN_WALL.x1) * HI, (SIGN_WALL.y2 - SIGN_WALL.y1) * HI];
        const [px, ink] = [new Uint32Array(w * h), new Uint8Array(w * h)];
        this.cutSign(px, w, SIGN_WALL.x1 * HI, SIGN_WALL.y1 * HI, layout, side, (n) => runes[n], ink);
        flat = { px, ink, w, h };
      }
    }
    // Faces not loaded yet are not kept as no sign: asked again, it is made once they are.
    if (flat || !mask) this.flats.set(key, flat);
    return flat;
  }

  /**
   * Sign `text` laid on the page from its flat drawing (flatSign), in the box (DOS pixels) `x1`-`x2`, `y1`-`y2`, a
   * square of the corridor pictures' grain at a time: `face` gives for a square's middle the point of the wall right
   * ahead it shows (DOS pixels), or null for none - the sign as the wall it is on is seen.
   */
  private laySign(
    text: string,
    left: number,
    top: number,
    [x1, y1, x2, y2]: [number, number, number, number],
    face: (x: number, y: number) => [number, number] | null,
    touching = false,
  ): void {
    const flat = this.flatSign(text, left, top);
    if (!flat) return;
    const h = this.hx;
    // A point of the wall right ahead as a pixel of the flat drawing, or -1 off it.
    const at = (x: number, y: number): number => {
      const [fx, fy] = [Math.floor(x * HI) - SIGN_WALL.x1 * HI, Math.floor(y * HI) - SIGN_WALL.y1 * HI];
      return fx < 0 || fy < 0 || fx >= flat.w || fy >= flat.h ? -1 : fy * flat.w + fx;
    };
    for (let py = Math.floor((y1 * HI) / GRAIN) * GRAIN; py < y2 * HI; py += GRAIN)
      for (let px = Math.floor((x1 * HI) / GRAIN) * GRAIN; px < x2 * HI; px += GRAIN) {
        const mid = face((px + GRAIN / 2) / HI, (py + GRAIN / 2) / HI);
        if (!mid) continue;
        let i = at(mid[0], mid[1]);
        // `touching`: a square any part of a letter falls in shows the letter - the letter pixel nearest its middle -
        // so a stroke thinner than a square seen from further off is not lost between them.
        if (touching && i >= 0 && !flat.ink[i]) {
          const [a, b] = [face(px / HI, py / HI), face((px + GRAIN) / HI, (py + GRAIN) / HI)];
          if (a && b) {
            let best = Infinity;
            const [mx, my] = [mid[0] * HI, mid[1] * HI];
            for (let fy = Math.min(a[1], b[1]) * HI; fy < Math.max(a[1], b[1]) * HI; fy += GRAIN)
              for (let fx = Math.min(a[0], b[0]) * HI; fx < Math.max(a[0], b[0]) * HI; fx += GRAIN) {
                const j = at(fx / HI, fy / HI);
                if (j < 0 || !flat.ink[j]) continue;
                const d = (fx - mx) ** 2 + (fy - my) ** 2;
                if (d < best) [best, i] = [d, j];
              }
          }
        }
        if (i < 0) continue;
        const v = flat.px[i];
        if (!v) continue;
        for (let dy = 0; dy < GRAIN; dy++) h.fill(v, (py + dy) * HI_WIDTH + px, (py + dy) * HI_WIDTH + px + GRAIN);
      }
    this.dirty = true;
  }

  /**
   * Sign `text` on the wall two squares ahead (dungeon.ts wallAhead, the Standard look's): as it stands on the wall
   * right ahead, shrunk as that wall is to this one (the passage's squares, WALLS), in its runes alone - too far off to
   * be read. Nothing where the sign has no plate.
   */
  farSign(text: string, left: number, top: number): void {
    const [near, far] = [WALLS.halves[1], WALLS.halves[2]];
    const [cx, cy] = [WALLS.x, WALLS.y];
    this.laySign(
      text,
      left,
      top,
      [cx - far, cy - far, cx + far, cy + far],
      (x, y) => [cx + ((x - cx) * near) / far, cy + ((y - cy) * near) / far],
      true,
    );
  }

  /**
   * Sign `text` on a side wall (dungeon.ts sideWall, the Standard look's): `side` 0 the left, 1 the right, beside the
   * party's own square (`depth` 0) or the one ahead (1) - in its runes on its plate, as the wall right ahead has it,
   * running away down the passage as the side wall does: nearer is larger, the distance along the wall going as one
   * over the size. Read as one would facing the wall: from its near end on the left, its far end on the right.
   */
  sideSign(text: string, left: number, top: number, side: number, depth: number): void {
    const [hd, hf, near] = [WALLS.halves[depth], WALLS.halves[depth + 1], WALLS.halves[1]];
    const [cx, cy] = [WALLS.x, WALLS.y];
    const box: [number, number, number, number] = side === 0 ? [cx - hd, cy - hd, cx - hf, cy + hd] : [cx + hf, cy - hd, cx + hd, cy + hd];
    this.laySign(text, left, top, box, (x, y) => {
      const h = Math.abs(x - cx);
      if (h < hf || h > hd) return null;
      // How far along the wall (0 its near end, 1 its far), and how far down it (0 its top).
      const u = (1 / h - 1 / hd) / (1 / hf - 1 / hd);
      const v = (y - cy) / (2 * h) + 0.5;
      if (v < 0 || v > 1) return null;
      const across = side === 0 ? u : 1 - u;
      return [cx - near + across * 2 * near, cy - near + v * 2 * near];
    });
  }

  /** A rune letter's stencil from the faces (a sign carved into a wall), or null where they are not to hand. */
  private carved(face: 'runes' | 'english', code: number): Uint8Array | null {
    if (code < 0x41 || code > 0x5f || !this.letterMask) return null;
    if (face === 'english') return this.letterMask('mono', RUNE_ENGLISH[code - 0x41]);
    return this.letterMask(face, RUNE_LETTER[code - 0x41]);
  }

  private readRune(c: RuneCell, k: number): void {
    // A rune set as a letter gives way to its English over the cell; one carved into a wall, on the colour page.
    const page = this.hi.findIndex((h) => h === c.page);
    const letter = page >= 0 ? this.letters[page].get(cellKey(c.column * GLYPH_SIZE, c.row * GLYPH_SIZE)) : undefined;
    if (letter?.to) {
      letter.k = k;
      if (k >= 1) Object.assign(letter, { ...letter.to, to: undefined, k: 0 });
      if (page === 0) this.dirty = true;
      return;
    }
    const english = this.carved('english', c.code) ?? this.art.reading?.(c.code);
    if (!english) return;
    const rune = this.carved('runes', c.code) ?? this.smooth(1, c.code);
    this.ink(c.page, c.column, c.row, c.fg, c.bg, english, (i) => (DISSOLVE_ORDER[i] < k ? english[i] : rune[i]), c.wall);
    this.dirty = true;
  }

  /** Move a pixel rectangle up (negative) or down (positive), clearing what it uncovers (DRV_27). */
  scroll(x1: number, y1: number, x2: number, y2: number, amount: number, clear = 0): void {
    const p = this.px;
    const w = x2 - x1 + 1;
    if (amount < 0) {
      const n = -amount;
      for (let y = y1; y <= y2 - n; y++) p.copyWithin(y * WIDTH + x1, (y + n) * WIDTH + x1, (y + n) * WIDTH + x1 + w);
      for (let y = Math.max(y1, y2 - n + 1); y <= y2; y++) p.fill(clear, y * WIDTH + x1, y * WIDTH + x1 + w);
    } else if (amount > 0) {
      for (let y = y2; y >= y1 + amount; y--) p.copyWithin(y * WIDTH + x1, (y - amount) * WIDTH + x1, (y - amount) * WIDTH + x1 + w);
      for (let y = y1; y < Math.min(y2 + 1, y1 + amount); y++) p.fill(clear, y * WIDTH + x1, y * WIDTH + x1 + w);
    }
    // The colour page moves the same rows, at its scale, and the runes waiting there with them (a row at a time).
    const h = this.hx;
    if (this.runes.active) {
      const [c1, r1, c2, r2] = [x1 >> 3, y1 >> 3, x2 >> 3, y2 >> 3];
      if (amount === -GLYPH_SIZE) this.runes.scroll(c1, r1, c2, r2, h);
      else if (amount !== 0) this.runes.forget(c1, r1, c2, r2, h);
    }
    if (amount !== 0) {
      this.dropWords(this.page, x1, y1, x2, y2);
      // The letters go with their rows; those carried out of the rectangle are gone.
      const moving = this.lettersWithin(this.page, x1, y1, x2, y2);
      this.dropLetters(this.page, x1, y1, x2, y2);
      this.placeLetters(
        this.page,
        moving.filter((l) => l.y + amount >= y1 && l.y + amount + GLYPH_SIZE - 1 <= y2),
        0,
        amount,
      );
    }
    const [hx1, hy1, hy2, hw, n] = [x1 * HI, y1 * HI, y2 * HI + HI - 1, w * HI, Math.abs(amount) * HI];
    const fill = EGA_RGBA[clear & 15];
    if (amount < 0) {
      for (let y = hy1; y <= hy2 - n; y++) h.copyWithin(y * HI_WIDTH + hx1, (y + n) * HI_WIDTH + hx1, (y + n) * HI_WIDTH + hx1 + hw);
      for (let y = Math.max(hy1, hy2 - n + 1); y <= hy2; y++) h.fill(fill, y * HI_WIDTH + hx1, y * HI_WIDTH + hx1 + hw);
    } else if (amount > 0) {
      for (let y = hy2; y >= hy1 + n; y--) h.copyWithin(y * HI_WIDTH + hx1, (y - n) * HI_WIDTH + hx1, (y - n) * HI_WIDTH + hx1 + hw);
      for (let y = hy1; y < Math.min(hy2 + 1, hy1 + n); y++) h.fill(fill, y * HI_WIDTH + hx1, y * HI_WIDTH + hx1 + hw);
    }
    this.dirty = true;
  }

  /** Copy a rectangle between pages (GRAP_BUF_TransferPage). */
  transfer(from: number, to: number, x1: number, y1: number, x2: number, y2: number, dx = x1, dy = y1): void {
    const s = this.pages[from];
    const d = this.pages[to];
    for (let y = 0; y <= y2 - y1; y++) d.set(s.subarray((y + y1) * WIDTH + x1, (y + y1) * WIDTH + x2 + 1), (y + dy) * WIDTH + dx);
    const hs = this.hi[from];
    const hd = this.hi[to];
    if (this.runes.active) this.runes.forget(dx >> 3, dy >> 3, (dx + x2 - x1) >> 3, (dy + y2 - y1) >> 3, hd);
    for (let y = 0; y < (y2 - y1 + 1) * HI; y++) {
      const sy = y1 * HI + y;
      hd.set(hs.subarray(sy * HI_WIDTH + x1 * HI, sy * HI_WIDTH + (x2 + 1) * HI), (dy * HI + y) * HI_WIDTH + dx * HI);
    }
    // The words and letters go with the pixels: those under the copy gone, those within what is copied brought, moved
    // as it is.
    const carried = this.lettersWithin(from, x1, y1, x2, y2);
    this.dropLetters(to, dx, dy, dx + x2 - x1, dy + y2 - y1);
    this.placeLetters(to, carried, dx - x1, dy - y1);
    const moving = this.words[from].filter((w) => Framebuffer.within(w, x1, y1, x2, y2));
    this.dropWords(to, dx, dy, dx + x2 - x1, dy + y2 - y1);
    if (moving.length) {
      const [ox, oy] = [(dx - x1) * HI, (dy - y1) * HI];
      this.words[to] = [
        ...this.words[to],
        ...moving.map((w) => ({
          ...w,
          box: [w.box[0] + ox, w.box[1] + oy, w.box[2] + ox, w.box[3] + oy] as Words['box'],
          run: { ...w.run, x: w.run.x + ox, y: w.run.y + oy },
        })),
      ];
    }
    this.dirty = true;
  }

  /**
   * Pixels (x1, y1)-(x2, y2) of page `from` shrunk into the box (dx, dy, dw, dh) of page `to`, both layers: the colour
   * page's each pixel the average of those it covers, the EGA page's the nearest (the dungeon's view made small, or
   * grown to the map's square). `clip`, the box's columns alone to be drawn (EGA pixels, inclusive): where only they
   * were drawn anew at the source.
   */
  transferScaled(from: number, to: number, [x1, y1, x2, y2]: number[], [dx, dy, dw, dh]: number[], clip?: number[]): void {
    const [c1, c2] = clip ?? [dx, dx + dw - 1];
    this.dropWords(to, c1, dy, c2, dy + dh - 1);
    const sw = x2 - x1 + 1;
    const sh = y2 - y1 + 1;
    // Within one page (a view grown where it lies, to be dissolved to): the source read from a copy of the page.
    const s = from === to ? this.pages[from].slice() : this.pages[from];
    const d = this.pages[to];
    for (let y = 0; y < dh; y++)
      for (let x = c1 - dx; x <= c2 - dx; x++)
        d[(dy + y) * WIDTH + dx + x] = s[(y1 + Math.floor(((y + 0.5) * sh) / dh)) * WIDTH + x1 + Math.floor(((x + 0.5) * sw) / dw)];
    const hs = from === to ? this.hi[from].slice() : this.hi[from];
    const hd = this.hi[to];
    const [SW, SH, DW, DH] = [sw * HI, sh * HI, dw * HI, dh * HI];
    // Each pixel the source's pixels it covers, each weighed by how much of it they cover: grown by a tenth (the
    // dungeon's view to the map's square), a pixel is one source pixel or two blended where it straddles them - where
    // the nearest alone doubled every tenth row and column, and the view's walls and letters came out uneven.
    const xs = areaTaps(SW, DW);
    const ys = areaTaps(SH, DH);
    const [from0, to0] = [(c1 - dx) * HI, (c2 - dx + 1) * HI];
    const w = to0 - from0;
    // Across first, the source's rows to the square's columns, then down; weights in 256ths, red and blue worked as
    // one number (0x00bb00rr) and green as another.
    const across = new Uint32Array(SH * w);
    for (let sy = 0; sy < SH; sy++) {
      const row = (y1 * HI + sy) * HI_WIDTH + x1 * HI;
      for (let x = from0; x < to0; x++) {
        let rb = 0x800080; // a half in each, to round
        let g = 0x8000;
        for (let i = xs.start[x]; i < xs.start[x + 1]; i++) {
          const v = hs[row + xs.at[i]];
          rb += (v & 0xff00ff) * xs.weight[i];
          g += (v & 0xff00) * xs.weight[i];
        }
        across[sy * w + x - from0] = ((rb >>> 8) & 0xff00ff) | ((g >>> 8) & 0xff00);
      }
    }
    for (let y = 0; y < DH; y++) {
      const out = (dy * HI + y) * HI_WIDTH + dx * HI + from0;
      for (let x = 0; x < w; x++) {
        let rb = 0x800080;
        let g = 0x8000;
        for (let j = ys.start[y]; j < ys.start[y + 1]; j++) {
          const v = across[ys.at[j] * w + x];
          rb += (v & 0xff00ff) * ys.weight[j];
          g += (v & 0xff00) * ys.weight[j];
        }
        hd[out + x] = (0xff000000 | ((rb >>> 8) & 0xff00ff) | ((g >>> 8) & 0xff00)) >>> 0;
      }
    }
    this.dirty = true;
  }

  /**
   * GRAP_BUF_PutImage: a picture, clipped, masked where it has a mask; flags 1 flip vertically, 2 horizontally.
   * `over` changes what the colour page shows (the EGA page gets the picture as ever): the picture in other
   * colours (`rgba`, `scale` times the picture's size, memory order), a figure drawn into a box instead (`figure`,
   * a square tile, see-through where clear, in EGA pixels `box`), or nothing (`skip`).
   */
  image(v: Picture, x: number, y: number, flags = 0, over?: ImageOver): void {
    this.dropWords(this.page, x, y, x + v.width - 1, y + v.height - 1);
    const vflip = (flags & 1) !== 0;
    const hflip = (flags & 2) !== 0;
    const byteWidth = (v.width + 1) >> 1;
    const h = this.hx;
    for (let yy = 0; yy < v.height; yy++) {
      const sy = vflip ? v.height - yy - 1 : yy;
      const dy = vflip ? y + yy + 1 : y + yy;
      const row = sy * v.stride;
      const mrow = v.mask ? sy * v.mask.stride : 0;
      for (let bx = 0; bx < byteWidth; bx++) {
        const packed = v.pixels[row + bx];
        for (let half = 0; half < 2; half++) {
          const rx = bx * 2 + half;
          if (rx >= v.width) break;
          if (v.mask && (v.mask.bits[mrow + (rx >> 3)] & (0x80 >> (rx & 7))) !== 0) continue;
          const c = half === 0 ? packed >> 4 : packed & 15;
          const dx = hflip ? x + v.width - 2 - bx * 2 + (half === 0 ? 0 : -1) : x + rx;
          if (!over) {
            this.put(dx, dy, c);
            continue;
          }
          if (dx < 0 || dx >= WIDTH || dy < 0 || dy >= HEIGHT) continue;
          this.px[dy * WIDTH + dx] = c & 15;
          if (over.kind === 'rgba') {
            // A block of colour pixels to the EGA one, from the picture at its own scale, turned about with it where
            // it is flipped.
            const k = over.scale;
            const at = dy * HI * HI_WIDTH + dx * HI;
            for (let uy = 0; uy < HI; uy++) {
              const fy = Math.floor(((vflip ? HI - 1 - uy : uy) * k) / HI);
              for (let ux = 0; ux < HI; ux++) {
                const fx = Math.floor(((hflip ? HI - 1 - ux : ux) * k) / HI);
                h[at + uy * HI_WIDTH + ux] = over.px[(sy * k + fy) * over.width + rx * k + fx];
              }
            }
          }
        }
      }
    }
    this.dirty = true;
  }

  /**
   * A square figure scaled (nearest) into a box of EGA pixels on the colour page: its own outline (the opaque part)
   * made as tall as the box or as wide, whichever it reaches first, standing on the box's foot, centred across.
   */
  private figure(px: Uint32Array, [bx, by, bw, bh]: [number, number, number, number], bounds?: Bounds): void {
    const n = Math.round(Math.sqrt(px.length));
    // Fitted by its outline - all its frames' where given, so that as it moves only what moves does (the sword arm
    // raised), not the whole figure fitted afresh to each frame's own.
    const [x0, y0, x1, y1] = bounds ?? figureBounds(px);
    if (x1 < 0) return;
    const fw = x1 - x0 + 1;
    const fh = y1 - y0 + 1;
    const h = this.hx;
    const w = bw * HI;
    const ht = bh * HI;
    const k = Math.min(w / fw, ht / fh);
    const dw = Math.max(1, Math.round(fw * k));
    const dh = Math.max(1, Math.round(fh * k));
    const ox = bx * HI + Math.floor((w - dw) / 2);
    const oy = by * HI + ht - dh;
    for (let y = 0; y < dh; y++) {
      const ty = oy + y;
      if (ty < 0 || ty >= HI_HEIGHT) continue;
      const sy = y0 + Math.min(fh - 1, Math.floor(y / k));
      for (let x = 0; x < dw; x++) {
        const tx = ox + x;
        if (tx < 0 || tx >= HI_WIDTH) continue;
        const v = px[sy * n + x0 + Math.min(fw - 1, Math.floor(x / k))];
        const a = v >>> 24;
        if (a === 255) h[ty * HI_WIDTH + tx] = v;
        else if (a) {
          const base = h[ty * HI_WIDTH + tx];
          const t = a / 255;
          const m = (sh: number): number => Math.round(((v >>> sh) & 0xff) * t + ((base >>> sh) & 0xff) * (1 - t));
          h[ty * HI_WIDTH + tx] = (0xff000000 | (m(16) << 16) | (m(8) << 8) | m(0)) >>> 0;
        }
      }
    }
  }

  /** GRAP_BUF_PutBitImage: set bits in `colour` (white); the rest left as it was. In every look, the game's own pixels. */
  bitImage(v: BitPicture, x: number, y: number, colour = 15): void {
    for (let yy = 0; yy < v.height; yy++)
      for (let xx = 0; xx < v.width; xx++)
        if ((v.bits[yy * v.stride + (xx >> 3)] & (0x80 >> (xx & 7))) !== 0) this.put(x + xx, y + yy, colour);
    this.dirty = true;
  }

  /** The view as it was when a fall began (viewSlide): the box, in colour pixels, and its pixels, row by row. */
  private slid: { x: number; y: number; w: number; h: number; px: Uint32Array } | null = null;

  /**
   * The party falling (dungeon.ts pitTrap, the Standard look's): the box (EGA pixels, inclusive) of the page shown
   * as it was when the fall began, slid up by `k` of its height (0 to 1), black rising behind it; null lets it go.
   */
  viewSlide(x1: number, y1: number, x2: number, y2: number, k: number | null): void {
    if (k === null) {
      this.slid = null;
      return;
    }
    const h0 = this.hx;
    const [x, y, w, h] = [x1 * HI, y1 * HI, (x2 - x1 + 1) * HI, (y2 - y1 + 1) * HI];
    if (!this.slid) {
      const px = new Uint32Array(w * h);
      for (let r = 0; r < h; r++) px.set(h0.subarray((y + r) * HI_WIDTH + x, (y + r) * HI_WIDTH + x + w), r * w);
      this.slid = { x, y, w, h, px };
    }
    const s = this.slid;
    const off = Math.round(Math.max(0, Math.min(1, k)) * s.h);
    for (let r = 0; r < s.h; r++) {
      const at = (s.y + r) * HI_WIDTH + s.x;
      if (r + off < s.h) h0.set(s.px.subarray((r + off) * s.w, (r + off + 1) * s.w), at);
      else h0.fill(0xff000000, at, at + s.w);
    }
    this.dirty = true;
  }

  /** A row of page 0 from page 1 (the effects' raw access). */
  copyRow(
    fromPage: number,
    fromY: number,
    toPage: number,
    toY: number,
    and = 0xf,
    keep: readonly [number, number, number, number][] = [],
  ): void {
    if (fromY < 0 || fromY >= HEIGHT || toY < 0 || toY >= HEIGHT) return;
    // The row but for what lies in `keep` (EGA pixels, inclusive): the spans of it between them.
    let spans: [number, number][] = [[0, WIDTH - 1]];
    for (const [x1, y1, x2, y2] of keep) {
      if (toY < y1 || toY > y2) continue;
      spans = spans.flatMap(([a, b]): [number, number][] =>
        x2 < a || x1 > b
          ? [[a, b]]
          : (
              [
                [a, x1 - 1],
                [x2 + 1, b],
              ] as [number, number][]
            ).filter(([l, r]) => l <= r),
      );
    }
    const within = (x: number): boolean => spans.some(([a, b]) => x >= a && x <= b);
    for (const [a, b] of spans) this.dropWords(toPage, a, toY, b, toY);
    // A letter comes with its cell's top row; the rest of its rows follow it, or it is let go when shown (lettersShown).
    if (this.letters[fromPage].size)
      this.placeLetters(
        toPage,
        [...this.letters[fromPage].values()].filter((l) => l.y === fromY && within(l.x)),
        0,
        toY - fromY,
      );
    const s = this.pages[fromPage];
    const d = this.pages[toPage];
    const hs = this.hi[fromPage];
    const hd = this.hi[toPage];
    for (const [a, b] of spans) {
      for (let x = a; x <= b; x++) d[toY * WIDTH + x] = s[fromY * WIDTH + x] & and;
      for (let r = 0; r < HI; r++) {
        const from = (fromY * HI + r) * HI_WIDTH;
        const to = (toY * HI + r) * HI_WIDTH;
        if (and === 0xf) hd.set(hs.subarray(from + a * HI, from + (b + 1) * HI), to + a * HI);
        else for (let x = a * HI; x < (b + 1) * HI; x++) hd[to + x] = EGA_RGBA[d[toY * WIDTH + Math.floor(x / HI)]];
      }
    }
    this.dirty = true;
  }

  /** One pixel from a page to another (the reveals' raw access). */
  copyPixel(fromPage: number, toPage: number, x: number, y: number): void {
    this.pages[toPage][y * WIDTH + x] = this.pages[fromPage][y * WIDTH + x];
    const hs = this.hi[fromPage];
    const hd = this.hi[toPage];
    const o = y * HI * HI_WIDTH + x * HI;
    for (let r = 0; r < HI; r++) hd.set(hs.subarray(o + r * HI_WIDTH, o + r * HI_WIDTH + HI), o + r * HI_WIDTH);
  }

  /** A page's contents, both layers and its words (to put back with restorePage). */
  snapshot(page: number): Snapshot {
    return {
      ega: this.pages[page].slice(),
      hi: this.hi[page].slice(),
      words: this.words[page].map((w) => ({ ...w })),
      letters: new Map(this.letters[page]),
    };
  }

  /** Where a page is drawn on: 320 by 200, nonzero where its EGA pixel is not black (storyText.ts clearSpaces). */
  litMap(page: number): Uint8Array {
    const p = this.pages[page];
    const out = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0; i < out.length; i++) out[i] = p[i] ? 1 : 0;
    return out;
  }

  /** A figure (a tile of the Standard art's, its RGBA) over the page drawn on, in a box of EGA pixels: its opaque part. */
  drawFigure(px: Uint32Array, box: [number, number, number, number], bounds?: Bounds): void {
    this.figure(px, box, bounds);
    this.dirty = true;
  }

  /**
   * A tile of the Standard art's (its RGBA, a square) shrunk or grown into a box of EGA pixels (x, y, w, h), over the
   * page drawn on: each pixel the average of the tile's it covers, so a tile halved stays smooth. `trim` fits the
   * tile's opaque part to the box, centred (a figure); else the whole square fills it. Only what falls within `clip`
   * (EGA pixels, inclusive) is drawn, where it is given.
   */
  drawScaled(
    px: Uint32Array,
    [bx, by, bw, bh]: [number, number, number, number],
    trim = false,
    clip: [number, number, number, number] = [0, 0, WIDTH - 1, HEIGHT - 1],
  ): void {
    const n = Math.round(Math.sqrt(px.length));
    let [x0, y0, x1, y1] = [0, 0, n - 1, n - 1];
    if (trim) {
      [x0, y0, x1, y1] = [n, n, -1, -1];
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          if (px[y * n + x] >>> 24 === 0) continue;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      if (x1 < 0) return;
    }
    const fw = x1 - x0 + 1;
    const fh = y1 - y0 + 1;
    const k = Math.min((bw * HI) / fw, (bh * HI) / fh);
    const dw = Math.max(1, Math.round(fw * k));
    const dh = Math.max(1, Math.round(fh * k));
    const ox = bx * HI + Math.floor((bw * HI - dw) / 2);
    const oy = by * HI + Math.floor((bh * HI - dh) / 2);
    // Samples a side for each pixel drawn: as many of the tile's pixels as it covers.
    const m = Math.max(1, Math.ceil(1 / k));
    const h = this.hx;
    const [cx1, cy1] = [Math.max(0, clip[0] * HI), Math.max(0, clip[1] * HI)];
    const [cx2, cy2] = [Math.min(HI_WIDTH, (clip[2] + 1) * HI), Math.min(HI_HEIGHT, (clip[3] + 1) * HI)];
    for (let y = 0; y < dh; y++) {
      const ty = oy + y;
      if (ty < cy1 || ty >= cy2) continue;
      for (let x = 0; x < dw; x++) {
        const tx = ox + x;
        if (tx < cx1 || tx >= cx2) continue;
        let [r, gr, b, a] = [0, 0, 0, 0];
        for (let j = 0; j < m; j++) {
          const sy = y0 + Math.min(fh - 1, Math.floor((y + (j + 0.5) / m) / k));
          for (let i = 0; i < m; i++) {
            const v = px[sy * n + x0 + Math.min(fw - 1, Math.floor((x + (i + 0.5) / m) / k))];
            const va = v >>> 24;
            r += (v & 0xff) * va;
            gr += ((v >>> 8) & 0xff) * va;
            b += ((v >>> 16) & 0xff) * va;
            a += va;
          }
        }
        if (a === 0) continue;
        const t = a / (255 * m * m);
        const base = h[ty * HI_WIDTH + tx];
        const mix = (sum: number, sh: number): number => Math.round((sum / a) * t + ((base >>> sh) & 0xff) * (1 - t));
        h[ty * HI_WIDTH + tx] = (0xff000000 | (mix(b, 16) << 16) | (mix(gr, 8) << 8) | mix(r, 0)) >>> 0;
      }
    }
    this.dirty = true;
  }

  /** A rectangle of EGA pixels (x1, y1)-(x2, y2) of a page put back, both layers, from a snapshot of it. */
  restoreRect(page: number, from: Snapshot, x1: number, y1: number, x2: number, y2: number): void {
    [x1, y1, x2, y2] = [Math.max(0, x1), Math.max(0, y1), Math.min(WIDTH - 1, x2), Math.min(HEIGHT - 1, y2)];
    if (x2 < x1 || y2 < y1) return;
    this.dropWords(page, x1, y1, x2, y2);
    const back = (from.words ?? []).filter((w) => Framebuffer.within(w, x1, y1, x2, y2));
    if (back.length)
      this.addWords(
        page,
        back.map((w) => ({ ...w })),
      );
    this.dropLetters(page, x1, y1, x2, y2);
    if (from.letters)
      this.placeLetters(
        page,
        [...from.letters.values()].filter((l) => l.x >= x1 && l.y >= y1 && l.x + GLYPH_SIZE - 1 <= x2 && l.y + GLYPH_SIZE - 1 <= y2),
        0,
        0,
      );
    const p = this.pages[page];
    const h = this.hi[page];
    for (let y = y1; y <= y2; y++) p.set(from.ega.subarray(y * WIDTH + x1, y * WIDTH + x2 + 1), y * WIDTH + x1);
    for (let y = y1 * HI; y < (y2 + 1) * HI; y++)
      h.set(from.hi.subarray(y * HI_WIDTH + x1 * HI, y * HI_WIDTH + (x2 + 1) * HI), y * HI_WIDTH + x1 * HI);
    this.dirty = true;
  }

  /**
   * A fire's shimmer at `now` (ms), over rectangle `rect` (EGA pixels) of page 0 from its snapshot `from`: the flame's
   * bright blues brightened and dimmed in bands that rise through it, and all of it swayed a pixel or two, as old
   * palette-cycled fire moved. The rectangle is the flame's and the smoke's about it, not the bowl's.
   */
  shimmer(from: { hi: Uint32Array }, [rx, ry, rw, rh]: [number, number, number, number], now: number): void {
    const out = this.hi[0];
    const src = from.hi;
    const t = now / 1000;
    const flame = (v: number): boolean => {
      const r = v & 0xff;
      const g = (v >>> 8) & 0xff;
      const b = (v >>> 16) & 0xff;
      return b > 150 && b > r + 50 && g + b > 230;
    };
    for (let y = ry * HI; y < (ry + rh) * HI; y++) {
      const sway = Math.round(Math.sin(y * 0.11 + t * 5.3) * 2.2 + Math.sin(y * 0.047 - t * 3.1) * 1.3);
      for (let x = rx * HI; x < (rx + rw) * HI; x++) {
        const at = y * HI_WIDTH + x;
        const sx = Math.min((rx + rw) * HI - 1, Math.max(rx * HI, x + sway));
        const v = src[y * HI_WIDTH + sx];
        if (!flame(v)) {
          out[at] = v; // the smoke about it sways with it, a haze of heat
          continue;
        }
        // Bands of light rising: the phase runs up the flame as time goes on.
        const wave = Math.sin(y * 0.085 + t * 7.5 + Math.sin(x * 0.06 + t * 1.7) * 1.4);
        const f = 0.8 + 0.42 * wave;
        const c = (sh: number): number => Math.min(255, Math.round(((v >>> sh) & 0xff) * f));
        out[at] = (0xff000000 | (c(16) << 16) | (c(8) << 8) | c(0)) >>> 0;
      }
    }
    this.dirty = true;
  }

  restorePage(page: number, from: Snapshot): void {
    this.pages[page].set(from.ega);
    this.hi[page].set(from.hi);
    this.words[page] = (from.words ?? []).map((w) => ({ ...w }));
    this.letters[page] = new Map(from.letters ?? []);
    this.dirty = true;
  }

  /** One pixel of a snapshot back onto a page. */
  restorePixel(page: number, from: Snapshot, x: number, y: number): void {
    this.pages[page][y * WIDTH + x] = from.ega[y * WIDTH + x];
    const o = y * HI * HI_WIDTH + x * HI;
    const h = this.hi[page];
    for (let r = 0; r < HI; r++) h.set(from.hi.subarray(o + r * HI_WIDTH, o + r * HI_WIDTH + HI), o + r * HI_WIDTH);
  }

  clearPage(page: number): void {
    this.words[page] = [];
    this.letters[page].clear();
    this.pages[page].fill(0);
    this.hi[page].fill(EGA_RGBA[0]);
    this.dirty = true;
  }

  clearRow(page: number, y: number): void {
    if (y < 0 || y >= HEIGHT) return;
    this.dropWords(page, 0, y, WIDTH - 1, y);
    this.pages[page].fill(0, y * WIDTH, (y + 1) * WIDTH);
    this.hi[page].fill(EGA_RGBA[0], y * HI * HI_WIDTH, (y + 1) * HI * HI_WIDTH);
    this.dirty = true;
  }

  /** The marks over the chrome that the screen sets as letters (drawMark leaves them): each with what to set. */
  marksShown(): { column: number; row: number; colour: number; face: Face; text: string }[] {
    if (!this.chrome || !this.letterOf) return [];
    const out: { column: number; row: number; colour: number; face: Face; text: string }[] = [];
    for (const m of this.marks.values()) {
      const set = this.letterOf(0, m.code & 0x7f);
      if (set && this.markShown(m)) out.push({ column: m.column, row: m.row, colour: rgbOf(colourRGBA(m.colour)), ...set });
    }
    return out;
  }

  /** Paint page 0's colour page onto a canvas's image (HI_WIDTH by HI_HEIGHT). */
  present(image: ImageData): void {
    const out = new Uint32Array(image.data.buffer);
    out.set(this.hi[0]);
    if (this.chrome) {
      this.copper(out);
      for (const m of this.marks.values()) if (this.markShown(m)) this.drawMark(out, m);
    }
    this.dirty = false;
  }

  /** A mark's ink over the finished picture, at its cell, in its colour: the lettering's, or the game's symbol finer. */
  private drawMark(out: Uint32Array, m: { column: number; row: number; code: number; colour: number }): void {
    const c7 = m.code & 0x7f;
    if (this.letterOf?.(0, c7)) return; // set by the screen, over the finished picture (marksShown)
    const ink = this.art.glyph?.(c7) ?? (this.art.fineSymbol?.(c7) ? this.smooth(0, c7) : null);
    const v = colourRGBA(m.colour);
    const [x0, y0] = [m.column * GLYPH_SIZE * HI, m.row * GLYPH_SIZE * HI];
    if (ink) {
      const size = Math.round(Math.sqrt(ink.length));
      const k = (GLYPH_SIZE * HI) / size;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++)
          if (ink[y * size + x])
            for (let dy = 0; dy < k; dy++)
              out.fill(v, (y0 + y * k + dy) * HI_WIDTH + x0 + x * k, (y0 + y * k + dy) * HI_WIDTH + x0 + x * k + k);
      return;
    }
    const rows = this.fonts[0].rows;
    for (let r = 0; r < GLYPH_SIZE; r++)
      for (let c = 0; c < GLYPH_SIZE; c++)
        if (rows[c7 * 8 + r] & (0x80 >> c))
          for (let dy = 0; dy < HI; dy++)
            out.fill(v, (y0 + r * HI + dy) * HI_WIDTH + x0 + c * HI, (y0 + r * HI + dy) * HI_WIDTH + x0 + c * HI + HI);
  }

  /** Standard's chrome over the picture: the frame's blue as copper, bevelled by its own shape; white beside it, the rim. */
  private copper(out: Uint32Array): void {
    const cls = this.chromeCells();
    // The frame's few shapes - the screen as it stands, with a menu's box, a popup's - each cut once and kept: a
    // menu opened and shut flips between two, and the cut (every pixel of the hi page, several times over) was paid
    // at each, a stall a phone felt.
    const hash = cellsHash(cls);
    const hit = this.chromeCache.findIndex((c) => c.hash === hash && sameCells(cls, c.cells));
    if (hit < 0) {
      this.chromeCache.unshift({ hash, cells: cls, ...this.cutCopper(cls) });
      this.chromeCache.length = Math.min(this.chromeCache.length, CHROME_SHAPES);
    } else if (hit > 0) {
      this.chromeCache.unshift(...this.chromeCache.splice(hit, 1));
    }
    const entry = this.chromeCache[0];
    const { at } = entry;
    // In the tone the place asks for (chromeTone), its colours recoloured once and kept with the shape.
    const key = toneKey(this.chromeTone);
    let colour = entry.colour;
    if (key) {
      entry.toned ??= new Map();
      colour = entry.toned.get(key) ?? colour;
      if (colour === entry.colour) {
        colour = toned(entry.colour, this.chromeTone!);
        entry.toned.set(key, colour);
      }
    }
    for (let i = 0; i < at.length; i++) out[at[i]] = colour[i];
  }

  /**
   * What each EGA pixel is to the frame: 1 its blue (copper), 2 a white line along it (the rim), 3 black beside it
   * (room for its curves), 0 nothing - only where the colour page still shows the EGA colour, not tile art, and
   * outside the map's square but for the three pixels round its edge (a menu's border).
   */
  private chromeCells(): Uint8Array {
    const p = this.pages[0];
    const h = this.hi[0];
    const cls = new Uint8Array(WIDTH * HEIGHT);
    const hole = this.chromeHole;
    const also = this.chromeAlso;
    const start = this.chromeTop;
    const shown = (x: number, y: number): boolean => {
      const e = p[y * WIDTH + x];
      if (also.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) return h[y * HI * HI_WIDTH + x * HI] === EGA_RGBA[e];
      if (y < this.chromeFrom) return false;
      if (hole && x >= hole[0] && x <= hole[2] && y >= hole[1] && y <= hole[3]) return false;
      if (this.chromeFrom === 0 && y >= VIEW_LEFT && y <= VIEW_RIGHT && x >= VIEW_LEFT && x <= VIEW_RIGHT) {
        const ring = Math.min(x - VIEW_LEFT, VIEW_RIGHT - x, y - VIEW_LEFT, VIEW_RIGHT - y);
        const b = this.chromeBox;
        const inBox = !!b && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
        if (ring >= RING && !inBox) return false;
      }
      return h[y * HI * HI_WIDTH + x * HI] === EGA_RGBA[e];
    };
    for (let y = start; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) if (p[y * WIDTH + x] === 1 && shown(x, y)) cls[y * WIDTH + x] = 1;
    // A pixel's black gap between the blue above and below it, or to either side, is the frame's: 1988 leaves one
    // where the party panel's right-hand bar comes down on the bar beneath it, and the copper would cut the two
    // apart there - a flat end sat on a bar - where they are one corner.
    const blue = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT && cls[y * WIDTH + x] === 1;
    for (let y = start; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++)
        if (p[y * WIDTH + x] === 0 && shown(x, y) && ((blue(x, y - 1) && blue(x, y + 1)) || (blue(x - 1, y) && blue(x + 1, y))))
          cls[y * WIDTH + x] = 1;
    // The white along the blue first (the rim), then the black beside either (where their curves may go): worked
    // outward from the blue, then from the blue and the white, rather than asking every pixel of the screen about its
    // neighbours - the same classes, for a fraction of the work (it ran at every repaint).
    const spread = (from: (k: number) => boolean, colour: number, to: number): void => {
      const seeds: number[] = [];
      for (let i = start * WIDTH; i < WIDTH * HEIGHT; i++) if (from(cls[i])) seeds.push(i);
      for (const i of seeds) {
        const x = i % WIDTH;
        const y = (i - x) / WIDTH;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < start || ny >= HEIGHT) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= WIDTH) continue;
            const n = ny * WIDTH + nx;
            if (cls[n] === 0 && p[n] === colour && shown(nx, ny)) cls[n] = to;
          }
        }
      }
    };
    spread((k) => k === 1, 15, 2);
    spread((k) => k === 1 || k === 2, 0, 3);
    return cls;
  }

  /**
   * Which of the border's caps a text cell holds, as the frame's classes have it (chromeCells): 2 the one before a
   * title (IBM.CH 2, pointing right), 1 the one after (IBM.CH 1, pointing left), 0 none. A cap is the font's wedge in
   * the frame's blue, its sloping edges drawn over in white (screen.ts cap): blue or white where the glyph is inked,
   * never blue where it is not, and blue for most of it.
   */
  private capIn(cls: Uint8Array, cx: number, cy: number): number {
    const rows = this.fonts[0].rows;
    for (const side of [1, 2]) {
      let blue = 0;
      let fits = true;
      for (let r = 0; r < 8 && fits; r++)
        for (let c = 0; c < 8; c++) {
          const k = cls[(cy * 8 + r) * WIDTH + cx * 8 + c];
          const ink = (rows[side * 8 + r] & (0x80 >> c)) !== 0;
          if (ink ? k !== 1 && k !== 2 : k === 1) {
            fits = false;
            break;
          }
          if (k === 1) blue++;
        }
      if (fits && blue >= 16) return side;
    }
    return 0;
  }

  /**
   * The border's caps: the cells the chrome knows for one (capIn). The bar beside each is run on through its cell, so
   * that the bevel finds no end there (an end would be lit or shaded, a seam across the bar where the cap begins);
   * the cap is drawn over it once the frame is coloured (capOf).
   */
  private cutCaps(cls: Uint8Array, shape: Uint8Array, outline: Uint8Array): { cell: number; side: number; mark: boolean }[] {
    const caps: { cell: number; side: number; mark: boolean }[] = [];
    const S = 8 * HI;
    for (let cy = this.chromeTop >> 3; cy < HEIGHT / 8; cy++)
      for (let cx = 0; cx < WIDTH / 8; cx++) {
        const side = this.capIn(cls, cx, cy);
        if (!side) continue;
        // Beside a bar that runs on past the cell, above it or below (the log's prompt, on the bar between the map
        // and the log), the cap is an arrow on the bar, not the end of it: drawn as one, the bar left as it is.
        // (The bar's own blue, a pixel or two in from the cell: its white rim lies between.)
        const bx = side === 2 ? [cx * 8 - 1, cx * 8 - 2] : [(cx + 1) * 8, (cx + 1) * 8 + 1];
        const across = (y: number): boolean => y >= 0 && y < HEIGHT && bx.some((x) => x >= 0 && x < WIDTH && cls[y * WIDTH + x] === 1);
        const mark = across(cy * 8 - 1) || across(cy * 8 + 8); // (the last prompt sits where the bar turns a corner)
        caps.push({ cell: cy * (WIDTH / 8) + cx, side, mark });
        if (mark) {
          // The bar's edge beside the arrow as the bar's edge is everywhere else: straight, where the doubling rounded
          // it out a little toward the arrow's blue in the next cell, and carried the arrow's rim a pixel up and down
          // out of its cell (the arrow's own cell is drawn over).
          const [x0, x1] = side === 2 ? [cx * S - 2 * HI, (cx + 1) * S] : [cx * S, (cx + 1) * S + 2 * HI];
          for (let hy = Math.max(0, cy * S - HI); hy < Math.min(HI_HEIGHT, (cy + 1) * S + HI); hy++)
            for (let hx = Math.max(0, x0); hx < Math.min(HI_WIDTH, x1); hx++) {
              const c = cls[(hy >> 2) * WIDTH + (hx >> 2)];
              outline[hy * HI_WIDTH + hx] = c === 1 || c === 2 ? 1 : 0;
              shape[hy * HI_WIDTH + hx] = c === 1 ? 1 : 0;
            }
          continue;
        }
        // From a column of the bar a little way back, past what the doubling rounded where the bar met the cell.
        const base = capBase(cx, side);
        if (base < 0 || base >= HI_WIDTH) continue;
        let bar = false;
        for (let hy = 0; hy < S; hy++) bar ||= outline[(cy * S + hy) * HI_WIDTH + base] !== 0;
        if (!bar) continue;
        const [x0, x1] = side === 2 ? [base + 1, (cx + 1) * S] : [cx * S, base];
        for (let hy = 0; hy < S; hy++) {
          const row = (cy * S + hy) * HI_WIDTH;
          for (let hx = x0; hx < x1; hx++) {
            shape[row + hx] = shape[row + base];
            outline[row + hx] = outline[row + base];
          }
        }
      }
    return caps;
  }

  /**
   * The frame cut at the colour page's own size: its EGA shape doubled twice by EPX, so a curve or a slanted end
   * is followed where the blocks would stair-step, then bevelled as the ultima3 Standard frame is - by how far each
   * pixel lies inside the shape (a distance field), lit where the edge it is nearest faces up or left and shaded
   * where it faces down or right, an edge across the light between the two. What is drawn: where, and in what colour.
   */
  private cutCopper(cls: Uint8Array): { at: Uint32Array; colour: Uint32Array } {
    const W4 = HI_WIDTH;
    const H4 = HI_HEIGHT;
    // Two silhouettes, each doubled twice by EPX and grown only into what lies beside the frame (never over tile art
    // or lettering): the blue alone, and the blue with the white that outlines it. The rim is the band between the
    // two, so where the frame slants its dark edge slants with it rather than stepping in blocks.
    const smooth = (inside: (c: number) => boolean, may: (c: number) => boolean): Uint8Array => {
      let out: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
      for (let i = 0; i < out.length; i++) out[i] = inside(cls[i]) ? 1 : 0;
      let w = WIDTH;
      for (let scale = 2; scale <= HI; scale *= 2) {
        out = epx(out, w, (w / WIDTH) * HEIGHT);
        w *= 2;
        for (let y = 0; y < scale * HEIGHT; y++)
          for (let x = 0; x < w; x++)
            if (out[y * w + x] && !may(cls[Math.floor(y / scale) * WIDTH + Math.floor(x / scale)])) out[y * w + x] = 0;
      }
      return out;
    };
    const outline = smooth(
      (c) => c === 1 || c === 2,
      (c) => c !== 0,
    );
    const shape = smooth(
      (c) => c === 1,
      (c) => c !== 0,
    );
    for (let i = 0; i < shape.length; i++) if (!outline[i]) shape[i] = 0;
    squareCorners(cls, shape, outline);
    const caps = this.cutCaps(cls, shape, outline);
    // Distance in from the edge, in thirds of a pixel (the 3-4 chamfer), as far as the bevel reaches and a little on.
    const far = (BEVEL + 2) * 3;
    const dist = new Uint16Array(W4 * H4);
    for (let i = 0; i < dist.length; i++) dist[i] = shape[i] ? far : 0;
    const relax = (i: number, j: number, step: number): void => {
      if (dist[j] + step < dist[i]) dist[i] = dist[j] + step;
    };
    for (let y = 0; y < H4; y++) {
      for (let x = 0; x < W4; x++) {
        const i = y * W4 + x;
        if (!dist[i]) continue;
        if (x === 0 || y === 0 || x === W4 - 1 || y === H4 - 1) {
          dist[i] = 3;
          continue;
        }
        relax(i, i - 1, 3);
        relax(i, i - W4, 3);
        relax(i, i - W4 - 1, 4);
        relax(i, i - W4 + 1, 4);
      }
    }
    for (let y = H4 - 2; y > 0; y--) {
      for (let x = W4 - 2; x > 0; x--) {
        const i = y * W4 + x;
        if (!dist[i]) continue;
        relax(i, i + 1, 3);
        relax(i, i + W4, 3);
        relax(i, i + W4 + 1, 4);
        relax(i, i + W4 - 1, 4);
      }
    }
    const h = this.hi[0];
    const at: number[] = [];
    const colour: number[] = [];
    const d = (x: number, y: number): number => (x < 0 || y < 0 || x >= W4 || y >= H4 ? 0 : dist[y * W4 + x]);
    for (let y = this.chromeTop * HI; y < H4; y++) {
      for (let x = 0; x < W4; x++) {
        const cx = x >> 2;
        const cy = y >> 2;
        const c = cls[cy * WIDTH + cx];
        if (c === 0) continue;
        const i = y * W4 + x;
        if (shape[i]) {
          const depth = Math.floor(dist[i] / 3) - 1; // 0 at the edge
          at.push(i);
          if (depth >= BEVEL) {
            colour.push(COPPER);
            continue;
          }
          // The way the distance rises (Sobel): into the shape, away from the nearest edge. Rising toward the
          // right or down means the edge is above or to the left, facing the light.
          const gx = d(x + 1, y - 1) + 2 * d(x + 1, y) + d(x + 1, y + 1) - d(x - 1, y - 1) - 2 * d(x - 1, y) - d(x - 1, y + 1);
          const gy = d(x - 1, y + 1) + 2 * d(x, y + 1) + d(x + 1, y + 1) - d(x - 1, y - 1) - 2 * d(x, y - 1) - d(x + 1, y - 1);
          const len = Math.hypot(gx, gy);
          const facing = len === 0 ? 0 : (gx + gy) / (len * Math.SQRT2); // 1 up-left, -1 down-right
          const lit = Math.min(1, Math.max(0, 0.5 + facing * 0.8));
          colour.push(mix(COPPER_SHADE[depth], COPPER_LIGHT[depth], lit));
        } else if (outline[i]) {
          at.push(i);
          colour.push(COPPER_RIM);
        } else if (c === 1 || c === 2) {
          // A corner the curve has cut away shows what lies beyond it (black, as a rule), never the EGA's colours.
          const sx = (x & 3) < 2 ? -1 : 1;
          const sy = (y & 3) < 2 ? -1 : 1;
          let shown = EGA_RGBA[0];
          for (const [nx, ny] of [
            [cx + sx, cy],
            [cx, cy + sy],
            [cx + sx, cy + sy],
          ]) {
            if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
            const k = cls[ny * WIDTH + nx];
            if (k === 1 || k === 2) continue;
            const v = h[ny * HI * W4 + nx * HI];
            if (v !== EGA_RGBA[1] && v !== EGA_RGBA[15]) shown = v;
            break;
          }
          at.push(i);
          colour.push(shown);
        }
      }
    }
    // The caps, over the bar the cut ran on through their cells: each that bar's cross-section, as coloured beside
    // it, drawn in to a point; the art's own cap where there is no bar beside one.
    const S = 8 * HI;
    const bases = new Map<number, number>();
    for (const { cell, side } of caps) {
      const [cx, cy] = [cell % (WIDTH / 8), Math.floor(cell / (WIDTH / 8))];
      const base = capBase(cx, side);
      if (base >= 0 && base < W4) for (let y = 0; y < S; y++) bases.set((cy * S + y) * W4 + base, 0);
    }
    for (let k = 0; k < at.length; k++) if (bases.has(at[k])) bases.set(at[k], colour[k]);
    for (const { cell, side, mark } of caps) {
      const [cx, cy] = [cell % (WIDTH / 8), Math.floor(cell / (WIDTH / 8))];
      const base = capBase(cx, side);
      const profile = Array.from({ length: S }, (_, y) => bases.get((cy * S + y) * W4 + base) || null);
      const piece = mark ? capOf(ARROW, side, ARROW_LENGTH) : (capOf(profile, side) ?? this.art.capPiece?.(side) ?? null);
      if (!piece) continue;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          at.push((cy * S + y) * W4 + cx * S + x);
          colour.push(piece[y * S + x]);
        }
    }
    return { at: Uint32Array.from(at), colour: Uint32Array.from(colour) };
  }

  private chromeCache: {
    hash: number;
    cells: Uint8Array;
    at: Uint32Array;
    colour: Uint32Array;
    toned?: Map<string, Uint32Array>;
  }[] = [];

  /**
   * The chrome's tone, where the party is (the Standard look's; null the copper as it is): its colours' hue set to
   * `hue` (degrees, where given), their saturation and value scaled by `sat` and `value` - the copper's own light and
   * shade kept, only its colour changed.
   */
  chromeTone: ChromeTone | null = null;
}

/** A tone for the chrome (Framebuffer.chromeTone). */
export interface ChromeTone {
  hue?: number;
  sat: number;
  value: number;
}

const toneKey = (t: ChromeTone | null): string => (t ? `${t.hue ?? '-'}|${t.sat.toFixed(3)}|${t.value.toFixed(3)}` : '');

/** Colours (RGBA, little-endian) in tone `t`: each one's hue, saturation and value changed as it says. */
function toned(colours: Uint32Array, t: ChromeTone): Uint32Array {
  const seen = new Map<number, number>();
  return colours.map((v) => {
    const hit = seen.get(v);
    if (hit !== undefined) return hit;
    const [r, g, b] = [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff].map((c) => c / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = t.hue !== undefined ? t.hue / 60 : (h + 6) % 6;
    const s = Math.min(1, (max === 0 ? 0 : d / max) * t.sat);
    const val = Math.min(1, max * t.value);
    const c = val * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const m = val - c;
    const out = (0xff000000 | (Math.round((b1 + m) * 255) << 16) | (Math.round((g1 + m) * 255) << 8) | Math.round((r1 + m) * 255)) >>> 0;
    seen.set(v, out);
    return out;
  });
}

/**
 * An arrow on a bar (the log's prompt): the cross-section of a bar of the frame's own, 22 pixels deep in the middle
 * of the cell - rim, lit edge, copper, shaded foot, rim - drawn in over three quarters of the cell (capOf), as the
 * font's wedge reaches six of its eight pixels.
 */
const ARROW = ((): (number | null)[] => {
  const [top, bottom] = [5, 27];
  return Array.from({ length: 8 * HI }, (_, y) => {
    if (y < top || y >= bottom) return null;
    const [dt, db] = [y - top, bottom - 1 - y];
    if (dt === 0 || db === 0) return COPPER_RIM;
    const k = Math.min(dt, db) - 1;
    return k >= BEVEL ? COPPER : dt <= db ? COPPER_LIGHT[k] : COPPER_SHADE[k];
  });
})();
const ARROW_LENGTH = 6 * HI;

/**
 * The column of the bar a cap at text column `cx` is drawn from (colour page pixels): two EGA pixels back along the
 * bar from the cap's cell, before what the EPX doubling rounded where the bar met it.
 */
const capBase = (cx: number, side: number): number => (side === 2 ? cx * 8 * HI - 1 - 2 * HI : (cx + 1) * 8 * HI + 2 * HI);

/**
 * A border's cap at the colour page's grain (32 by 32), over black: the bar beside it drawn in to a point at the
 * cell's far side - its cross-section (`profile`, top to bottom as the bar is coloured, null where it is not) pressed
 * in along the way, so the bar's light runs on along the upper slope and its shade along the lower, with no seam where
 * the one meets the other; the rim along the slopes as thick as the bar's, and the slopes smooth. `side` 2 points
 * right (the bar to the left), 1 left. Null where there is no bar to draw in.
 */
function capOf(profile: (number | null)[], side: number, length = profile.length): Uint32Array | null {
  const S = profile.length;
  const rows = profile.flatMap((v, y) => (v === null ? [] : [y]));
  if (rows.length < 4) return null;
  const [top, bottom] = [rows[0], rows[rows.length - 1] + 1];
  let rimTop = 0;
  while (top + rimTop < bottom && profile[top + rimTop] === COPPER_RIM) rimTop++;
  let rimBottom = 0;
  while (bottom - 1 - rimBottom > top + rimTop && profile[bottom - 1 - rimBottom] === COPPER_RIM) rimBottom++;
  const [inTop, inBottom] = [top + rimTop, bottom - 1 - rimBottom]; // the bar within its rim
  const centre = (top + bottom) / 2;
  const half = (bottom - top) / 2;
  const cos = 1 / Math.hypot(1, half / length); // across a slope, for along the cell
  /** The bar's colour at (fractional) row `y`, between its rows, within its rim. */
  const bar = (y: number): number => {
    const f = Math.max(inTop, Math.min(inBottom, y - 0.5));
    const y0 = Math.floor(f);
    const y1 = Math.min(inBottom, y0 + 1);
    return mix(profile[y0] ?? COPPER, profile[y1] ?? COPPER, f - y0);
  };
  /** The cap at point (x, y) of the cell: its colour, or null beyond its slopes. */
  const at = (x: number, y: number): number | null => {
    const u = side === 2 ? x : S - x; // in from the bar's side
    const reach = half * (1 - u / length); // the cap's half-height here
    const d = y - centre;
    const e = (reach - Math.abs(d)) * cos; // in from the slope, in pixels
    if (e < 0) return null;
    const rim = d < 0 ? rimTop : rimBottom;
    if (e < rim) return COPPER_RIM;
    const inner = reach - rim / cos;
    return inner > 0 ? bar(centre + (d * (half - rim)) / inner) : bar(centre);
  };
  // Each pixel the mean of sixteen points of it: the slopes and the bands of the bar's light pressed along them come
  // out smooth, not stepped a row at a time.
  const N = 4;
  const out = new Uint32Array(S * S);
  for (let py = 0; py < S; py++)
    for (let px = 0; px < S; px++) {
      let [r, g, b] = [0, 0, 0];
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const v = at(px + (i + 0.5) / N, py + (j + 0.5) / N) ?? EGA_RGBA[0];
          r += v & 0xff;
          g += (v >>> 8) & 0xff;
          b += (v >>> 16) & 0xff;
        }
      const n = N * N;
      out[py * S + px] = (0xff000000 | (Math.round(b / n) << 16) | (Math.round(g / n) << 8) | Math.round(r / n)) >>> 0;
    }
  return out;
}

/**
 * Resampling `from` pixels to `to` by area: for each of the `to`, the `from` pixels its span covers (`at`, from
 * `start[k]` to `start[k + 1]`) and the share of the span each covers (`weight`, in 256ths, summing to 256).
 */
function areaTaps(from: number, to: number): { start: Int32Array; at: Int32Array; weight: Int32Array } {
  const kept = TAPS.get(from * 65536 + to);
  if (kept) return kept;
  const start = new Int32Array(to + 1);
  const at: number[] = [];
  const weight: number[] = [];
  const k = from / to;
  for (let d = 0; d < to; d++) {
    start[d] = at.length;
    const [a, b] = [d * k, (d + 1) * k];
    let left = 256;
    for (let sIdx = Math.floor(a); sIdx < Math.min(from, Math.ceil(b)); sIdx++) {
      const cover = Math.min(b, sIdx + 1) - Math.max(a, sIdx);
      if (cover <= 1e-6) continue;
      at.push(sIdx);
      weight.push(Math.round((cover / k) * 256));
      left -= weight[weight.length - 1];
    }
    weight[weight.length - 1] += left; // the rounding's remainder, so the shares make the whole
  }
  start[to] = at.length;
  const taps = { start, at: Int32Array.from(at), weight: Int32Array.from(weight) };
  TAPS.set(from * 65536 + to, taps);
  return taps;
}
const TAPS = new Map<number, { start: Int32Array; at: Int32Array; weight: Int32Array }>();

/** Two of the canvas's colours mixed, `t` of the second. */
const mix = (a: number, b: number, t: number): number => {
  const ch = (v: number, sh: number): number => (v >>> sh) & 0xff;
  const m = (sh: number): number => Math.round(ch(a, sh) * (1 - t) + ch(b, sh) * t) << sh;
  return (0xff000000 | m(16) | m(8) | m(0)) >>> 0;
};

/** How many of the frame's shapes are kept, cut (Framebuffer.copper): the screen, a menu's, a popup's, and a few more. */
const CHROME_SHAPES = 6;

/** A quick hash of the frame's classes (FNV-1a over them), to find a kept shape before comparing it whole. */
const cellsHash = (a: Uint8Array): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193);
  return h >>> 0;
};

const sameCells = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * The frame's inside corners kept square, as 1988 draws them, where the doubling would round them: where two straight
 * white lines meet at a right angle round the blue (a bar coming out of another, a window's inner corner). Rounded,
 * the lit edge of one bar turned into the shaded edge of the other through the curve, and the bar looked to end in a
 * cap against the other rather than run out of it; square, the two edges meet in a mitre. On the frame's classes
 * (Framebuffer.chromeCells): the corner's own white pixel has none of the blue the doubling put in it, and the black
 * pixel outside it none of the rim.
 */
function squareCorners(cls: Uint8Array, shape: Uint8Array, outline: Uint8Array): void {
  const k = (x: number, y: number): number => (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT ? -1 : cls[y * WIDTH + x]);
  const clear = (bits: Uint8Array, x: number, y: number): void => {
    for (let hy = y * HI; hy < (y + 1) * HI; hy++) bits.fill(0, hy * HI_WIDTH + x * HI, hy * HI_WIDTH + (x + 1) * HI);
  };
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      if (cls[y * WIDTH + x] !== 2) continue;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          // The blue beside and below (or above) it; the white running on, straight, the other two ways; outside, none of
          // the frame (black beside it, or the map's picture).
          if (k(x + sx, y) !== 1 || k(x, y + sy) !== 1) continue;
          if (k(x - sx, y) !== 2 || k(x - 2 * sx, y) !== 2 || k(x, y - sy) !== 2 || k(x, y - 2 * sy) !== 2) continue;
          const outside = k(x - sx, y - sy);
          if (outside === 1 || outside === 2) continue;
          clear(shape, x, y);
          if (outside === 3) clear(outline, x - sx, y - sy);
        }
    }
}

/** EPX on a one-bit shape: each pixel four, a corner taking its neighbours' value where two of them agree and the others differ. */
function epx(src: Uint8Array, w: number, h: number, clamp = false): Uint8Array {
  const out = new Uint8Array(w * 2 * h * 2);
  const W = w * 2;
  const at = (x: number, y: number): number =>
    clamp
      ? src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
      : x < 0 || y < 0 || x >= w || y >= h
        ? 0
        : src[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x];
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const c = at(x - 1, y);
      const d = at(x, y + 1);
      const o = y * 2 * W + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + W] = d === c && d !== b && c !== a ? c : p;
      out[o + W + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return out;
}

/**
 * A set's tiles without its lettering - the Apple ][ set in the PC (1988) look, whose letters, runes and window
 * corners are the game's own: the tiles drawn by `art`, nothing else of it.
 */
export class TilesAlone implements TileArt {
  constructor(private readonly art: TileArt) {}

  draw(page: Uint32Array, tile: number, x: number, y: number, ground?: number, place?: Place, tint?: number, floor?: number): void {
    this.art.draw(page, tile, x, y, ground, place, tint, floor);
  }

  block(page: Uint32Array, tile: number, rx: number, ry: number, x: number, y: number): void {
    this.art.block(page, tile, rx, ry, x, y);
  }

  rising(page: Uint32Array, tile: number, rows: number, x: number, y: number): void {
    if (this.art.rising) this.art.rising(page, tile, rows, x, y);
    else this.art.draw(page, tile, x, y);
  }
}

/** The Original tile art: the EGA tiles (as the animator has left them) enlarged. */
export class EgaArt implements TileArt {
  constructor(private readonly tiles: Uint8Array) {}

  draw(page: Uint32Array, tile: number, x: number, y: number): void {
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) this.block(page, tile, c, r, x + c * HI, y + r * HI);
  }

  block(page: Uint32Array, tile: number, rx: number, ry: number, x: number, y: number): void {
    const v = this.tiles[tile * 128 + ry * 8 + (rx >> 1)];
    const c = EGA_RGBA[rx & 1 ? v & 15 : v >> 4];
    const o = y * HI_WIDTH + x;
    for (let r = 0; r < HI; r++) page.fill(c, o + r * HI_WIDTH, o + r * HI_WIDTH + HI);
  }
}
