/**
 * x68kDungeon.ts
 *
 * The Sharp X68k skin's dungeon sheet (public/graphics/x68k-u5-dungeon.png) from the Japanese Sharp X68000 release's
 * own first disk (Pony Canyon, 1990): `npm run x68k-dungeon -- <disk 1 .dim> <the game's folder>`, the folder the PC
 * game's, for the two pieces the X68000 has none of.
 *
 * A .dim is a floppy as the DIM copier keeps it: a header of 256 bytes, then every sector in order. The disk is
 * Human68k's, its files as MS-DOS keeps them (FAT12): the boot sector's figures big-endian from its 0x12 - the bytes a
 * sector, the sectors a cluster, the FATs, the reserved sectors, the root's entries; its FATs and directory little-
 * endian, a name's first 8 characters and then 10 more after the attribute.
 *
 * DNG1-3.DAT, ITEMS.DAT and MON0-7.DAT hold the PC's pieces, in the PC's order: a count, then where each piece starts
 * (four bytes; 0 for none), and each piece its width in bytes of eight pixels and its height, then its bitplanes, each
 * row by row, the high bit leftmost: a wall's three (no mask), a thing's or creature's three and a fourth set where it
 * is clear, after the bytes a plane. MON0-7.DAT are packed with the PC's LZW. The three planes are a colour of the
 * X68000's text palette (U5.X sets the standard 16; the dungeon draws in its first eight). The game draws in its
 * text screen at twice the PC's pixels across: the walls twice the PC's width and 316 rows, the creatures twice the
 * PC's every way.
 *
 * The X68000 redrew the things whole, each at a size of its own, where the PC keeps the left half of each and draws
 * it again mirrored: each thing's left half, standing on its foot against the middle, in a place twice the PC piece's.
 * DNG2's and DNG3's room mouth (12) is drawn narrower than DNG1's: its stone alone, at the left of its place, the dark
 * of the room left undrawn.
 * Its own: every wall but the two narrow doorways (8 and 24), which it has no picture of; every thing and creature.
 * Recoloured from the PC's: the doorways, in the colours its walls of that dungeon use, dithered between the two
 * nearest each.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { picture } from '../../src/data/images.ts';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { nativeSize, PIECES, recolouredPiece, SKIN_SHEET_H, SKIN_SHEET_W, X68K_PALETTE, type PieceFile } from '../../src/ui/skins.ts';
import { encodePng, newImage, type Image } from '../png.ts';

/** The X68k sheet's scale: each piece's place twice the PC's every way. */
export const X68K_SCALE = 2;

/** Every file in the root of a Human68k disk (a .dim image), by name. */
export function dimFiles(dim: Uint8Array): Map<string, Uint8Array> {
  const d = dim.subarray(256);
  const be = (o: number): number => (d[o] << 8) | d[o + 1];
  const le16 = (o: number): number => d[o] | (d[o + 1] << 8);
  const le32 = (o: number): number => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const [bps, spc, fats, reserved, roots, spf] = [be(0x12), d[0x14], d[0x15], be(0x16), be(0x18), d[0x1d]];
  if (bps !== 1024 || spc < 1 || fats < 1 || spf < 1) throw new Error('not a Human68k disk (it wants disk 1 of 2)');
  const fat = reserved * bps;
  const next = (c: number): number => {
    const o = fat + Math.floor((c * 3) / 2);
    const v = d[o] | (d[o + 1] << 8);
    return c & 1 ? v >> 4 : v & 0xfff;
  };
  const root = (reserved + fats * spf) * bps;
  const data = root + Math.ceil((roots * 32) / bps) * bps;
  const out = new Map<string, Uint8Array>();
  for (let e = root; e < root + roots * 32; e += 32) {
    if (d[e] === 0) break;
    if (d[e] === 0xe5 || d[e + 11] & 0x18) continue;
    const text = (from: number, to: number): string => String.fromCharCode(...d.subarray(from, to)).replace(/[\0 ]+$/, '');
    const name = text(e, e + 8) + text(e + 12, e + 22);
    const ext = text(e + 8, e + 11);
    const size = le32(e + 28);
    const file = new Uint8Array(size);
    let [c, at] = [le16(e + 26), 0];
    while (c >= 2 && c < 0xff0 && at < size) {
      const from = data + (c - 2) * spc * bps;
      const n = Math.min(spc * bps, size - at);
      file.set(d.subarray(from, from + n), at);
      at += n;
      c = next(c);
    }
    out.set(ext ? `${name}.${ext}` : name, file);
  }
  return out;
}

/** A piece's pixels as the X68000 has them: RGBA in memory order, clear where its mask is. */
export interface X68kPiece {
  w: number;
  h: number;
  px: Uint32Array;
}

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/**
 * Each piece of a pieces file (DNG1-3.DAT, ITEMS.DAT, a MON's unpacked): null where it has none. A wall's three planes
 * follow its size; a thing's or creature's four, the bytes a plane between.
 */
