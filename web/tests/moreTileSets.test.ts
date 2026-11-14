import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tile as c64Tile, C64 } from '../tools/art/c64.ts';
import { sheet as x68kSheet } from '../tools/art/x68k.ts';
import { monoTile } from '../tools/art/apple2.ts';
import { decodePng, newImage } from '../tools/png.ts';
import { APPLE_H, APPLE_W, appleMono, GREEN_SCREEN, WHITE_SCREEN } from '../src/ui/appleArt.ts';
import { C64_SHEET, cellOf, FLICKERS, pixels, sheetArt, X68K_SHEET, type SheetSpec } from '../src/ui/sheetArt.ts';
import { CELL } from '../src/ui/standardArt.ts';
import { lzwDecompress } from '../src/data/lzw.ts';
import { TileAnimator } from '../src/ui/animate.ts';
import { CGA_SHEET } from '../src/ui/sheetArt.ts';
import { CGA_COLOURS, cgaPixel, sheet as cgaSheet } from '../tools/art/cga.ts';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import { gameFiles } from './helpers.ts';

const graphic = (name: string) => decodePng(readFileSync(new URL(`../public/graphics/${name}`, import.meta.url)));
const words = (png: ReturnType<typeof decodePng>): Uint32Array =>
  new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));
const rgb = (v: number): number => ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);

/**
 * The other computers' own tiles (tools/art/apple2.ts, c64.ts, x68k.ts; sheetArt.ts): the Apple's on a monochrome monitor,
 * the C64's and the Sharp X68000's, each the PC's 512 in the PC's order (checked by eye, tile by tile, on tiles.html's
 * Every set, side by side).
 */
