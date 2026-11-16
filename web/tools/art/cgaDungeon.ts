/**
 * cgaDungeon.ts
 *
 * The PC CGA skin's dungeon sheet (public/graphics/pc-cga-u5-dungeon.png) from the 1988 PC game's own CGA pictures:
 * `npm run cga-dungeon -- <the game's folder>`, which reads DNG1-3.4, ITEMS.4 and MON0-7.4. Each is LZW-compressed as
 * the .16 is and holds the .16's pieces, in the same order, at the same sizes, with the same masks: a count, then an
 * offset to each picture and to its mask; a picture its width and height, then rows of two bits a pixel, the high bits
 * leftmost, padded to eight pixels (two bytes); a mask one bit a pixel, set where the picture is clear. Every piece is
 * the game's own, none recoloured from the EGA's, but for the walls' magenta, taken off them (light grey where it lies
 * solid, black in a dither) and kept on their doors. Laid out as skins.ts PIECES, in the CGA's four colours.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { PIECES, SKIN_SHEET_H, SKIN_SHEET_W, type PieceFile } from '../../src/ui/skins.ts';
import { encodePng, newImage, type Image } from '../png.ts';
import { CGA_COLOURS } from './cga.ts';

const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);

/** CGA colour `c` (0-3) as RGBA in memory order, opaque. */
const rgba = (c: number): number => {
  const v = CGA_COLOURS[c];
  return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
};

/** Picture `i` of a .4 file (expanded): RGBA in memory order, clear where its mask is. */
export function cgaPicture(res: Uint8Array, i: number): { width: number; height: number; px: Uint32Array } {
  if (i >= u16(res, 0)) throw new Error(`no picture ${i}: the file has ${u16(res, 0)}`);
  const at = u16(res, 2 + i * 4);
  const maskAt = u16(res, 4 + i * 4);
  const [width, height] = [u16(res, at), u16(res, at + 2)];
  const stride = ((width + 7) >> 3) * 2;
  const mstride = (width + 7) >> 3;
  const px = new Uint32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (maskAt && res[maskAt + 4 + y * mstride + (x >> 3)] & (0x80 >> (x & 7))) continue;
      px[y * width + x] = rgba((res[at + 4 + y * stride + (x >> 2)] >> (6 - 2 * (x & 3))) & 3);
    }
  return { width, height, px };
}

/**
 * The wall pieces with a door in them, each by the plain wall at its place (dungeon.ts sideWall, wallAhead): a side
 * door (4-7) by the side wall (0-3), a door ahead (13-15) by the wall ahead (9-11). Where the two differ is the door.
 */
export const CGA_DOORS = new Map([
  [4, 0],
  [5, 1],
  [6, 2],
  [7, 3],
  [13, 9],
  [14, 10],
  [15, 11],
]);

/**
 * A wall piece without the CGA's magenta, but for its door: a door's magenta kept where it lies thick (the door its
 * pixels that differ from the plain wall `plain`, the gaps between them closed; within a pixel of a 3 by 3 square all
 * door - a streak or an outline the door redraws beside it is not); a wall's magenta its light grey where it lies solid (five or more of the eight round
 * it magenta, the piece mirrored past its edges), and its black in a dither or a grain.
 */
function unpinked(px: Uint32Array, w: number, h: number, plain: Uint32Array | null): Uint32Array {
  const [magenta, grey, black] = [rgba(2), rgba(3), rgba(0)];
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1);
  // The door: its pixels that differ from the plain wall, the gaps between them closed (a pixel of it that happens to
  // be the wall's own - its pink where the wall's dither is pink - is the door's still).
  const differs = new Uint8Array(w * h);
  if (plain) for (let k = 0; k < w * h; k++) differs[k] = plain[k] !== px[k] ? 1 : 0;
  const near = (mask: Uint8Array, x: number, y: number, all: boolean): boolean => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const c = at(x + dx, y + dy);
        const on = c >= 0 && mask[c] === 1;
        if (all ? !on && c >= 0 : on) return !all;
      }
    return all;
  };
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grown[y * w + x] = near(differs, x, y, false) ? 1 : 0;
  const door = new Uint8Array(w * h);
  // A pink door alone keeps its pink (Deceit's): a cyan or grey one (the caves', the halls') none, the wall's pink round
  // it its wall's.
  let [pink, all] = [0, 0];
  for (let k = 0; k < w * h; k++)
    if (differs[k]) {
      all++;
      if (px[k] === magenta) pink++;
    }
  if (pink * 2 >= all) {
    // Within the door itself: the bounds of its patches of pink that differ, of a size (its planks) - not the stone it
    // redraws round itself, a speck of pink in that a speck of the wall's.
    const box = patchesBox(
      Uint8Array.from(differs, (d, k) => (d && px[k] === magenta ? 1 : 0)),
      w,
      h,
    );
    for (let y = box.y1; y <= box.y2; y++) for (let x = box.x1; x <= box.x2; x++) door[y * w + x] = near(grown, x, y, true) ? 1 : 0;
  }
  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let all = true;
      for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1 && all; dx++) all = door[at(x + dx, y + dy)] === 1;
      core[y * w + x] = all ? 1 : 0;
    }
  const out = px.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (px[k] !== magenta) continue;
      let thick = false;
      let n = 0;
      // Past the piece's edge, the piece mirrored: an edge's pixel judged on eight round it, as its middle's are.
      const mirror = (v: number, size: number): number => (v < 0 ? -v : v >= size ? 2 * size - 2 - v : v);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = at(x + dx, y + dy);
          if (c >= 0 && door[k] && core[c]) thick = true;
          if ((dx || dy) && px[mirror(y + dy, h) * w + mirror(x + dx, w)] === magenta) n++;
        }
      if (!thick) out[k] = n >= 5 ? grey : black;
    }
  return out;
}