export function x68kPieces(file: Uint8Array, masked: boolean): (X68kPiece | null)[] {
  const le16 = (o: number): number => file[o] | (file[o + 1] << 8);
  const le32 = (o: number): number => (file[o] | (file[o + 1] << 8) | (file[o + 2] << 16) | (file[o + 3] << 24)) >>> 0;
  return Array.from({ length: le16(0) }, (_, i) => {
    const at = le32(2 + i * 4);
    if (!at) return null;
    const [bytes, h] = [le16(at), le16(at + 2)];
    const plane = bytes * h;
    const start = at + (masked ? 6 : 4);
    const w = bytes * 8;
    const px = new Uint32Array(w * h);
    const bit = (p: number, x: number, y: number): number => (file[start + p * plane + y * bytes + (x >> 3)] >> (7 - (x & 7))) & 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (masked && bit(3, x, y)) continue;
        px[y * w + x] = rgba(X68K_PALETTE[bit(0, x, y) | (bit(1, x, y) << 1) | (bit(2, x, y) << 2)]);
      }
    return { w, h, px };
  });
}

/** The X68000's dungeon: its walls, things and creatures, by the PC's files. */
export type X68kDungeon = Record<PieceFile, (X68kPiece | null)[]>;

/** The dungeon off its disk 1 (a .dim image). */
export function x68kDungeon(dim: Uint8Array): X68kDungeon {
  const files = dimFiles(dim);
  const file = (name: string): Uint8Array => {
    const f = files.get(name);
    if (!f) throw new Error(`no ${name} on it (it wants disk 1 of 2)`);
    return f;
  };
  const out = {} as X68kDungeon;
  for (const n of ['DNG1', 'DNG2', 'DNG3'] as const) out[n] = x68kPieces(file(`${n}.DAT`), false);
  out.ITEMS = x68kPieces(file('ITEMS.DAT'), true);
  for (let m = 0; m < 8; m++) out[`MON${m}` as PieceFile] = x68kPieces(lzwDecompress(file(`MON${m}.DAT`)), true);
  return out;
}

/** A whole thing's left half, standing on its foot against the right of a place `w` by `h` (its right half the mirror). */
function leftHalf(t: X68kPiece, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const half = t.w >> 1;
  for (let y = 0; y < Math.min(t.h, h); y++)
    for (let x = 0; x < Math.min(half, w); x++) out[(h - 1 - y) * w + (w - 1 - x)] = t.px[(t.h - 1 - y) * t.w + (half - 1 - x)];
  return out;
}

/**
 * A wall narrower than its place, at its left and the rest clear: DNG2's and DNG3's room mouth (12), whose dark the
 * X68000 leaves undrawn, the corridor behind it seen through, where DNG1's is drawn whole.
 */
function atLeft(t: X68kPiece, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h);
  for (let y = 0; y < Math.min(t.h, h); y++) out.set(t.px.subarray(y * t.w, y * t.w + Math.min(t.w, w)), y * w);
  return out;
}

/** The colours a dungeon's walls use (0xRRGGBB): its doorways recoloured in them. */
function wallColours(pieces: (X68kPiece | null)[]): number[] {
  const used = new Set<number>();
  for (const p of pieces) if (p) for (const v of p.px) used.add(v);
  return X68K_PALETTE.filter((c) => used.has(rgba(c)));
}

/**
 * The sheet, twice the PC layout's size every way (X68K_SCALE): each piece at its own size (skins.ts nativeSize) in its
 * place; the doorways it has none of, the PC's (`pc`, .16s) recoloured, at the PC's size.
 */
export function sheet(d: X68kDungeon, pc: Record<PieceFile, Uint8Array>): Image {
  const W = SKIN_SHEET_W * X68K_SCALE;
  const out = newImage(W, SKIN_SHEET_H * X68K_SCALE);
  const words = new Uint32Array(out.data.buffer);
  for (const p of PIECES) {
    const [w, h] = nativeSize('x68k', p.file, p.i);
    const own = d[p.file][p.i];
    let px: Uint32Array;
    if (p.file === 'ITEMS') px = leftHalf(own!, w, h);
    else if (own) px = own.w === w && own.h === h ? own.px : atLeft(own, w, h);
    else {
      const v = picture(pc[p.file], p.i);
      if (!v) throw new Error(`no ${p.file}.16 ${p.i}`);
      px = recolouredPiece(v, wallColours(d[p.file]), true);
    }
    if (px.length !== w * h) throw new Error(`${p.file} ${p.i} is ${px.length} pixels, not ${w} by ${h}`);
    for (let y = 0; y < h; y++) words.set(px.subarray(y * w, y * w + w), (p.y * X68K_SCALE + y) * W + p.x * X68K_SCALE);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [disk, dir] = process.argv.slice(2);
  if (!disk || !dir) {
    console.error('usage: npm run x68k-dungeon -- <the Ultima V X68000 disk 1 .dim> <the Ultima V folder>');
    process.exit(1);
  }
  const names = [...new Set(PIECES.map((p) => p.file))];
  const pc = Object.fromEntries(names.map((n) => [n, lzwDecompress(new Uint8Array(readFileSync(`${dir}/${n}.16`)))])) as Record<
    PieceFile,
    Uint8Array
  >;
  const out = new URL('../../public/graphics/x68k-u5-dungeon.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(x68kDungeon(new Uint8Array(readFileSync(disk))), pc)));
  console.log(`${out.pathname}: ${PIECES.length} pieces`);
}
