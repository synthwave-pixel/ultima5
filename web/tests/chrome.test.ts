import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EGA_RGBA, Framebuffer, HI, HI_HEIGHT, HI_WIDTH } from '../src/ui/framebuffer';
import { finerFont } from '../src/ui/loadArt';
import { decodePng } from '../tools/png';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];

/** The picture as the canvas is given it. */
function shown(fb: Framebuffer): Uint32Array {
  const image = { data: new Uint8ClampedArray(HI_WIDTH * HI_HEIGHT * 4), width: HI_WIDTH, height: HI_HEIGHT } as ImageData;
  fb.present(image);
  return new Uint32Array(image.data.buffer);
}

/** How bright a colour is (the canvas's little-endian RGBA). */
const bright = (v: number): number => (v & 0xff) + ((v >>> 8) & 0xff) + ((v >>> 16) & 0xff);

/** A bar of the frame's blue across the top, eight EGA rows deep, the white line of its rim under it. */
function barred(): Framebuffer {
  const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
  fb.chrome = true;
  fb.fill(0, 0, 319, 199, 0);
  fb.fill(0, 0, 319, 7, 1);
  fb.fill(0, 8, 319, 8, 15);
  return fb;
}

/**
 * The Standard frame, cut at the screen's own size as the ultima3 port's Standard frame is: bevelled by how far a
 * pixel lies from an edge, and its slants followed rather than stepped in EGA blocks.
 */
describe('the Standard frame', () => {
  it('shows none of the EGA blue it is made from', () => {
    const out = shown(barred());
    for (let i = 0; i < 40 * HI_WIDTH; i++) expect(out[i]).not.toBe(EGA_RGBA[1]);
  });

  it('is lit along its top edge, shaded along its foot, and plain copper between', () => {
    const out = shown(barred());
    const at = (y: number): number => out[y * HI_WIDTH + 640];
    const base = at(16); // eight pixels and more from either edge
    expect(bright(at(3))).toBeGreaterThan(bright(base)); // the ridge of light
    expect(bright(at(31))).toBeLessThan(bright(base)); // the foot of the bevel, darkest at the edge
    expect(bright(at(31))).toBeLessThan(bright(at(26)));
    expect(at(33)).not.toBe(EGA_RGBA[15]); // the white line under it is the rim, not white
    expect(bright(at(33))).toBeLessThan(bright(base));
  });

  it('follows a slanted end a pixel at a time, where the EGA steps it four', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    // A wedge: each EGA row one pixel shorter than the last.
    for (let y = 0; y < 16; y++) fb.fill(0, y, 40 - y, y, 1);
    const out = shown(fb);
    const end = (y: number): number => {
      let x = 0;
      while (x < HI_WIDTH && bright(out[y * HI_WIDTH + x]) > 0) x++;
      return x;
    };
    // Within one EGA row's four screen rows the edge moves, rather than standing still for all four.
    const ends = new Set([0, 1, 2, 3].map((r) => end(8 * HI + r)));
    expect(ends.size).toBeGreaterThan(1);
  });

  it('is cut again when the frame changes, and not otherwise', () => {
    const fb = barred();
    const first = shown(fb).slice();
    expect(shown(fb)).toEqual(first);
    fb.fill(100, 20, 120, 40, 1); // a menu's border appears
    const second = shown(fb);
    expect(second[30 * HI * HI_WIDTH + 110 * HI]).not.toBe(first[30 * HI * HI_WIDTH + 110 * HI]);
  });
});

describe('the Standard lettering', () => {
  it('is drawn at the screen grain: each glyph doubled, its solid parts kept, its slants filled in', () => {
    const solid = new Uint8Array(256).fill(1);
    const line = new Uint8Array(256);
    for (let k = 0; k < 16; k++) line[k * 16 + k] = 1; // a one-pixel diagonal
    const out = finerFont(new Uint8Array([...solid, ...line]), 2);
    expect(out.length).toBe(2 * 1024);
    // A solid block stays solid but for its four outer corners, which EPX rounds off as it does a letter's.
    const gaps = [...out.subarray(0, 1024).keys()].filter((k) => out[k] === 0);
    expect(gaps).toEqual([0, 31, 31 * 32, 32 * 32 - 1]);
    const at = (x: number, y: number): number => out[1024 + y * 32 + x];
    // Beside the diagonal the corner between two of its steps is filled, so it reads as a slope: the lower left
    // quarter of the empty pixel (5, 4), between the line's (4, 4) and (5, 5).
    expect(at(2 * 5, 2 * 4 + 1)).toBe(1);
    expect(at(2 * 5 + 1, 2 * 4)).toBe(0); // and its upper right, away from the line, stays empty
  });

  const sheet = decodePng(readFileSync(new URL('../public/graphics/standard-font.png', import.meta.url)));
  const glyph = (ch: string): string[] =>
    Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) =>
        sheet.data[(y * sheet.width + (ch.charCodeAt(0) - 0x20) * 16 + x) * 4 + 3] > 127 ? '#' : '.',
      ).join(''),
    );

  it('gives m, w, M and W three stems, as n and u have two, with room between them', () => {
    for (const ch of ['m', 'w', 'M', 'W']) expect(glyph(ch)[8], ch).toBe('..###..###..###.');
  });

  it('keeps g and q from reading as a 9, and i from reading as a colon', () => {
    expect(glyph('g')[12]).not.toBe(glyph('9')[12]); // g's tail hooks back up on the left
    expect(glyph('g')[12].slice(2, 5)).toBe('###');
    expect(glyph('q')[14].slice(9, 15)).toBe('######'); // q's tail has its foot to the right
    const i = glyph('i');
    expect(i[2]).toContain('####'); // the dot above the letters' height
    expect(i[4]).not.toContain('#');
    expect(i[5]).toContain('####');
  });
});

