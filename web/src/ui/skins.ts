/**
 * skins.ts
 *
 * A machine's skin (docs/superpowers/specs/2026-11-13-machine-skins-design.md): what the tile set chosen (settings.ts
 * Tiles) draws besides its tiles - the dungeon's first-person pictures, the ink of the corridor's drawn lines, its
 * sign's plate, and the frame's colours. Modern PC and PC EGA have none: they draw as they always have.
 *
 * A skin's pictures are the PC's own list of them - DNG1-3's 28 wall pieces each, ITEMS's 20 things, MON0-7's six
 * halves of a creature each - at the PC's sizes, laid out in one sheet (PIECES), so the game composes the corridor
 * as it always has and the skin's piece is drawn over the PC piece's place (Framebuffer.image's 'skin' over). Each
 * machine's tool (tools/art/*Dungeon.ts) fills the sheet from its own pictures, and where a machine has no piece of
 * its own, the PC's recoloured in its palette (recolouredPiece).
 */

import type { Picture } from '../data/images.ts';
import { EGA_PALETTE } from '../data/tiles.ts';
import type { Tiles } from '../game/settings.ts';
import { Colour, RUNE_RED } from './colours.ts';

/** The files the dungeon's pictures come from, by their names less the extension. */
export type PieceFile = 'DNG1' | 'DNG2' | 'DNG3' | 'ITEMS' | 'MON0' | 'MON1' | 'MON2' | 'MON3' | 'MON4' | 'MON5' | 'MON6' | 'MON7';