describe('the Apple //e, Apple //c, Sharp X68k and C64 sets', () => {
  it('ship as sheets of 512 tiles, 32 to a row, each the size its computer drew it', () => {
    const sizes: [string, number, number][] = [
      ['apple2-u5-mono.png', APPLE_W, APPLE_H],
      ['c64-u5-tiles.png', 16, 16],
      ['x68k-u5-tiles.png', 32, 32],
    ];
    for (const [name, w, h] of sizes) {
      const png = graphic(name);
      expect([png.width, png.height], name).toEqual([32 * w, 16 * h]);
    }
  });

  it("light on the Apple's monochrome monitor exactly the bits its colour sheet draws", () => {
    // Every lit bit is coloured in the colour sheet; a dark one may be too (a colour fills the gap between two lit).
    const mono = graphic('apple2-u5-mono.png');
    const colour = graphic('apple2-u5-tiles.png');
    let lit = 0;
    for (let i = 0; i < mono.width * mono.height; i++) {
      if (!mono.data[i * 4]) continue;
      lit++;
      expect(colour.data[i * 4] | colour.data[i * 4 + 1] | colour.data[i * 4 + 2]).not.toBe(0);
    }
    expect(lit).toBeGreaterThan(10000);
    // A tile's row: the low bit of each byte its leftmost pixel, seven to a byte, the high bit no pixel.
    const shapes = new Uint8Array(512 * 32);
    shapes[0] = 0b10000101; // tile 0, row 0, first byte
    shapes[16 * 256] = 0b00000001; // tile 0, row 0, second byte
    expect(monoTile(shapes, 0)[0]).toEqual([1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("read the C64's tiles as four cells of eight rows, top left first, each lit in its colour byte's high nibble", () => {
    const shapes = new Uint8Array(512 * 32);
    const colors = new Uint8Array(512 * 4);
    // Tile 0: each cell's first row lit at its left pixel; the cells coloured white on black, red on blue, ...
    for (let cell = 0; cell < 4; cell++) shapes[cell * 8] = 0x80;
    colors.set([0x10, 0x26, 0x53, 0x7e]);
    const rows = c64Tile(shapes, colors, 0);
    expect([rows[0][0], rows[0][8], rows[8][0], rows[8][8]]).toEqual([C64[1], C64[2], C64[5], C64[7]]);
    expect([rows[0][1], rows[0][9], rows[8][1], rows[8][9]]).toEqual([C64[0], C64[6], C64[3], C64[14]]);
  });

  it("lay the X68000's two images end to end, its figures' grey ground clear and nothing else", () => {
    const world = newImage(512, 512);
    const npc = newImage(512, 512);
    for (const img of [world, npc]) for (let i = 0; i < 512 * 512; i++) img.data.set([128, 128, 128, 255], i * 4);
    const out = x68kSheet(world, npc);
    expect([out.width, out.height]).toEqual([1024, 512]);
    // Tile 0 (the world's): grey kept. Tile 256 (the first NPC): its grey clear. Tile 17 is the world's second row's first.
    expect(Array.from(out.data.subarray(0, 4))).toEqual([128, 128, 128, 255]);
    const at256 = (8 * 32 * 1024 + 0) * 4;
    expect(out.data[at256 + 3]).toBe(0);
    const shipped = graphic('x68k-u5-tiles.png');
    // The shipped sheet: the land opaque, the people standing on a clear ground.
    expect(shipped.data[3]).toBe(255);
    expect(
      Array.from({ length: 32 * 32 }, (_, i) => shipped.data[((8 * 32 + Math.floor(i / 32)) * 1024 + (i % 32)) * 4 + 3]).some(
        (a) => a === 0,
      ),
    ).toBe(true);
  });

  it('flicker real fire in every torch, the Flame and the sparkles, in each set', () => {
    const apple = graphic('apple2-u5-tiles.png');
    const mono = graphic('apple2-u5-mono.png');
    const sets: [string, SheetSpec, ReturnType<typeof decodePng>][] = [
      ['C64', C64_SHEET, graphic('c64-u5-tiles.png')],
      ['X68k', X68K_SHEET, graphic('x68k-u5-tiles.png')],
      ['Apple //e', appleMono(GREEN_SCREEN, words(apple), apple.width), mono],
    ];
    for (const [name, spec, png] of sets)
      for (const t of FLICKERS) {
        const fire = spec.fire(t, pixels(spec, words(png), png.width, t));
        expect(
          fire?.some((f) => f === 1),
          `${name} 0x${t.toString(16)}`,
        ).toBe(true);
      }
  });

  it('draw the Apple //e green and the //c white, the X68k figures on the ground and the C64 whole on black', () => {
    const apple = graphic('apple2-u5-tiles.png');
    const mono = graphic('apple2-u5-mono.png');
    const colours = (spec: SheetSpec): Set<number> => {
      const cell = cellOf(spec, words(mono), mono.width, 0x150);
      return new Set(Array.from(cell, (v) => (v >>> 24 === 0 ? -1 : rgb(v))));
    };
    expect([...colours(appleMono(GREEN_SCREEN, words(apple), apple.width))].filter((c) => c > 0)).toEqual([GREEN_SCREEN]);
    expect([...colours(appleMono(WHITE_SCREEN, words(apple), apple.width))].filter((c) => c > 0)).toEqual([WHITE_SCREEN]);
    const tiles = new Uint8Array(512 * 128);
    const x68k = graphic('x68k-u5-tiles.png');
    const c64 = graphic('c64-u5-tiles.png');
    expect(sheetArt(X68K_SHEET, tiles, words(x68k), x68k.width, null).squares).toBe(false);
    expect(sheetArt(C64_SHEET, tiles, words(c64), c64.width, null).squares).toBe(true);
    // A figure's ground clear in both: the X68k's its sheet's own, the C64's the black joined to its edge.
    for (const [spec, png] of [
      [X68K_SHEET, x68k],
      [C64_SHEET, c64],
    ] as const)
      expect(cellOf(spec, words(png), png.width, 0x150).some((v) => v >>> 24 === 0)).toBe(true);
    expect(CELL).toBe(64);
  });

  it("draw the X68k's land each square from its own tile, nothing of the Modern look's painted over it", () => {
    const x68k = graphic('x68k-u5-tiles.png');
    const art = sheetArt(X68K_SHEET, new Uint8Array(512 * 128), words(x68k), x68k.width, null);
    // Roads crossing the grass, hills and a mountain, the brush and the woods, the sea's shore and the swamp: the
    // squares the map's painters (wear.ts, ranges.ts, woods.ts, shore.ts, soils.ts) draw over in the Modern look.
    // prettier-ignore
    const around = Uint8Array.from([
      0x05, 0x05, 0x22, 0x05, 0x01,
      0x0a, 0x0c, 0x22, 0x06, 0x01,
      0x20, 0x20, 0x25, 0x20, 0x34,
      0x0c, 0x08, 0x22, 0x03, 0x02,
      0x05, 0x05, 0x22, 0x03, 0x02,
    ]);
    for (let k = 0; k < 25; k++) {
      const t = around[k];
      // The square at `k` as the map has it round it, and drawn alone.
      const shifted = new Uint8Array(25).fill(t);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const [x, y] = [(k % 5) + dx, Math.floor(k / 5) + dy];
          if (x >= 0 && y >= 0 && x < 5 && y < 5) shifted[(dy + 2) * 5 + dx + 2] = around[y * 5 + x];
        }
      const place = { map: 0, x: 40 + (k % 5), y: 40 + Math.floor(k / 5), around: shifted };
      const alone = art.square(t)!.slice();
      expect(art.square(t, undefined, place), `0x${t.toString(16)}`).toEqual(alone);
    }
    // A figure on the road stands on the road's own tile.
    const onRoad = { map: 0, x: 42, y: 42, around };
    const figure = art.square(0x150, 0x25)!.slice();
    expect(art.square(0x150, 0x25, onRoad)).toEqual(figure);
  });
});

/**
 * The PC CGA set (cga-u5-tiles.png, tools/art/cga.ts; sheetArt.ts CGA_SHEET): the 1988 PC game's own tiles for a CGA
 * card, from its TILES.4 - the EGA's drawings in the CGA's four colours - shipped as a sheet, as the other sets are.
 */
describe('the PC CGA set', () => {
  const tiles = lzwDecompress(gameFiles().get('TILES.16'));
  const png = graphic('cga-u5-tiles.png');
  const sheet = words(png);
  const cga = (t: number): Uint32Array => pixels(CGA_SHEET, sheet, png.width, t);

  it('read TILES.4 as 512 tiles of 16 by 16, two bits a pixel, the high bits leftmost', () => {
    const bytes = new Uint8Array(512 * 64);
    bytes[0] = 0b00011011; // tile 0, row 0: black, cyan, magenta, white
    bytes[64 + 4] = 0b11000000; // tile 1, row 1: white at its left
    expect([0, 1, 2, 3].map((x) => cgaPixel(bytes, 0, x, 0))).toEqual([0, 1, 2, 3]);
    expect([cgaPixel(bytes, 1, 0, 1), cgaPixel(bytes, 1, 1, 1)]).toEqual([3, 0]);
    expect(() => cgaSheet(bytes.subarray(0, 100))).toThrow();
  });

  it("ship exactly the game's TILES.4, in the CGA's bright cyan, magenta and white on black", () => {
    const made = cgaSheet(lzwDecompress(gameFiles().get('TILES.4')));
    expect([png.width, png.height]).toEqual([512, 256]);
    expect(Buffer.from(png.data).equals(Buffer.from(made.data))).toBe(true);
    expect([...new Set(Array.from(sheet, rgb))].sort()).toEqual([...CGA_COLOURS].sort());
  });

  it('draw each tile whole on black, a figure on a clear ground, every fire flickering and every flag flapping', () => {
    expect(sheetArt(CGA_SHEET, tiles, sheet, png.width, null).squares).toBe(true);
    expect(cellOf(CGA_SHEET, sheet, png.width, 0x150).some((v) => v >>> 24 === 0)).toBe(true);
    for (const t of FLICKERS)
      expect(
        CGA_SHEET.fire(t, cga(t))?.some((f) => f === 1),
        `0x${t.toString(16)}`,
      ).toBe(true);
    // The brazier's bowl is magenta as its fire is: only the fire flickers.
    expect(CGA_SHEET.fire(0xbf, cga(0xbf))!.findIndex((f) => f === 1)).toBeGreaterThanOrEqual(7 * 16);
    // A flag's two rows differ across its pennant, so swapping them moves it.
    for (const [t, [x0, x1, y0, y1]] of CGA_SHEET.flags!) {
      const px = cga(t);
      const differ = Array.from({ length: x1 - x0 + 1 }, (_, i) => px[y0 * 16 + x0 + i] !== px[y1 * 16 + x0 + i]);
      expect(differ.some(Boolean), `0x${t.toString(16)}`).toBe(true);
    }
  });

  it('roll cyan water through the rivers, as its rivers are drawn, and magenta along the sea shore', () => {
    const copy = tiles.slice();
    const art = sheetArt(CGA_SHEET, copy, sheet, png.width, null);
    const animator = new TileAnimator(copy);
    const magenta = (t: number): number => {
      const page = new Uint32Array(HI_WIDTH * CELL).fill(0xff000000);
      art.draw(page, t, 0, 0);
      let n = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (rgb(page[y * HI_WIDTH + x]) === CGA_COLOURS[2]) n++;
      return n;
    };
    const cyan = (t: number): number => {
      const page = new Uint32Array(HI_WIDTH * CELL).fill(0xff000000);
      art.draw(page, t, 0, 0);
      let n = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (rgb(page[y * HI_WIDTH + x]) === CGA_COLOURS[1]) n++;
      return n;
    };
    const [river, shore] = [magenta(0x60), cyan(0x34)];
    for (let i = 0; i < 6; i++) {
      animator.tick();
      art.tick();
    }
    // The river's water flowing, and no magenta brought into it; the shore's sea flowing magenta, no cyan brought in.
    expect(magenta(0x60)).toBeLessThanOrEqual(river);
    expect(cyan(0x34)).toBeLessThanOrEqual(shore);
    expect(magenta(0x34)).toBeGreaterThan(0);
  });
});
