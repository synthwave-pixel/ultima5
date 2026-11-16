/**
 * apple2Dungeon.ts
 *
 * The Apple skins' dungeon sheets (public/graphics/apple2-u5-dungeon.png, and apple2-u5-dungeon-mono.png for the
 * Apple //e and //c) from Ultima V's own Apple II Dungeon disk: `npm run apple2-dungeon -- <Dungeon disk> <the game's
 * folder>`, the disk a .dsk or .po image or the .zip it came in (disk 7 of 8); the folder the PC game's, for the pieces
 * the Apple has none of its own.
 *
 * The disk's DNG1.LZ, DNG2.LZ, DNG3.LZ and ITEMS.LZ are packed by its UNPACK.LZ: the first 128 bytes as they are, and
 * the start of a ring of 256 bytes from 128 on; then, again and again, a count - 0 for one byte as it is, which
 * follows, else that many bytes of the ring from the offset that follows - each byte so made written out and into the
 * ring from 0 on. Each dungeon's walls unpack to $2EB0 bytes at $4000, the things to $DC8 at $6EB0. MAIN.DNG's table of
 * 83 pictures gives where each starts and its rows and bytes (pictureTable, skins.ts NATIVE_WALLS and NATIVE_ITEMS);
 * each is the PC's piece (skins.ts PIECES) at about seven-eighths of its size - a byte of seven pixels for each eight
 * of the PC's (the last thing, a small one, smaller) - row by row from its last row up (as MAIN.DNG draws it), a hi-res byte (low bit leftmost, the high bit its
 * colours) at a time: 0-27 the walls; 31-70 the twenty things, each its picture then its mask (a set bit where it is
 * clear).
 *
 * Drawn in the Apple's colours as its screen showed them (a pixel lit beside another lit white, one lit alone its
 * column's colour), and on a monochrome monitor (each lit bit white; the walls dark in light lines, a set the colours
 * draw mostly lit inverted, as the //e and //c sets show them), each at its own size - the game draws it into the PC
 * piece's place on its finer grid (Framebuffer.image). Its own: the walls (but the two narrow doorways, 8 and 24, which
 * its table gives the wide wall's picture) and the things (but the last). Recoloured from the PC's, in its six colours or its monitor's: the doorways
 * the creatures, which its disks have none of, and the last thing, which it draws nothing of.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { picture } from '../../src/data/images.ts';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { nativeSize, ownPiece, PIECES, recolouredPiece, SKIN_SHEET_H, SKIN_SHEET_W, type PieceFile } from '../../src/ui/skins.ts';
import { encodePng, newImage, type Image } from '../png.ts';
import { BLACK, BLUE, GREEN, ORANGE, prodosFile, VIOLET, WHITE } from './apple2.ts';

/** The Apple's six colours (0xRRGGBB). */
export const APPLE_COLOURS = [BLACK, WHITE, BLUE, ORANGE, GREEN, VIOLET] as const;
/** The monochrome monitor's two (white, tinted green or white by the set). */
export const APPLE_MONO = [BLACK, WHITE] as const;

/** UNPACK.LZ: `src` unpacked to `n` bytes. */
export function unpack(src: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  const ring = new Uint8Array(256);
  let [i, o, w] = [0, 0, 0];
  for (let y = 0x80; y < 0x100 && o < n; y++) ring[y] = out[o++] = src[i++];
  while (o < n) {
    const count = src[i++];
    const pending: number[] = [];
    if (count === 0) pending.push(src[i++]);
    else {
      const at = src[i++];
      for (let k = 0; k < count; k++) pending.push(ring[(at + k) & 0xff]);
    }
    for (const b of pending) {
      if (o < n) out[o++] = b;
      ring[w] = b;
      w = (w + 1) & 0xff;
    }
  }
  return out;
}

/** One of MAIN.DNG's 83 pictures: where it starts, and its first and last row and byte. */
export interface AppleEntry {
  at: number;
  y1: number;
  y2: number;
  x1: number;
  x2: number;
}

/**
 * MAIN.DNG's table of its 83 pictures (MAIN.DNG loads at $8000): where each starts (low bytes at $A525, high at $A578),
 * its first and last row ($9D8D, $9DE0) and its first and last byte ($9E33, $9E86) on the screen.
 */
export function pictureTable(mainDng: Uint8Array): AppleEntry[] {
  const t = (addr: number, k: number): number => mainDng[addr - 0x8000 + k];
  return Array.from({ length: 83 }, (_, k) => ({
    at: t(0xa525, k) | (t(0xa578, k) << 8),
    y1: t(0x9d8d, k),
    y2: t(0x9de0, k),
    x1: t(0x9e33, k),
    x2: t(0x9e86, k),
  }));
}

/** A picture of `bytes` bytes a row and `rows` rows, at `at` in memory (`mem`, from address `base`). */
interface ApplePicture {
  bytes: number[][];
  width: number;
  /** The view's byte its rows start at (MAIN.DNG's table). */
  start: number;
}