/** A piece's place in a skin's sheet: its file and number there, its size (the PC's) and its top left. */
export interface PiecePlace {
  file: PieceFile;
  i: number;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** How wide a skin's sheet is. */
export const SKIN_SHEET_W = 512;

/** DNG1-3's pieces (all three alike), ITEMS's and each MON's, as the PC's files have them, width by height. */
const WALL_SIZES = [
  [24, 164], [32, 164], [16, 164], [8, 164], [24, 164], [32, 164], [16, 164], [8, 164], [28, 114], [56, 164],
  [24, 164], [8, 164], [80, 164], [56, 164], [24, 164], [8, 164], [24, 164], [32, 164], [16, 164], [8, 164],
  [24, 164], [32, 164], [16, 164], [8, 164], [28, 114], [56, 164], [24, 164], [8, 164],
] as const; // prettier-ignore
const ITEM_SIZES = [
  [40, 80], [24, 56], [16, 24], [8, 8], [40, 80], [24, 56], [16, 24], [8, 8], [40, 24], [24, 32],
  [16, 16], [8, 8], [40, 24], [24, 32], [16, 16], [8, 8], [40, 24], [24, 32], [16, 16], [16, 16],
] as const; // prettier-ignore
const MON_SIZES = [[24, 66], [16, 25], [8, 6], [24, 66], [16, 25], [8, 6]] as const; // prettier-ignore

/** Every file's pieces, each file from a fresh row, left to right, a row as tall as its tallest. */
export const PIECES: readonly PiecePlace[] = (() => {
  const out: PiecePlace[] = [];
  const files: [PieceFile, readonly (readonly [number, number])[]][] = [
    ['DNG1', WALL_SIZES],
    ['DNG2', WALL_SIZES],
    ['DNG3', WALL_SIZES],
    ['ITEMS', ITEM_SIZES],
    ...Array.from({ length: 8 }, (_, n): [PieceFile, readonly (readonly [number, number])[]] => [`MON${n}` as PieceFile, MON_SIZES]),
  ];
  let top = 0;
  for (const [file, sizes] of files) {
    let [x, y, row] = [0, top, 0];
    sizes.forEach(([w, h], i) => {
      if (x + w > SKIN_SHEET_W) [x, y, row] = [0, y + row, 0];
      out.push({ file, i, w, h, x, y });
      x += w;
      row = Math.max(row, h);
    });
    top = y + row;
  }
  return out;
})();

/** How tall a skin's sheet is. */
export const SKIN_SHEET_H = Math.max(...PIECES.map((p) => p.y + p.h));

const byKey = new Map(PIECES.map((p) => [`${p.file}:${p.i}`, p]));

/** Where piece `i` of `file` lies in a skin's sheet; none for a piece the PC has not. */
export const pieceAt = (file: PieceFile, i: number): PiecePlace | undefined => byKey.get(`${file}:${i}`);

/** The file a dungeon picture comes from by its file's name ('DNG2.16' is DNG2's), or null for no dungeon picture. */
export function pieceFileOf(name: string): PieceFile | null {
  const m = /^(DNG[123]|ITEMS|MON[0-7])\.\d+$/i.exec(name);
  return m ? (m[1].toUpperCase() as PieceFile) : null;
}

/** The frame's colours (0xRRGGBB): what the frame's EGA blue and white are shown as. */
export interface FrameSkin {
  blue: number;
  white: number;
}

/** A skin's piece: RGBA in memory order, alpha 0 where clear, `w` by `h` - its own size (nativeSize). */
export interface SkinPiece {
  px: Uint32Array;
  w: number;
  h: number;
}

/**
 * The Apple's and the C64's pictures as their one table (MAIN.DNG's) has them: each wall's and each thing's size, in
 * screen bytes across (seven pixels a byte on the Apple, eight on the C64) and rows down.
 */
export const NATIVE_WALLS: readonly (readonly [number, number])[] = [
  [3, 144], [4, 144], [2, 144], [1, 144], [3, 144], [4, 144], [2, 144], [1, 144], [10, 144], [7, 144], [3, 144], [1, 144], [10, 144], [7, 144],
  [3, 144], [1, 144], [3, 144], [4, 144], [2, 144], [1, 144], [3, 144], [4, 144], [2, 144], [1, 144], [10, 144], [7, 144], [3, 144], [1, 144],
]; // prettier-ignore
export const NATIVE_ITEMS: readonly (readonly [number, number])[] = [
  [5, 70], [3, 49], [2, 21], [1, 7], [5, 70], [3, 49], [2, 21], [1, 7], [5, 21], [3, 28],
  [2, 14], [1, 7], [5, 21], [3, 28], [2, 14], [1, 7], [5, 21], [3, 28], [2, 14], [1, 7],
]; // prettier-ignore

/** The Sharp X68000's walls' height, in its text screen's rows (twice the PC's pixels across, near twice down). */
export const X68K_WALL_ROWS = 316;

/**
 * Piece `i` of `file`'s size in set `kind`'s sheet, [w, h]: the Apple's, the C64's and the X68000's own pieces at their
 * own size, as their machine drew them (drawn into the PC piece's place on the colour page's finer grid,
 * Framebuffer.image) - the X68000's twice the PC's across, its walls 316 rows and the rest twice the PC's down; every
 * other, and a piece recoloured from the PC's, the PC piece's.
 */
export function nativeSize(kind: Tiles, file: PieceFile, i: number): [number, number] {
  const p = pieceAt(file, i)!;
  if (kind === 'x68k' && ownPiece(kind, file, i)) return [p.w * 2, file.startsWith('DNG') ? X68K_WALL_ROWS : p.h * 2];
  const perByte = kind === 'c64' ? 8 : kind === 'apple2' || kind === 'apple2e' || kind === 'apple2c' ? 7 : 0;
  const own = perByte && ownPiece(kind, file, i);
  const table = file === 'ITEMS' ? NATIVE_ITEMS : file.startsWith('DNG') ? NATIVE_WALLS : null;
  if (!own || !table) return [p.w, p.h];
  const [bytes, rows] = table[i];
  return [bytes * perByte, rows];
}

/**
 * The Enhanced interface's sign in a look's own colours (0xRRGGBB), drawn flat (Framebuffer.signStyle): its plate, the
 * border and bolts round it, and its runes.
 */
export interface SignStyle {
  plate: number;
  edge: number;
  ink: number;
}

/** A machine's skin: its dungeon's pieces, the ink of what the corridor draws in lines, its sign's plate, its frame. */
export interface Skin {
  name: Tiles;
  /** Piece `i` of `file` at its own size (nativeSize); null for none. */
  piece(file: PieceFile, i: number): SkinPiece | null;
  /** The sixteen EGA colours of the corridor's lines and plots (a field's crackle, a drip) as this machine shows them. */
  ink: Uint32Array;
  /** Its Enhanced sign's colours, flat (signStyleFor). */
  sign: SignStyle;
  frame: FrameSkin;
}

/**
 * A skin from its sheet (RGBA in memory order, `width` wide, laid out as PIECES - at a whole multiple of the layout's
 * size, the X68000's twice it, each piece's place as many times larger) and its colours.
 */
export function skinFromSheet(name: Tiles, sheet: Uint32Array, width: number, colours: Pick<Skin, 'ink' | 'sign' | 'frame'>): Skin {
  const cut = new Map<string, Uint32Array>();
  const k = Math.max(1, Math.round(width / SKIN_SHEET_W));
  return {
    name,
    ...colours,
    piece(file, i) {
      const p = pieceAt(file, i);
      if (!p || (p.y + p.h) * k * width > sheet.length) return null;
      const [w, h] = nativeSize(name, file, i);
      const [x0, y0] = [p.x * k, p.y * k];
      const key = `${file}:${i}`;
      let px = cut.get(key);
      if (!px) {
        px = new Uint32Array(w * h);
        for (let y = 0; y < h; y++) px.set(sheet.subarray((y0 + y) * width + x0, (y0 + y) * width + x0 + w), y * w);
        cut.set(key, px);
      }
      return { px, w, h };
    },
  };
}

/**
 * A skin piece as the framebuffer draws it over its EGA picture (Framebuffer.image): `width` by `height`, its own size,
 * drawn into the picture's place.
 */
export type SkinOver = { kind: 'skin'; px: Uint32Array; width: number; height: number };

/**
 * The pieces drawn for each skin, made once each: by the skin's own name, so a set chosen anew in the middle of a
 * dungeon draws its own pieces at once, never another set's kept from before.
 */
export class SkinOvers {
  private readonly made = new Map<string, SkinOver | null>();

