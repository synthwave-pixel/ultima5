/**
 * c64Dungeon.ts
 *
 * The C64 skin's dungeon sheet (public/graphics/c64-u5-dungeon.png) from Ultima V's own Commodore 64 disk 2: `npm run
 * c64-dungeon -- <disk 2 .d64> <the game's folder>`, the folder the PC game's, for the colours and the pieces the C64
 * has none of its own.
 *
 * The C64 draws its dungeon as the Apple does (apple2Dungeon.ts), from the same table of 83 pictures (MAIN.DNG, at
 * $8000: where each starts, low bytes at $A560 and high at $A5B3; its first and last row at $9B4F and $9BA2, its first
 * and last byte at $9BF5 and $9C48), each a byte of eight pixels (the high bit leftmost) to each eight of the PC's, and
 * seven-eighths of its rows. Its walls are packed as the Apple's are (apple2Dungeon.ts unpack), each dungeon's in three
 * files, DNGnA, DNGnB and DNGnC, unpacked to 4096, 4096 and 3760 bytes end to end at $C000; its things as they are
 * (ITEMS, at $EEB0). The walls are 0-27 and the things 31-70, each thing its picture then its mask (a set bit where it
 * is clear).
 *
 * Each picture is stored from its last row up, as MAIN.DNG draws it. A hi-res picture: its set bits drawn in one colour
 * on black - the walls light blue in every dungeon, as play of its Despise shows them; a thing the C64's nearest its PC
 * piece's own most used (not the earth's brown: a chest its gold), as each of its colour cells gave its picture one. Its own: the walls (but the two narrow doorways, 8 and 24, which its
 * table gives the wide wall's picture) and the things. Recoloured from the PC's: the doorways, and the creatures - each
 * kind's MSn holds its as hardware sprites (21 rows of three bytes to a block of 64, three stacked for one near), drawn
 * its own way and not decoded here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { picture, type Picture } from '../../src/data/images.ts';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { EGA_PALETTE } from '../../src/data/tiles.ts';
import { nativeSize, nearest, PIECES, recolouredPiece, SKIN_SHEET_H, SKIN_SHEET_W, type PieceFile } from '../../src/ui/skins.ts';
import { encodePng, newImage, type Image } from '../png.ts';
import { unpack } from './apple2Dungeon.ts';
import { C64, d64File } from './c64.ts';

const B = 0x8000;

/** The C64's dungeon: each dungeon's walls (unpacked, at $C000) and the things (at $EEB0). */
export interface C64Dungeon {
  walls: Record<'DNG1' | 'DNG2' | 'DNG3', Uint8Array>;
  items: Uint8Array;
  /** Each of the 83 pictures: where it starts, its first and last row, its first and last byte. */
  table: { at: number; y1: number; y2: number; x1: number; x2: number }[];
}

/** Wall pieces the C64 has none of its own: the narrow doorways, which its table gives the wide wall's picture. */
export const C64_RECOLOURED_WALLS = new Set([8, 24]);

/** The C64's dungeon off its disk 2 (a .d64 image). */
export function c64Dungeon(d64: Uint8Array): C64Dungeon {
  const file = (name: string): Uint8Array => {
    const f = d64File(d64, name);
    if (!f) throw new Error(`no ${name} on it (it wants disk 2 of 6)`);
    return f;
  };
  const wall = (n: number): Uint8Array => {
    const out = new Uint8Array(0x2eb0);
    out.set(unpack(file(`DNG${n}A`), 4096), 0);
    out.set(unpack(file(`DNG${n}B`), 4096), 4096);
    out.set(unpack(file(`DNG${n}C`), 3760), 8192);
    return out;
  };

  const main = file('MAIN.DNG');
  const t = (addr: number, k: number): number => main[addr - B + k];
  return {
    walls: { DNG1: wall(1), DNG2: wall(2), DNG3: wall(3) },
    items: file('ITEMS'),
    table: Array.from({ length: 83 }, (_, k) => ({
      at: t(0xa560, k) | (t(0xa5b3, k) << 8),
      y1: t(0x9b4f, k),
      y2: t(0x9ba2, k),
      x1: t(0x9bf5, k),
      x2: t(0x9c48, k),
    })),
  };
}

/** Picture `k` of the table, rows of bytes top row first, from memory `mem` starting at `base` (its last row first). */
function cut(d: C64Dungeon, k: number, mem: Uint8Array, base: number): { rows: Uint8Array[]; width: number } {
  const { at, y1, y2, x1, x2 } = d.table[k];
  const perRow = x2 - x1 + 1;
  return {
    rows: Array.from({ length: y2 - y1 + 1 }, (_, r) => mem.subarray(at - base + r * perRow, at - base + (r + 1) * perRow)).reverse(),
    width: perRow * 8,
  };
}

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/**
 * The EGA colour pictures `vs` use most, black, their clear pixels and any of `skip` left out (0xRRGGBB); black if they
 * have none.
 */
