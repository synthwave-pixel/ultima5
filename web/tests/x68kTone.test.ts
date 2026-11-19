import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../tools/png.ts';
import { cellOf, rgba, sheetArt, X68K_SHEET } from '../src/ui/sheetArt.ts';
import { toned } from '../src/ui/sheetTone.ts';
import { skinFromSheet, SKIN_SPECS, X68K_PALETTE, X68K_SOFT, X68K_TONE } from '../src/ui/skins.ts';

const graphic = (name: string) => decodePng(readFileSync(new URL(`../public/graphics/${name}`, import.meta.url)));
const words = (png: ReturnType<typeof decodePng>): Uint32Array =>
  new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));
const CLEAR = 0;

/**
 * The Sharp X68k set softened (sheetTone.ts): its eight colours, full on and full off as the X68000's text palette
 * has them, shown as gentler ones, each pixel kept crisp - none blended with its neighbours. (The blend itself is
 * tested here with a tone that asks for it.) The sheets stay the disk's own; the tone is laid on as each tile is drawn.
 */
describe('the Sharp X68k tone', () => {
  it('shows each of the eight colours as its softer one', () => {
    const px = Uint32Array.from(X68K_PALETTE, rgba);
    expect(Array.from(toned(px, 8, 1, { ...X68K_TONE, blend: false }))).toEqual(X68K_SOFT.map(rgba));
  });

  it('blends a pixel half its own, a quarter each neighbour across, never with what is clear', () => {
    const [a, b] = [rgba(0x000000), rgba(0xffffff)];
    const out = toned(Uint32Array.from([a, b, a, CLEAR, b]), 5, 1, { colours: new Map(), blend: true });
    const grey = (v: number): number => v & 0xff;
    expect(grey(out[0])).toBe(64); // its left edge as its own: (0 * 3 + 255) / 4
    expect(grey(out[1])).toBe(128); // (0 + 255 * 2 + 0) / 4
    expect(grey(out[2])).toBe(64); // beside the clear: (255 + 0 * 3) / 4
    expect(out[3]).toBe(CLEAR);
    expect(out[4]).toBe(b); // alone beside the clear: itself
  });

  it('blends a tile drawn larger as it would the tile itself, then drawn larger', () => {
    const [a, b] = [rgba(0x000000), rgba(0xffffff)];
    const small = Uint32Array.from([a, b, b, a]);
    const big = Uint32Array.from([a, a, b, b, b, b, a, a]);
    const once = toned(small, 4, 1, { colours: new Map(), blend: true });
    expect(Array.from(toned(big, 8, 1, { colours: new Map(), blend: true }, 2))).toEqual(Array.from(once).flatMap((v) => [v, v]));
  });

  it('blends nothing: its tone only shows each colour as its softer one', () => {
    expect(X68K_TONE.blend).toBe(false);
  });

  it("draws the set's squares crisp: each pixel its soft colour, none blended", () => {
    const png = graphic('x68k-u5-tiles.png');
    const art = sheetArt(X68K_SHEET, new Uint8Array(512 * 128), words(png), png.width, null);
    // The eight soft colours, and black where a figure's ground shows through: a blend would make colours between.
    const soft = new Set([...X68K_SOFT.map(rgba), rgba(0x000000)]);
    for (const tile of [5, 6, 8, 48, 0x100, 0x101]) {
      const sq = art.square(tile)!;
      expect(
        sq.every((v) => v >>> 24 === 0 || soft.has(v)),
        `tile ${tile}`,
      ).toBe(true);
    }
    const grass = art.square(5)!;
    const own = cellOf(X68K_SHEET, words(png), png.width, 5);
    const asSoft = new Map(X68K_PALETTE.map((c, k) => [rgba(c), rgba(X68K_SOFT[k])]));
    expect(Array.from(grass)).toEqual(Array.from(own, (v) => (v >>> 24 === 0 ? v : (asSoft.get(v) ?? v))));
  });

  it('softens its dungeon, its lines and its sign as its tiles, crisp, and keeps its blue frame', () => {
    const png = graphic('x68k-u5-dungeon.png');
    const spec = SKIN_SPECS.x68k!;
    const skin = skinFromSheet('x68k', words(png), png.width, spec.colours, spec.tone);
    const wall = skin.piece('DNG1', 0)!;
    const harsh = new Set(X68K_PALETTE.map(rgba));
    expect(wall.px.some((v) => v >>> 24 !== 0 && harsh.has(v))).toBe(false);
    const soft = new Set(X68K_SOFT.map(rgba));
    // Each lit pixel one of the soft eight: none blended between them.
    expect(wall.px.every((v) => v >>> 24 === 0 || soft.has(v))).toBe(true);
    for (const v of spec.colours.ink) expect(soft.has(v)).toBe(true);
    for (const c of [spec.colours.sign.edge, spec.colours.sign.ink]) expect(X68K_SOFT).toContain(c);
    expect(spec.colours.frame).toEqual({ blue: 0x0000ff, white: 0xffffff });
  });
});