  /** Piece `i` of `file` as `skin` draws it; none without a skin, or where it has no such piece. */
  over(skin: Skin | null, file: PieceFile, i: number): SkinOver | undefined {
    if (!skin) return undefined;
    const key = `${skin.name}:${file}:${i}`;
    let o = this.made.get(key);
    if (o === undefined) {
      const piece = skin.piece(file, i);
      o = piece ? { kind: 'skin', px: piece.px, width: piece.w, height: piece.h } : null;
      this.made.set(key, o);
    }
    return o ?? undefined;
  }
}

/** The Sharp X68000's eight colours, as its tiles have them (0xRRGGBB). */
export const X68K_PALETTE = [0x000000, 0x0000ff, 0xff0000, 0xff00ff, 0x00ff00, 0x00ffff, 0xffff00, 0xffffff] as const;

/** The C64's sixteen colours (the "Pepto" palette, as tools/art/c64.ts C64). */
export const C64_PALETTE = [
  0x000000, 0xffffff, 0x68372b, 0x70a4b2, 0x6f3d86, 0x588d43, 0x352879, 0xb8c76f, 0x6f4f25, 0x433900, 0x9a6759, 0x444444, 0x6c6c6c,
  0x9ad284, 0x6c5eb5, 0x959595,
] as const;
/** The Apple II's six hi-res colours (as tools/art/apple2.ts has them). */
export const APPLE_PALETTE = [0x000000, 0xffffff, 0x15cffd, 0xff6a3c, 0x14f53c, 0xff44fd] as const;
/** The Apple //e's green monitor and the //c's white (as appleArt.ts GREEN_SCREEN and WHITE_SCREEN). */
export const APPLE_GREEN = 0x33ff33;
export const APPLE_WHITE = 0xf0f0e8;

/** A monochrome monitor's skin: the Apple's dungeon lit in `tint`; every line lit, the frame's blue half as bright. */
function monoSkin(tint: number): NonNullable<(typeof SKIN_SPECS)[Tiles]> {
  const half = (((tint >> 17) & 0x7f) << 16) | (((tint >> 9) & 0x7f) << 8) | ((tint >> 1) & 0x7f);
  return {
    sheet: 'apple2-u5-dungeon-mono.png',
    tint,
    colours: {
      ink: Uint32Array.from({ length: 16 }, (_, k) => rgba(k ? tint : 0)),
      sign: { plate: 0x000000, edge: half, ink: tint },
      frame: { blue: half, white: tint },
    },
  };
}

/** The CGA's colours as Ultima V sets them, palette 1 at low intensity: black, cyan, magenta, light grey (0xRRGGBB). */
const CGA = [0x000000, 0x00aaaa, 0xaa00aa, 0xaaaaaa] as const;

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** How far apart two colours (0xRRGGBB) look: red, green and blue weighed as the eye weighs them. */
function apart(a: number, b: number): number {
  const [dr, dg, db] = [(a >> 16) - (b >> 16), ((a >> 8) & 0xff) - ((b >> 8) & 0xff), (a & 0xff) - (b & 0xff)];
  const mean = ((a >> 16) + (b >> 16)) / 2;
  return (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
}

/** The colour of `palette` (0xRRGGBB) nearest `c` to the eye. */
export function nearest(c: number, palette: readonly number[]): number {
  let best = palette[0];
  for (const p of palette) if (apart(c, p) < apart(c, best)) best = p;
  return best;
}

/** The sixteen EGA colours as the nearest of a machine's `palette` (0xRRGGBB), RGBA in memory order. */
export function inkOf(palette: readonly number[]): Uint32Array {
  return Uint32Array.from(EGA_PALETTE, (c) => rgba(nearest(c, palette)));
}

/** The 4x4 ordered dither's thresholds, sixteenths. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * How each EGA colour is shown in `palette` (0xRRGGBB): the two of the palette whose mix lies nearest it to the eye,
 * and how far toward the second it lies (0 to 1); one colour alone (t 0) where no mix comes nearer than it.
 */
function mixes(palette: readonly number[]): { a: number; b: number; t: number }[] {
  const ch = (c: number): number[] => [c >> 16, (c >> 8) & 0xff, c & 0xff];
  const pack = ([r, g, b]: number[]): number => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  return EGA_PALETTE.map((c) => {
    const near = nearest(c, palette);
    let best = { a: near, b: near, t: 0, d: apart(c, near) };
    const cc = ch(c);
    for (const a of palette)
      for (const b of palette) {
        if (a >= b) continue;
        const [pa, pb] = [ch(a), ch(b)];
        const ab = pb.map((v, k) => v - pa[k]);
        const t = Math.max(0, Math.min(1, ab.reduce((n, v, k) => n + v * (cc[k] - pa[k]), 0) / ab.reduce((n, v) => n + v * v, 0)));
        const d = apart(c, pack(pa.map((v, k) => v + ab[k] * t)));
        if (d < best.d) best = { a, b, t, d };
      }
    return best;
  });
}

/**
 * An EGA picture in a machine's palette (0xRRGGBB): each pixel the palette's colour nearest its own - or, `dither`ed,
 * an ordered mix of the two nearest it, as a machine with few colours drew its own (the X68000's) - clear where the
 * picture's mask is: the PC's piece standing in for one the machine has not (RGBA in memory order, width by height).
 */
export function recolouredPiece(v: Picture, palette: readonly number[], dither = false): Uint32Array {
  const ink = inkOf(palette);
  const mix = dither ? mixes(palette) : null;
  const out = new Uint32Array(v.width * v.height);
  for (let y = 0; y < v.height; y++)
    for (let x = 0; x < v.width; x++) {
      if (v.mask && v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) continue;
      const b = v.pixels[y * v.stride + (x >> 1)];
      const e = x & 1 ? b & 15 : b >> 4;
      if (!mix) out[y * v.width + x] = ink[e];
      else {
        const m = mix[e];
        out[y * v.width + x] = rgba(m.t * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? m.b : m.a);
      }
    }
  return out;
}

/**
 * Each machine's skin as shipped (public/graphics): its sheet, laid out as PIECES; a monochrome sheet's lit pixels
 * shown in `tint` (0xRRGGBB, the Apple //e's green, the //c's white); and its colours. Modern PC and PC EGA have none.
 */
export const SKIN_SPECS: Partial<Record<Tiles, { sheet: string; tint?: number; colours: Pick<Skin, 'ink' | 'sign' | 'frame'> }>> = {
  // Its own dungeon off its disk 2 (tools/art/c64Dungeon.ts).
  c64: {
    sheet: 'c64-u5-dungeon.png',
    // Its sign white on black in its walls' light blue (its frame's blue too dark to be seen round it); its frame its blue.
    // What the game draws in lines (a field's crackle, a drip, a skeleton's eyes) in any of its colours but the walls'
    // light blue, which would hide it.
    colours: {
      ink: inkOf(C64_PALETTE.filter((c) => c !== 0x6c5eb5)),
      sign: { plate: 0x000000, edge: 0x6c5eb5, ink: 0xffffff },
      frame: { blue: 0x352879, white: 0xffffff },
    },
  },
  // Its own dungeon off its Dungeon disk (tools/art/apple2Dungeon.ts), in its colours; the //e's and //c's on a
  // monochrome monitor, every line drawn lit.
  apple2: {
    sheet: 'apple2-u5-dungeon.png',
    colours: {
      ink: inkOf(APPLE_PALETTE),
      sign: { plate: 0x000000, edge: 0x15cffd, ink: 0xffffff },
      frame: { blue: 0x15cffd, white: 0xffffff },
    },
  },
  apple2e: monoSkin(APPLE_GREEN),
  apple2c: monoSkin(APPLE_WHITE),
  // Its own dungeon off its disk 1 (tools/art/x68kDungeon.ts), in its text palette's colours.
  x68k: {
    sheet: 'x68k-u5-dungeon.png',
    colours: {
      ink: inkOf(X68K_PALETTE),
      sign: { plate: 0x000000, edge: 0x0000ff, ink: 0xffffff },
      frame: { blue: 0x0000ff, white: 0xffffff },
    },
  },
  'pc-cga': {
    sheet: 'pc-cga-u5-dungeon.png',
    colours: {
      // The EGA's sixteen as the CGA's four: the blues and greens its cyan (a drip, a fountain's sparkle still seen),
      // the reds and magentas its magenta, the light ones - a field's light red and light magenta too, seen on the
      // caves' magenta - its light grey.
      ink: Uint32Array.from([0, 1, 1, 1, 2, 2, 2, 3, 1, 1, 1, 1, 3, 3, 3, 3], (k) => rgba(CGA[k])),
      sign: { plate: CGA[0], edge: CGA[1], ink: CGA[3] },
      frame: { blue: CGA[1], white: CGA[3] },
    },
  },
};

/** A monochrome sheet's lit pixels (any but black) in `tint` (0xRRGGBB), black and clear left as they are. */
export function tintSheet(sheet: Uint32Array, tint: number): Uint32Array {
  const lit = rgba(tint);
  return sheet.map((v) => (v >>> 24 !== 0 && (v & 0xffffff) !== 0 ? lit : v));
}

/**
 * Whether piece `i` of `file` is set `kind`'s own picture, or the PC's recoloured for it (the tools' headers say why):
 * the PC CGA's are all its own; the C64's but the narrow doorways (walls 8 and 24) and its creatures; the Apple's but
 * those, its last thing (19) and its creatures; the Sharp X68k's but the doorways.
 */
export function ownPiece(kind: Tiles, file: PieceFile, i: number): boolean {
  const wall = file === 'DNG1' || file === 'DNG2' || file === 'DNG3';
  switch (kind) {
    case 'pc-cga':
      return true;
    case 'c64':
      return wall ? i !== 8 && i !== 24 : file === 'ITEMS';
    case 'apple2':
    case 'apple2e':
    case 'apple2c':
      return wall ? i !== 8 && i !== 24 : file === 'ITEMS' && i !== 19;
    case 'x68k':
      return wall ? i !== 8 && i !== 24 : true;
    default:
      return false;
  }
}

/**
 * The colour number of the Retro sign's runes in look `t`, light on black (dungeon.ts sign): the //e's monitor green;
 * null for the rest, white.
 */
export function signRunes(t: Tiles): number | null {
  return t === 'apple2e' ? Colour.appleGreen : null;
}

/** PC EGA's own frame, its blue and white: the 1988 frame, flat, that the Enhanced interface shows it in. */
const EGA_FRAME: FrameSkin = { blue: 0x0000aa, white: 0xffffff };

/**
 * The frame for tile set `t` (Framebuffer.frameSkin), its `skin` as loaded (null until it is), in the Enhanced
 * interface or not: each set its own, fixed and flat - its skin's, PC EGA its own blue and white - in either interface.
 * Null for Remastered's copper with its place's tones, and for Retro's PC EGA, drawn by the game as ever.
 */
export function frameFor(t: Tiles, skin: Skin | null, enhanced: boolean): FrameSkin | null {
  if (t === 'modern-pc') return null;
  if (t === 'pc-ega') return enhanced ? EGA_FRAME : null;
  return skin?.frame ?? null;
}

/** PC EGA's Enhanced sign: white runes on black, in a border of the EGA's light blue (its frame's blue too dark on it). */
const EGA_SIGN: SignStyle = { plate: 0x000000, edge: 0x5555ff, ink: 0xffffff };

/**
 * Remastered's sign, flat as PC EGA's is (2026-11-16, the player's choice over the carved stone): its runes in the runes'
 * red on black, in the dark grey border the Apple //c's has.
 */
const REMASTERED_SIGN: SignStyle = { plate: 0x000000, edge: 0x787874, ink: RUNE_RED };

/**
 * The Enhanced sign's colours in look `t`, its `skin` as loaded: each flat - Remastered's (REMASTERED_SIGN), PC EGA's,
 * a skin's - or null for a skin not yet loaded (the carved stone, a moment).
 */
export function signStyleFor(t: Tiles, skin: Skin | null): SignStyle | null {
  if (t === 'modern-pc') return REMASTERED_SIGN;
  if (t === 'pc-ega') return EGA_SIGN;
  return skin?.sign ?? null;
}

/**
 * The art the maps draw with (the Map command's, a town's seen; screen.ts standardArt): the look's own (`art`, the set
 * in use) in either interface - null for Retro's PC EGA, the game's own tiles, whatever art is still kept.
 */
export function mapArtFor<A>(look: 'standard' | 'original', tiles: Tiles, art: A | null): A | null {
  if (look === 'original' && (tiles === 'pc-ega' || tiles === 'modern-pc')) return null;
  return art;
}

/**
 * Whether the dungeon's pictures are drawn in the port's own stone (standardPictures.ts restyle) in `look` with set
 * `tiles`: Remastered's alone - PC EGA's the 1988 game's own pictures in either interface, a machine's its skin's.
 */
export function portDungeon(look: 'standard' | 'original', tiles: Tiles): boolean {
  return look === 'standard' && tiles === 'modern-pc';
}
