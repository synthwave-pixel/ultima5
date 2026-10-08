/**
 * picture-sheet.ts
 *
 * A sheet of the game's own pictures as the two looks draw them, for
 * looking over: each picture with the EGA colours doubled (Original, a
 * blue bar above it) beside the Standard look's (a copper bar), both at
 * the screen's size. Run:
 *
 *   npm run pictures            the usual pick
 *   npm run pictures -- STORY2.16:0 CREATE.16:1 DNG1.16:12
 *
 * It writes art/standard/pictures.png. Nothing is kept: the sheet is made
 * from the player's own files for a look, as the game makes them.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGame } from '../../tests/helpers.ts';
import { loadResource, picture, type Picture } from '../../src/data/images.ts';
import { EGA_PALETTE } from '../../src/data/tiles.ts';
import { restyle } from '../../src/ui/standardPictures.ts';
import { encodePng, newImage, type Image } from '../png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** A good spread: the introduction, the gypsy, the ending, the title, and the corridor. */
const PICK = [
  'STORY1.16:0',
  'STORY2.16:1',
  'STORY6.16:0',
  'CREATE.16:1',
  'CREATE.16:2',
  'END1.16:0',
  'END2.16:1',
  'ULTIMA.16:1',
  'ENDSC.16:0',
  'DNG1.16:12',
  'DNG3.16:12',
  'ITEMS.16:0',
];

/** The picture in its EGA colours, at twice its size (as Original draws it). */
function doubled(v: Picture): Uint32Array {
  const out = new Uint32Array(v.width * 2 * v.height * 2);
  const W = v.width * 2;
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const masked = v.mask && (v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
      const b = v.pixels[y * v.stride + (x >> 1)];
      const rgb = EGA_PALETTE[x & 1 ? b & 15 : b >> 4];
      const c = masked ? 0 : (0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16)) >>> 0;
      const o = y * 2 * W + x * 2;
      out[o] = out[o + 1] = out[o + W] = out[o + W + 1] = c;
    }
  }
  return out;
}

/** Put RGBA pixels onto the sheet at (ox, oy), over its dark ground. */
function blit(img: Image, px: Uint32Array, w: number, h: number, ox: number, oy: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = px[y * w + x];
      const o = ((oy + y) * img.width + ox + x) * 4;
      const a = v >>> 24;
      if (a === 0) continue;
      img.data[o] = (v >> 16) & 0xff;
      img.data[o + 1] = (v >> 8) & 0xff;
      img.data[o + 2] = v & 0xff;
      img.data[o + 3] = 255;
    }
  }
}

function bar(img: Image, x: number, y: number, w: number, rgb: number): void {
  for (let yy = y; yy < y + 4; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const o = (yy * img.width + xx) * 4;
      img.data[o] = (rgb >> 16) & 0xff;
      img.data[o + 1] = (rgb >> 8) & 0xff;
      img.data[o + 2] = rgb & 0xff;
      img.data[o + 3] = 255;
    }
  }
}

const picks = process.argv.slice(2).length ? process.argv.slice(2) : PICK;
const { g } = newGame();
const pairs = picks.map((spec) => {
  const [name, index] = spec.split(':');
  const res = loadResource(g.data.files, g.data.ovl, name);
  const v = picture(res, Number(index));
  if (!v) throw new Error(`no picture ${spec}`);
  return { spec, v, kind: /^(DNG|ITEMS)/.test(name) ? ('dungeon' as const) : ('scene' as const) };
});

const gap = 14;
const columns = 2;
const cellW = Math.max(...pairs.map((p) => p.v.width * 4 + gap)) + gap;
const rowHeights: number[] = [];
for (let i = 0; i < pairs.length; i += columns) {
  rowHeights.push(Math.max(...pairs.slice(i, i + columns).map((p) => p.v.height * 2)) + gap + 8);
}
const img = newImage(columns * cellW + gap, rowHeights.reduce((a, b) => a + b, 0) + gap);
for (let i = 0; i < img.data.length; i += 4) {
  img.data[i] = img.data[i + 1] = img.data[i + 2] = 0x1a;
  img.data[i + 3] = 255;
}
let y = gap;
pairs.forEach((p, k) => {
  const col = k % columns;
  if (col === 0 && k > 0) y += rowHeights[Math.floor(k / columns) - 1];
  const x = gap + col * cellW;
  const w = p.v.width * 2;
  const h = p.v.height * 2;
  bar(img, x, y, w, 0x2222cc);
  bar(img, x + w + gap, y, w, 0xb36234);
  blit(img, doubled(p.v), w, h, x, y + 8);
  // A scene is the game's own in both looks; only the corridor's are the Standard look's own.
  blit(img, p.kind === 'scene' ? doubled(p.v) : restyle(p.v, p.kind), w, h, x + w + gap, y + 8);
});
mkdirSync(join(ROOT, 'art/standard'), { recursive: true });
writeFileSync(join(ROOT, 'art/standard/pictures.png'), encodePng(img));
console.log(`${pairs.length} pictures: ${pairs.map((p) => p.spec).join(', ')}`);
