/**
 * recolourDungeon.ts
 *
 * The Sharp X68k skin's dungeon sheet (public/graphics/x68k-u5-dungeon.png), the X68000 having no dungeon pictures of
 * its own to be had (only its tiles are, from the Ultima Codex): the PC's own (DNG1-3.16, ITEMS.16, MON0-7.16, from the
 * player's copy), the walls dark in light lines in each dungeon's own colours - each colour of a wall at under half its
 * lightness, its hue kept; a thin black (a line, a dither's dot) light, in the colour its dungeon's walls use most; a
 * thick black (an opening, a doorway's dark) left black - and the things and creatures as the PC has them. `npm run
 * recolour-dungeon -- x68k <the game's folder>`. Laid out as skins.ts PIECES.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { picture, type Picture } from '../../src/data/images.ts';
import { lzwDecompress } from '../../src/data/lzw.ts';
import { EGA_PALETTE } from '../../src/data/tiles.ts';
import { PIECES, SKIN_SHEET_H, SKIN_SHEET_W, type PieceFile } from '../../src/ui/skins.ts';
import { encodePng, newImage, type Image } from '../png.ts';

/** 0xRRGGBB as RGBA in memory order, opaque. */
const rgba = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

/** A walls' colour at under half its lightness: its hue and saturation kept. */
const FACE = 0.45;
/** The lightness of a wall's thin black, drawn in its dungeon's colour. */
const LINE = 0.85;
/** How thin a black is a line: an opening is black this far all round (a 5 by 5 square of it, at 2). */
const THICK = 2;

/** `c` (0xRRGGBB) at lightness `l` (0 to 1, HSL), or at `scale` times its own (`l` undefined). */
function atLightness(c: number, l: number | undefined, scale = 1): number {
  const [r, g, b] = [(c >> 16) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const own = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * own - 1));
  let hue = 0;
  if (d !== 0) hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const L = l ?? own * scale;
  const chroma = (1 - Math.abs(2 * L - 1)) * sat;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [r1, g1, b1] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][Math.floor(hue) % 6];
  const m = L - chroma / 2;
  const to = (v: number): number => Math.round(Math.min(1, Math.max(0, v + m)) * 255);
  return (to(r1) << 16) | (to(g1) << 8) | to(b1);
}

/** A picture's EGA colours (0-15), clear pixels -1. */
function colours(v: Picture): Int8Array {
  const out = new Int8Array(v.width * v.height);
  for (let y = 0; y < v.height; y++)
    for (let x = 0; x < v.width; x++) {
      if (v.mask && v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) out[y * v.width + x] = -1;
      else {
        const b = v.pixels[y * v.stride + (x >> 1)];
        out[y * v.width + x] = x & 1 ? b & 15 : b >> 4;
      }
    }
  return out;
}

/** Which of a picture's black pixels are thick (an opening): within THICK of a square of black THICK all round. */
function thickBlack(e: Int8Array, w: number, h: number): Uint8Array {
  const black = (x: number, y: number): boolean => x < 0 || y < 0 || x >= w || y >= h || e[y * w + x] === 0;
  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let all = true;
      for (let dy = -THICK; dy <= THICK && all; dy++) for (let dx = -THICK; dx <= THICK && all; dx++) all = black(x + dx, y + dy);
      core[y * w + x] = all ? 1 : 0;
    }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (e[y * w + x] !== 0) continue;
      for (let dy = -THICK; dy <= THICK && !out[y * w + x]; dy++)
        for (let dx = -THICK; dx <= THICK; dx++) {
          const [cx, cy] = [x + dx, y + dy];
          if (cx >= 0 && cy >= 0 && cx < w && cy < h && core[cy * w + cx]) {
            out[y * w + x] = 1;
            break;
          }
        }
    }
  return out;
}

/** The sheet: every piece of `files` (each .16 expanded, by its name less the extension); the walls dark in light lines. */
export function x68kSheet(files: Record<PieceFile, Uint8Array>): Image {
  const out = newImage(SKIN_SHEET_W, SKIN_SHEET_H);
  const words = new Uint32Array(out.data.buffer);
  // Each dungeon's lines in the colour its walls use most, made light.
  const line = new Map<PieceFile, number>();
  for (const f of ['DNG1', 'DNG2', 'DNG3'] as const) {
    const n = new Array<number>(16).fill(0);
    for (const p of PIECES) if (p.file === f) for (const e of colours(picture(files[f], p.i)!)) if (e > 0) n[e]++;
    line.set(f, atLightness(EGA_PALETTE[n.indexOf(Math.max(...n))], LINE));
  }
  for (const p of PIECES) {
    const v = picture(files[p.file], p.i);
    if (!v || v.width !== p.w || v.height !== p.h) throw new Error(`${p.file}.16 ${p.i} is not ${p.w} by ${p.h}`);
    const e = colours(v);
    const wall = line.get(p.file);
    const thick = wall === undefined ? null : thickBlack(e, p.w, p.h);
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const k = y * p.w + x;
        if (e[k] < 0) continue;
        let c = EGA_PALETTE[e[k]];
        if (wall !== undefined) c = e[k] === 0 ? (thick![k] ? 0 : wall) : atLightness(c, undefined, FACE);
        words[(p.y + y) * SKIN_SHEET_W + p.x + x] = rgba(c);
      }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [set, dir] = process.argv.slice(2);
  if (set !== 'x68k' || !dir) {
    console.error('usage: npm run recolour-dungeon -- x68k <the Ultima V folder>');
    process.exit(1);
  }
  const names = [...new Set(PIECES.map((p) => p.file))];
  const files = Object.fromEntries(names.map((n) => [n, lzwDecompress(new Uint8Array(readFileSync(`${dir}/${n}.16`)))]));
  const out = new URL('../../public/graphics/x68k-u5-dungeon.png', import.meta.url);
  writeFileSync(out, encodePng(x68kSheet(files as Record<PieceFile, Uint8Array>)));
  console.log(`${out.pathname}: ${PIECES.length} pieces, the walls dark in light lines`);
}