/** The picture of `entry`, top row first: MAIN.DNG draws each from its last row up, so its bytes hold the last row first. */
function cut(mem: Uint8Array, base: number, { at, y1, y2, x1, x2 }: AppleEntry): ApplePicture {
  const [perRow, rows] = [x2 - x1 + 1, y2 - y1 + 1];
  return {
    bytes: Array.from({ length: rows }, (_, r) => Array.from(mem.subarray(at - base + r * perRow, at - base + (r + 1) * perRow))).reverse(),
    width: perRow * 7,
    start: x1,
  };
}

/**
 * The screen byte the view's own byte 0 lies on: odd. MAIN.DNG draws the view into a buffer (rows of 20 bytes at
 * $A700) and copies it out, so its table's bytes are the view's; play of the Apple shows its halls orange, which only
 * an odd byte gives them (an even one, blue).
 */
const VIEW_BYTE = 1;

/** The colour of a lit pixel alone at screen column `x` of its byte's palette (`high`). */
const hue = (x: number, high: number): number => (high ? (x % 2 ? BLUE : ORANGE) : x % 2 ? VIOLET : GREEN);

/**
 * A row of hi-res bytes as the screen showed it, its first byte at screen byte `start` (the table's, where MAIN.DNG
 * draws the picture): a pixel lit beside another lit white, one lit alone its screen column's colour, a dark one
 * between two lit alone their colour; or (`mono`) each lit bit white. Past its edges, its pattern going on (no coloured
 * seam where pictures meet).
 */
export function appleRow(bytes: number[], mono = false, start = 0): number[] {
  const width = bytes.length * 7;
  const bit = (x: number): boolean => ((bytes[Math.floor(x / 7)] >> (x % 7)) & 1) === 1;
  // Past either edge, the pattern at it going on: the shortest of 2, 3 or 4 pixels that repeats there, or else its
  // edge pixel - the picture beside it on the screen likely the same grain, where black would set a coloured seam.
  const period = (from: number, step: number): number => {
    for (const p of [2, 3, 4]) {
      let holds = 2 * p <= width;
      for (let k = 0; k < p && holds; k++) holds = bit(from + step * k) === bit(from + step * (k + p));
      if (holds) return p;
    }
    return 1;
  };
  const [left, right] = [period(0, 1), period(width - 1, -1)];
  const on = (x: number): boolean => {
    if (x < 0) x += left * Math.ceil(-x / left);
    if (x >= width) x -= right * Math.ceil((x - width + 1) / right);
    return bit(Math.min(width - 1, Math.max(0, x)));
  };
  const high = (x: number): number => bytes[Math.floor(x / 7)] >> 7;
  return Array.from({ length: width }, (_, x) => {
    if (mono) return on(x) ? WHITE : BLACK;
    const column = start * 7 + x;
    if (on(x)) return on(x - 1) || on(x + 1) ? WHITE : hue(column, high(x));
    return on(x - 1) && on(x + 1) && !on(x - 2) && !on(x + 2) ? hue(column - 1, high(x - 1)) : BLACK;
  });
}

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/**
 * `pic` at its own size, as the Apple's screen showed it - in its colours or (`mono`) its monitor's - clear where its
 * `mask` has a bit set, as the PC's masks are: RGBA in memory order, its width by its rows.
 */
function own(pic: ApplePicture, mono: boolean, mask?: ApplePicture): Uint32Array {
  const rows = pic.bytes.map((b) => appleRow(b, mono, VIEW_BYTE + pic.start));
  const drawn = mask?.bytes.map((b) => appleRow(b, true, VIEW_BYTE + pic.start));
  const out = new Uint32Array(pic.width * rows.length);
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < pic.width; x++) if (!drawn || drawn[y][x] === BLACK) out[y * pic.width + x] = rgba(rows[y][x]);
  return out;
}

/** The Apple's pieces: each dungeon's walls (unpacked, at $4000), the things (at $6EB0), and MAIN.DNG's table. */
export interface AppleDungeon {
  walls: Record<'DNG1' | 'DNG2' | 'DNG3', Uint8Array>;
  items: Uint8Array;
  table: AppleEntry[];
}

/** Wall pieces the Apple has none of its own: the narrow doorways, which its table gives the wide wall's picture. */
export const APPLE_RECOLOURED_WALLS = new Set([8, 24]);

/**
 * Wall piece `i` of `file` in the Apple's colours: its own, at its own size, or the PC's recoloured, at the PC piece's,
 * where it has none (the doorways).
 */
function wallPiece(apple: AppleDungeon, pc: Record<PieceFile, Uint8Array>, file: 'DNG1' | 'DNG2' | 'DNG3', i: number): Uint32Array {
  if (APPLE_RECOLOURED_WALLS.has(i)) return recolouredPiece(picture(pc[file], i)!, APPLE_COLOURS, true);
  return own(cut(apple.walls[file], 0x4000, apple.table[i]), false);
}