/**
 * The bounds of the patches of set pixels in `mask` (`w` by `h`, joined at their sides and corners) a fifth the size of
 * the largest or more, together: a door's planks, not a speck.
 */
function patchesBox(mask: Uint8Array, w: number, h: number): { x1: number; y1: number; x2: number; y2: number } {
  const seen = new Uint8Array(w * h);
  const boxes: { n: number; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    const box = { n: 0, x1: w, y1: h, x2: -1, y2: -1 };
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const [x, y] = [k % w, Math.floor(k / w)];
      Object.assign(box, {
        n: box.n + 1,
        x1: Math.min(box.x1, x),
        y1: Math.min(box.y1, y),
        x2: Math.max(box.x2, x),
        y2: Math.max(box.y2, y),
      });
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const [cx, cy] = [x + dx, y + dy];
          const c = cy * w + cx;
          if (cx >= 0 && cy >= 0 && cx < w && cy < h && mask[c] && !seen[c]) {
            seen[c] = 1;
            stack.push(c);
          }
        }
    }
    boxes.push(box);
  }
  const least = Math.max(3, Math.max(0, ...boxes.map((b) => b.n)) / 5);
  const all = { x1: w, y1: h, x2: -1, y2: -1 };
  for (const b of boxes)
    if (b.n >= least)
      Object.assign(all, {
        x1: Math.min(all.x1, b.x1),
        y1: Math.min(all.y1, b.y1),
        x2: Math.max(all.x2, b.x2),
        y2: Math.max(all.y2, b.y2),
      });
  return all;
}

/**
 * The sheet: every piece of `files` (each .4 expanded, by its name less the extension) where skins.ts lays it, the
 * walls' magenta taken off them but for their doors (unpinked).
 */
export function sheet(files: Record<PieceFile, Uint8Array>): Image {
  const out = newImage(SKIN_SHEET_W, SKIN_SHEET_H);
  const words = new Uint32Array(out.data.buffer);
  for (const p of PIECES) {
    const v = cgaPicture(files[p.file], p.i);
    if (v.width !== p.w || v.height !== p.h) throw new Error(`${p.file}.4 ${p.i} is ${v.width} by ${v.height}, not ${p.w} by ${p.h}`);
    let px = v.px;
    if (p.file === 'DNG1' || p.file === 'DNG2' || p.file === 'DNG3') {
      const plain = CGA_DOORS.has(p.i) ? cgaPicture(files[p.file], CGA_DOORS.get(p.i)!).px : null;
      px = unpinked(px, p.w, p.h, plain);
    }
    for (let y = 0; y < p.h; y++) words.set(px.subarray(y * p.w, y * p.w + p.w), (p.y + y) * SKIN_SHEET_W + p.x);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: npm run cga-dungeon -- <the Ultima V folder, with DNG1-3.4, ITEMS.4 and MON0-7.4>');
    process.exit(1);
  }
  const names = [...new Set(PIECES.map((p) => p.file))];
  const files = Object.fromEntries(names.map((n) => [n, lzwDecompress(new Uint8Array(readFileSync(`${dir}/${n}.4`)))]));
  const out = new URL('../../public/graphics/pc-cga-u5-dungeon.png', import.meta.url);
  writeFileSync(out, encodePng(sheet(files as Record<PieceFile, Uint8Array>)));
  console.log(`${out.pathname}: ${PIECES.length} pieces`);
}