function mostUsed(vs: Picture[], skip: number[] = []): number {
  const n = new Array<number>(16).fill(0);
  for (const v of vs)
    for (let y = 0; y < v.height; y++)
      for (let x = 0; x < v.width; x++) {
        if (v.mask && v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) continue;
        const b = v.pixels[y * v.stride + (x >> 1)];
        n[x & 1 ? b & 15 : b >> 4]++;
      }
  for (const k of [0, ...skip]) n[k] = 0;
  const best = n.indexOf(Math.max(...n));
  return n[best] ? EGA_PALETTE[best] : 0;
}

/** `pic` at its own size, its set bits `ink` on black, clear where `mask` has a bit set. */
function own(pic: { rows: Uint8Array[]; width: number }, ink: number, mask?: { rows: Uint8Array[] }): Uint32Array {
  const bit = (rows: Uint8Array[], y: number, x: number): boolean => ((rows[y][x >> 3] >> (7 - (x & 7))) & 1) === 1;
  const out = new Uint32Array(pic.width * pic.rows.length);
  for (let y = 0; y < pic.rows.length; y++)
    for (let x = 0; x < pic.width; x++) if (!mask || !bit(mask.rows, y, x)) out[y * pic.width + x] = rgba(bit(pic.rows, y, x) ? ink : 0);
  return out;
}

/** The C64's walls' colour, its light blue, as its Despise shows them: light blue in black lines. */
export const C64_WALLS = 0x6c5eb5;

/** The colours a thing may take: the C64's but the walls' light blue. */
const THING_COLOURS = C64.filter((c) => c !== C64_WALLS);

/** An EGA picture in two colours: its black black, every other colour `ink`, clear where its mask is. */
function twoTone(v: Picture, ink: number): Uint32Array {
  const out = new Uint32Array(v.width * v.height);
  for (let y = 0; y < v.height; y++)
    for (let x = 0; x < v.width; x++) {
      if (v.mask && v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) continue;
      const b = v.pixels[y * v.stride + (x >> 1)];
      out[y * v.width + x] = rgba((x & 1 ? b & 15 : b >> 4) ? ink : 0);
    }
  return out;
}

/**
 * The sheet: every piece the C64 has at its own size (skins.ts nativeSize; the game draws it into the PC piece's
 * place on its finer grid); the doorways and creatures it has not, the PC's (`pc`, .16s) recoloured.
 */
export function sheet(d: C64Dungeon, pc: Record<PieceFile, Uint8Array>): Image {
  const out = newImage(SKIN_SHEET_W, SKIN_SHEET_H);
  const words = new Uint32Array(out.data.buffer);
  for (const p of PIECES) {
    const v = picture(pc[p.file], p.i);
    if (!v) throw new Error(`no ${p.file}.16 ${p.i}`);
    // A thing not in the earth's own brown (EGA 6), which it would stand on unseen: a chest its gold.
    // A thing in any colour but the walls' light blue, which it would stand on unseen (a stalactite's puddle).
    const ink = p.file === 'ITEMS' ? nearest(mostUsed([v], [6]), THING_COLOURS) : C64_WALLS;
    let px: Uint32Array;
    if (p.file === 'DNG1' || p.file === 'DNG2' || p.file === 'DNG3') {
      // A doorway it has none of: the PC's in the walls' two colours, its black black and the rest light blue.
      px = C64_RECOLOURED_WALLS.has(p.i) ? twoTone(v, C64_WALLS) : own(cut(d, p.i, d.walls[p.file], 0xc000), ink);
    } else if (p.file === 'ITEMS') {
      const [k, mask] = [31 + p.i * 2, 32 + p.i * 2];
      px = own(cut(d, k, d.items, 0xeeb0), ink, cut(d, mask, d.items, 0xeeb0));
    } else {
      // Its creatures are hardware sprites, not drawn as its walls and things are: the PC's, recoloured.
      px = recolouredPiece(v, C64);
    }
    const [w, h] = nativeSize('c64', p.file, p.i);
    if (px.length !== w * h) throw new Error(`${p.file} ${p.i} is ${px.length} pixels, not ${w} by ${h}`);
    for (let y = 0; y < h; y++) words.set(px.subarray(y * w, y * w + w), (p.y + y) * SKIN_SHEET_W + p.x);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [disk, dir] = process.argv.slice(2);
  if (!disk || !dir) {
    console.error('usage: npm run c64-dungeon -- <the Ultima V C64 disk 2 .d64> <the Ultima V folder>');
    process.exit(1);
  }
  const names = [...new Set(PIECES.map((p) => p.file))];
  const pc = Object.fromEntries(names.map((n) => [n, lzwDecompress(new Uint8Array(readFileSync(`${dir}/${n}.16`)))])) as Record<
    PieceFile,
    Uint8Array
  >;
  const out = new URL('../../public/graphics/c64-u5-dungeon.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(c64Dungeon(new Uint8Array(readFileSync(disk))), pc)));
  console.log(`${out.pathname}: ${PIECES.length} pieces`);
}