/** Whether the Apple's colours draw wall set `file` mostly lit: more of its walls' pixels lit than dark. */
function mostlyLit(apple: AppleDungeon, pc: Record<PieceFile, Uint8Array>, file: 'DNG1' | 'DNG2' | 'DNG3'): boolean {
  let lit = 0;
  let all = 0;
  for (const p of PIECES)
    if (p.file === file)
      for (const v of wallPiece(apple, pc, file, p.i)) {
        all++;
        if (v & 0xffffff) lit++;
      }
  return lit * 2 > all;
}

/**
 * The sheet: every piece the Apple has (walls, things) at its own size (skins.ts nativeSize), in its colours or
 * (`mono`) its monitor's, the rest the PC's own (`pc`, each .16 expanded) recoloured in them at the PC piece's size;
 * each where skins.ts PIECES lays it, from its place's top left.
 */
export function sheet(apple: AppleDungeon, pc: Record<PieceFile, Uint8Array>, mono: boolean): Image {
  const out = newImage(SKIN_SHEET_W, SKIN_SHEET_H);
  const words = new Uint32Array(out.data.buffer);
  const palette = mono ? APPLE_MONO : APPLE_COLOURS;
  const lit = new Map<string, boolean>();
  for (const p of PIECES) {
    const [w, h] = nativeSize('apple2', p.file, p.i);
    let px: Uint32Array;
    if (p.file === 'DNG1' || p.file === 'DNG2' || p.file === 'DNG3') {
      px = wallPiece(apple, pc, p.file, p.i);
      if (mono) {
        // The monitors' walls dark in light lines: a set the Apple's colours draw mostly lit inverted, lit where they
        // are dark and dark where lit; one they draw mostly dark (the black halls in white edges) as they draw it.
        if (!lit.has(p.file)) lit.set(p.file, mostlyLit(apple, pc, p.file));
        const invert = lit.get(p.file)!;
        px = px.map((v) => (v >>> 24 ? rgba(!(v & 0xffffff) === invert ? WHITE : BLACK) : v));
      }
    } else if (p.file === 'ITEMS' && ownPiece('apple2', p.file, p.i)) {
      px = own(cut(apple.items, 0x6eb0, apple.table[31 + p.i * 2]), mono, cut(apple.items, 0x6eb0, apple.table[32 + p.i * 2]));
    } else {
      // The creatures its disks have none of, and the last thing, which it draws nothing of: the PC's, recoloured.
      const v = picture(pc[p.file], p.i);
      if (!v) throw new Error(`no ${p.file}.16 ${p.i}`);
      px = recolouredPiece(v, palette, true);
    }
    if (px.length !== w * h) throw new Error(`${p.file} ${p.i} is ${px.length} pixels, not ${w} by ${h}`);
    for (let y = 0; y < h; y++) words.set(px.subarray(y * w, y * w + w), (p.y + y) * SKIN_SHEET_W + p.x);
  }
  return out;
}

/** The disk image, out of its .zip if it is in one. */
function diskImage(path: string): Uint8Array {
  const file = new Uint8Array(readFileSync(path));
  if (!path.toLowerCase().endsWith('.zip')) return file;
  const image = Object.entries(unzipSync(file)).find(([name]) => /\.(dsk|po|do)$/i.test(name));
  if (!image) throw new Error(`${path}: no disk image in it`);
  return image[1];
}

/** The Apple's dungeon off its Dungeon disk's image. */
export function appleDungeon(image: Uint8Array): AppleDungeon {
  const file = (name: string): Uint8Array => {
    const f = prodosFile(image, name);
    if (!f) throw new Error(`no ${name} on it (it wants the Dungeon disk, disk 7 of 8)`);
    return f;
  };
  return {
    walls: { DNG1: unpack(file('DNG1.LZ'), 0x2eb0), DNG2: unpack(file('DNG2.LZ'), 0x2eb0), DNG3: unpack(file('DNG3.LZ'), 0x2eb0) },
    items: unpack(file('ITEMS.LZ'), 0xdc8),
    table: pictureTable(file('MAIN.DNG')),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [disk, dir] = process.argv.slice(2);
  if (!disk || !dir) {
    console.error('usage: npm run apple2-dungeon -- <the Ultima V Apple II Dungeon disk: .dsk, .po or its .zip> <the Ultima V folder>');
    process.exit(1);
  }
  const apple = appleDungeon(diskImage(disk));
  const names = [...new Set(PIECES.map((p) => p.file))];
  const pc = Object.fromEntries(names.map((n) => [n, lzwDecompress(new Uint8Array(readFileSync(`${dir}/${n}.16`)))])) as Record<
    PieceFile,
    Uint8Array
  >;
  for (const [mono, name] of [
    [false, 'apple2-u5-dungeon.png'],
    [true, 'apple2-u5-dungeon-mono.png'],
  ] as const) {
    const out = new URL(`../../public/graphics/${name}`, import.meta.url);
    writeFileSync(out, encodePng(sheet(apple, pc, mono)));
    console.log(`${out.pathname}: ${PIECES.length} pieces`);
  }
}