describe("the Standard frame's caps", () => {
  it('cuts a cap as the wedge it is, its slope straight where the font steps it two pixels a row', () => {
    // The font's cap before a title (IBM.CH 2): a wedge pointing right, two pixels longer each row to the middle.
    const rows = new Uint8Array(128 * 8);
    rows.set([0x80, 0xe0, 0xf8, 0xfc, 0xfc, 0xf8, 0xe0, 0x80], 2 * 8);
    const fb = new Framebuffer(new Uint8Array(512 * 128), [{ rows }, { rows: new Uint8Array(128 * 8) }]);
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    fb.fill(0, 0, 39, 7, 1); // the top border up to it
    // As the screen draws a cap (screen.ts cap): the glyph in the border's blue, white along its slopes.
    fb.glyph(0, 2, 5, 0, 1, 0);
    fb.line(40, 0, 45, 3, 15);
    fb.line(45, 4, 40, 7, 15);
    const out = shown(fb);
    // Along the upper slope each row of the colour page ends a little further on, right up to the point: a straight
    // edge to a sharp tip, where the EGA's doubling stepped it and rounded the point off (rows ending alike near it).
    const end = (y: number): number => {
      let x = 40 * HI;
      while (x < 48 * HI && bright(out[y * HI_WIDTH + x]) > 0) x++;
      return x;
    };
    for (let y = 0; y < 15; y++) expect(end(y + 1), `row ${y + 1}`).toBeGreaterThan(end(y));
  });
});

describe("the Standard frame's caps, drawn from the bar", () => {
  /** A cap before a title at text cell 5 of the top row (IBM.CH 2, as screen.ts cap draws it), the bar up to it or not. */
  const capped = (bar: boolean, piece?: Uint32Array): Uint32Array => {
    const rows = new Uint8Array(128 * 8);
    rows.set([0x80, 0xe0, 0xf8, 0xfc, 0xfc, 0xf8, 0xe0, 0x80], 2 * 8);
    const fb = new Framebuffer(new Uint8Array(512 * 128), [{ rows }, { rows: new Uint8Array(128 * 8) }]);
    if (piece) {
      const ega = fb.art;
      fb.art = Object.assign(Object.create(Object.getPrototypeOf(ega) as object) as typeof ega, ega, {
        capPiece: (side: number) => (side === 2 ? piece : null),
      });
    }
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    if (bar) {
      fb.fill(0, 0, 39, 6, 1);
      fb.fill(0, 7, 39, 7, 15);
    }
    fb.glyph(0, 2, 5, 0, 1, 0);
    fb.line(40, 0, 45, 3, 15);
    fb.line(45, 4, 40, 7, 15);
    return shown(fb);
  };

  it('runs the bar on into its point: no seam where the bar meets it, the bar lit and shaded alike to the end', () => {
    const out = capped(true);
    for (let y = 4; y < 24; y++) {
      const at = (x: number): number => out[y * HI_WIDTH + x];
      expect(at(40 * HI - 1) >>> 0, `row ${y}: the bar's end as its middle`).toBe(at(20 * HI) >>> 0);
      expect(Math.abs(bright(at(40 * HI)) - bright(at(40 * HI - 1))), `row ${y}: into the cap`).toBeLessThan(30);
    }
    // And on to a point in the middle of the cell's far side, its slopes smooth (shades between, not steps).
    expect(bright(out[14 * HI_WIDTH + 48 * HI - 3])).toBeGreaterThan(0);
    expect(bright(out[2 * HI_WIDTH + 48 * HI - 3])).toBe(0);
    const edge = new Set(Array.from({ length: 32 }, (_, x) => bright(out[6 * HI_WIDTH + 40 * HI + x])));
    expect(edge.size).toBeGreaterThan(8);
  });

  it("is the art's piece (the ultima3 port's) where no bar runs into it", () => {
    const piece = new Uint32Array(32 * 32).fill(0xff123456);
    const out = capped(false, piece);
    for (const [x, y] of [
      [40 * HI, 0],
      [48 * HI - 1, 16],
      [44 * HI, 31],
    ])
      expect(out[y * HI_WIDTH + x] >>> 0, `${x},${y}`).toBe(0xff123456);
  });
});

