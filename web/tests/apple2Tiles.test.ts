import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLACK, GREEN, ORANGE, row, sheet as makeSheet, tile, TILE_H, TILE_W, VIOLET, BLUE, WHITE } from '../tools/art/apple2.ts';
import { decodePng } from '../tools/png';
import { APPLE_H, APPLE_W, appleArt, fromSheet } from '../src/ui/appleArt.ts';
import { HI_WIDTH } from '../src/ui/framebuffer.ts';
import { CELL } from '../src/ui/standardArt.ts';

/** Ultima V's Apple II tiles (tools/art/apple2.ts, appleArt.ts): read off the Apple disk, shipped as a sheet. */
describe('the Apple II tiles read off the disk', () => {
  it('draw a hi-res row as the screen showed it: a pixel alone in its colour, two side by side white', () => {
    // Low bit leftmost; the high bit the byte's colours. Drawn from an odd screen byte, an even column is green.
    expect(row(0b0000001, 0)[0]).toBe(GREEN);
    expect(row(0b0000010, 0)[1]).toBe(VIOLET);
    expect(row(0x81, 0)[0]).toBe(ORANGE);
    expect(row(0x82, 0)[1]).toBe(BLUE);
    expect(row(0b0000011, 0).slice(0, 3)).toEqual([WHITE, WHITE, BLACK]);
    // The gap in a run of alternate pixels takes their colour; the second byte is columns seven to thirteen.
    expect(row(0b0000101, 0).slice(0, 4)).toEqual([GREEN, GREEN, GREEN, BLACK]);
    expect(row(0, 0b0000001)[7]).toBe(VIOLET);
  });

  it('find each tile’s bytes in its bank of 256, a column’s sixteen rows before the next column’s', () => {
    const shapes = new Uint8Array(512 * 32);
    // Tile 0x105 (the second bank, its fifth), row 3: its left byte, then its right.
    shapes[8192 + 3 * 256 + 5] = 0b0000001;
    shapes[8192 + (16 + 3) * 256 + 5] = 0b1000000;
    const t = tile(shapes, 0x105);
    expect(t[3][0]).toBe(GREEN);
    expect(t[3][13]).toBe(VIOLET);
    expect(t[2].every((c) => c === BLACK)).toBe(true);
    expect(tile(shapes, 0x005)[3].every((c) => c === BLACK)).toBe(true);
  });
});

describe('the Apple ][ sheet', () => {
  const png = decodePng(readFileSync(new URL('../public/graphics/apple2-u5-tiles.png', import.meta.url)));
  const sheet = new Uint32Array(png.data.buffer.slice(0));
  // The Apple II's six colours (RGBA in memory order: 0xAABBGGRR).
  const SIX = new Set([0xff000000, 0xffffffff, 0xfffdcf15, 0xff3c6aff, 0xff3cf514, 0xfffd44ff]);

  it('holds the 512 tiles, fourteen pixels by sixteen, 32 to a row, in the Apple’s six colours', () => {
    expect([TILE_W, TILE_H]).toEqual([APPLE_W, APPLE_H]);
    expect([png.width, png.height]).toEqual([32 * APPLE_W, 16 * APPLE_H]);
    expect(sheet.every((v) => SIX.has(v))).toBe(true);
    // Every tile has something drawn in it but the first, the Apple's black square.
    const empty: number[] = [];
    for (let t = 0; t < 512; t++) if (!fromSheet(sheet, png.width, t).some((v) => (v & 0xffffff) !== 0)) empty.push(t);
    expect(empty.length).toBeLessThan(8);
  });

  it('is the tool’s own drawing of whatever SHAPES it is given', () => {
    const blank = makeSheet(new Uint8Array(512 * 32));
    expect([blank.width, blank.height]).toEqual([png.width, png.height]);
    expect(() => makeSheet(new Uint8Array(100))).toThrow();
  });

  it('makes every tile of the set from the sheet, in the Apple’s colours, each whole on black', () => {
    const art = appleArt(new Uint8Array(0), sheet, png.width, null);
    const page = new Uint32Array(HI_WIDTH * CELL);
    const off: number[] = [];
    for (let t = 0; t < 512; t++) {
      art.draw(page, t, 0, 0);
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (!SIX.has(page[y * HI_WIDTH + x])) off.push(t);
    }
    expect([...new Set(off)]).toEqual([]);
    // A figure on a black square, not on the ground given it; its figure clear round it, for a scene to stand it in.
    art.draw(page, 0x150, 0, 0, 0x05);
    expect(page[0]).toBe(0xff000000);
    expect(art.figure(0x150)[0] >>> 24).toBe(0);
    // The land is not clear: grass is drawn whole.
    expect(art.figure(0x05).every((v) => v >>> 24 === 0xff)).toBe(true);
  });

  it('spreads a tile’s fourteen pixels over the cell’s width, each over four or five of it', () => {
    const one = new Uint32Array(png.width * png.height);
    one[3] = 0xffffffff; // tile 0, column 3, the top row
    const cell = fromSheet(one, png.width, 0);
    const lit = [...cell.subarray(0, CELL)].map((v, x) => (v === 0xffffffff ? x : -1)).filter((x) => x >= 0);
    expect(lit.length).toBeGreaterThanOrEqual(4);
    expect(lit.length).toBeLessThanOrEqual(5);
    expect(lit[0]).toBe(Math.ceil((3 * CELL) / APPLE_W));
  });
});