describe("the dungeon's view grown to the map's square", () => {
  it('weighs each pixel by what it covers, its light kept: a blend where it straddles two, where the nearest took one', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    // On page 1, 160 by 165 EGA pixels of stripes one EGA pixel wide (four of the colour page's), white and black.
    fb.page = 1;
    for (let x = 0; x < 160; x += 2) fb.fill(0x10 + x, 0xe, 0x10 + x, 0xb2, 15);
    fb.page = 0;
    fb.transferScaled(1, 0, [0x10, 0xe, 0xaf, 0xb2], [8, 8, 0xb0, 0xb0]);
    const row = Array.from({ length: 0xb0 * HI }, (_, x) => bright(fb.hi[0][(8 * HI + 100) * HI_WIDTH + 8 * HI + x]));
    // Where a pixel straddles a white stripe and a black, it is their blend; and the view is as light as it was.
    expect(row.some((v) => v > 0 && v < 3 * 255)).toBe(true);
    const mean = row.reduce((a, b) => a + b, 0) / row.length;
    expect(Math.abs(mean - (3 * 255) / 2)).toBeLessThan(3);
  });
});

describe('the Standard frame where 1988 left it apart', () => {
  it("joins a bar that comes down on another across 1988's one black row between them: one corner, not a flat end", () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    // The party panel's right-hand bar down to row 63, a row of black, and the bar across beneath it (rows 65-70).
    fb.fill(313, 0, 319, 63, 1);
    fb.fill(312, 0, 312, 64, 15);
    fb.fill(200, 64, 312, 64, 15);
    fb.fill(200, 65, 319, 70, 1);
    fb.fill(200, 71, 319, 71, 15);
    const out = shown(fb);
    // The row between is copper as the bars are, not the black (or the rim) of a gap.
    for (const x of [314, 316, 318]) expect(bright(out[(64 * HI + 2) * HI_WIDTH + x * HI + 2]), `x ${x}`).toBeGreaterThan(100);
  });

  it('meets a bar that comes out of another square, as 1988 draws it: a mitre, not the bar capped against the other', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    // The party panel's left-hand bar, top to foot, and the bar under the food and gold coming out of it (rows 65-70).
    fb.fill(185, 0, 190, 199, 1);
    fb.fill(184, 0, 184, 199, 15);
    fb.fill(191, 0, 191, 64, 15);
    fb.fill(191, 64, 319, 64, 15);
    fb.fill(191, 65, 319, 70, 1);
    fb.fill(191, 71, 319, 71, 15);
    fb.fill(191, 71, 191, 199, 15);
    const out = shown(fb);
    const at = (x: number, y: number): number => out[y * HI_WIDTH + x];
    // The inside corner's white pixel is all rim, as the rim along the bar is: none of the copper rounded into it.
    const rim = at(250 * HI, 64 * HI + 3);
    for (let r = 0; r < HI; r++) for (let c = 0; c < HI; c++) expect(at(191 * HI + c, 64 * HI + r), `${c}, ${r}`).toBe(rim);
    // The lit top edge of the bar runs right up to the other: as bright beside it as along it.
    expect(bright(at(192 * HI, 65 * HI + 1))).toBeGreaterThanOrEqual(bright(at(250 * HI, 65 * HI + 1)) - 30);
  });

  it('draws a cap beside a bar that runs on past it (the log prompt) as an arrow on the bar, not as its end', () => {
    const rows = new Uint8Array(128 * 8);
    rows.set([0x80, 0xe0, 0xf8, 0xfc, 0xfc, 0xf8, 0xe0, 0x80], 2 * 8);
    const fb = new Framebuffer(new Uint8Array(512 * 128), [{ rows }, { rows: new Uint8Array(128 * 8) }]);
    fb.chrome = true;
    fb.fill(0, 0, 319, 199, 0);
    // The bar between the map and the log, down the screen (x 185-190, its white rim either side), the prompt beside it.
    fb.fill(185, 0, 190, 199, 1);
    fb.fill(184, 0, 184, 199, 15);
    fb.fill(191, 0, 191, 199, 15);
    fb.glyph(0, 2, 24, 19, 1, 0);
    const out = shown(fb);
    const at = (x: number, y: number): number => bright(out[y * HI_WIDTH + x]);
    const [cellX, cellY] = [24 * 8 * HI, 19 * 8 * HI];
    // An arrow in the middle of the cell, not a wedge the bar's whole height: its point short of the cell's far side,
    // nothing at the cell's top or bottom.
    expect(at(cellX + 4, cellY + 16)).toBeGreaterThan(0);
    expect(at(cellX + 30, cellY + 16)).toBe(0);
    expect(at(cellX + 4, cellY + 1)).toBe(0);
    expect(at(cellX + 4, cellY + 30)).toBe(0);
    // Lit along its upper slope, shaded along its lower.
    expect(at(cellX + 8, cellY + 11)).toBeGreaterThan(at(cellX + 8, cellY + 21));
    // And the bar beside it straight: the same across its edge above, beside and below the arrow.
    for (const dy of [-12, 16, 44])
      expect(out[(cellY + dy) * HI_WIDTH + cellX - 2] >>> 0, `dy ${dy}`).toBe(out[(cellY - 40) * HI_WIDTH + cellX - 2] >>> 0);
  });
});
