import { RUNE_RED } from '../src/ui/colours.ts';
import { describe, expect, it, vi } from 'vitest';
import { loadResource, picture, type Picture } from '../src/data/images.ts';
import { DataOvl } from '../src/data/dataOvl.ts';
import { refresh } from '../src/game/dungeon.ts';
import { EGA_RGBA, Framebuffer, HI, HI_HEIGHT, HI_WIDTH } from '../src/ui/framebuffer.ts';
import { plate } from '../src/ui/carve.ts';
import {
  PIECES,
  pieceAt,
  pieceFileOf,
  recolouredPiece,
  SKIN_SHEET_H,
  SKIN_SHEET_W,
  SkinOvers,
  SKIN_SPECS,
  portDungeon,
  signStyleFor,
  mapArtFor,
  frameFor,
  nativeSize,
  NATIVE_WALLS,
  NATIVE_ITEMS,
  signRunes,
  skinFromSheet,
  tintSheet,
  X68K_PALETTE,
  ownPiece,
  C64_PALETTE,
  APPLE_PALETTE,
  APPLE_GREEN,
  APPLE_WHITE,
  type PieceFile,
  type Skin,
} from '../src/ui/skins.ts';
import { gameFiles, newGame } from './helpers.ts';
import { existsSync, readFileSync } from 'node:fs';
import { lzwDecompress } from '../src/data/lzw.ts';
import { decodePng } from '../tools/png.ts';
import { CGA_COLOURS } from '../tools/art/cga.ts';
import { CGA_DOORS, cgaPicture, sheet as cgaDungeonSheet } from '../tools/art/cgaDungeon.ts';
import { appleRow } from '../tools/art/apple2Dungeon.ts';
import { GREEN as APPLE_GREEN_HUE, VIOLET as APPLE_VIOLET, WHITE as APPLE_LIT } from '../tools/art/apple2.ts';
import { Colour } from '../src/ui/colours.ts';
import { dimFiles, sheet as x68kDungeonSheet, X68K_SCALE, x68kDungeon } from '../tools/art/x68kDungeon.ts';
import { C64 } from '../tools/art/c64.ts';
import { C64_RECOLOURED_WALLS, c64Dungeon, sheet as c64DungeonSheet } from '../tools/art/c64Dungeon.ts';
import { APPLE_COLOURS, APPLE_RECOLOURED_WALLS, appleDungeon, sheet as appleDungeonSheet } from '../tools/art/apple2Dungeon.ts';
import { GREEN_SCREEN, WHITE_SCREEN } from '../src/ui/appleArt.ts';
import { unzipSync } from 'fflate';
import type { Tiles } from '../src/game/settings.ts';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];
const files = gameFiles();
const ovl = new DataOvl(files.get('DATA.OVL'));
const res = (name: string): Uint8Array => loadResource(files, ovl, name);
const FILES: PieceFile[] = ['DNG1', 'DNG2', 'DNG3', 'ITEMS', 'MON0', 'MON1', 'MON2', 'MON3', 'MON4', 'MON5', 'MON6', 'MON7'];

/** The colour page as shown. */
function shown(fb: Framebuffer): Uint32Array {
  const image = { data: new Uint8ClampedArray(HI_WIDTH * HI_HEIGHT * 4), width: HI_WIDTH, height: HI_HEIGHT } as ImageData;
  fb.present(image);
  return new Uint32Array(image.data.buffer).slice();
}

/**
 * Where two screens first differ, and what each has there, or null where they are the same. A whole screen compared
 * with toEqual walks a million pixels through vitest's deep equality, which took a CI runner past a minute.
 */
function firstDifference(got: Uint32Array, want: Uint32Array): string | null {
  if (got.length !== want.length) return `${got.length} pixels, not ${want.length}`;
  for (let k = 0; k < got.length; k++) {
    if (got[k] !== want[k]) {
      const x = k % HI_WIDTH;
      const y = Math.floor(k / HI_WIDTH);
      return `pixel (${x}, ${y}): ${got[k].toString(16)}, not ${want[k].toString(16)}`;
    }
  }
  return null;
}

/** An EGA picture's own pixels as a skin piece would give them: its colours, clear where its mask is. */
function asSkin(v: Picture): Uint32Array {
  const out = new Uint32Array(v.width * v.height);
  for (let y = 0; y < v.height; y++)
    for (let x = 0; x < v.width; x++) {
      if (v.mask && v.mask.bits[y * v.mask.stride + (x >> 3)] & (0x80 >> (x & 7))) continue;
      const b = v.pixels[y * v.stride + (x >> 1)];
      out[y * v.width + x] = EGA_RGBA[x & 1 ? b & 15 : b >> 4];
    }
  return out;
}

/** A skin whose every piece of a file is one flat colour (by file), opaque. */
function flatSkin(name: Skin['name'], colours: Partial<Record<PieceFile, number>>): Skin {
  const sheet = new Uint32Array(SKIN_SHEET_W * 2048);
  for (const p of PIECES) {
    const c = colours[p.file];
    if (c === undefined) continue;
    for (let y = 0; y < p.h; y++) sheet.fill(c, (p.y + y) * SKIN_SHEET_W + p.x, (p.y + y) * SKIN_SHEET_W + p.x + p.w);
  }
  return skinFromSheet(name, sheet, SKIN_SHEET_W, {
    ink: Uint32Array.from(EGA_RGBA),
    sign: { plate: 0x000000, edge: 0x204060, ink: 0xffffff },
    frame: { blue: 0x00ffff, white: 0xffffff },
  });
}

/** The party in dungeon `d` (1-8), lit, facing north in an open passage. */
function inDungeon(d: number): ReturnType<typeof newGame> {
  const game = newGame();
  const s = game.g.s;
  s.mapId = 0x20 + d;
  s.level = 0;
  s.dungeon.fill(0x00, 0, 0x40);
  [s.x, s.y, s.facing] = [4, 4, 0];
  s.d58a6 = 100;
  s.dungeonLook = d === 1 || d === 4 || d === 5 ? 3 : d === 6 || d === 7 ? 2 : 1;
  return game;
}

/**
 * The machine skins (docs/superpowers/plans/2026-11-13-machine-skins.md): a set's own dungeon pieces, laid out on the
 * PC's own list of them, drawn over the PC piece's place; and its ink for the corridor's lines and its sign's plate.
 */
describe('machine skins', () => {
  it("lay out every PC dungeon piece at its own size, apart, within the sheet's width", () => {
    for (const f of FILES) {
      const r = res(`${f}.16`);
      for (let i = 0; ; i++) {
        const v = picture(r, i);
        if (!v) break;
        const at = pieceAt(f, i);
        expect(at, `${f} ${i}`).toBeDefined();
        expect([at!.w, at!.h]).toEqual([v.width, v.height]);
      }
      expect(PIECES.filter((p) => p.file === f).length).toBe(f.startsWith('DNG') ? 28 : f === 'ITEMS' ? 20 : 6);
    }
    for (const p of PIECES) expect(p.x + p.w).toBeLessThanOrEqual(SKIN_SHEET_W);
    for (const a of PIECES)
      for (const b of PIECES)
        if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.file} ${a.i}`).toBe(true);
  });

  it('name the pieces by the file they stand for', () => {
    expect(pieceFileOf('DNG2.16')).toBe('DNG2');
    expect(pieceFileOf('MON7.16')).toBe('MON7');
    expect(pieceFileOf('ITEMS.16')).toBe('ITEMS');
    expect(pieceFileOf('STORY1.16')).toBeNull();
  });

  it('draw a skin piece as its own pixels say, flipped as the EGA piece is', () => {
    for (const [name, i] of [
      ['DNG1.16', 0],
      ['DNG3.16', 12],
      ['ITEMS.16', 5],
      ['MON3.16', 0],
    ] as const) {
      const v = picture(res(name), i)!;
      for (const flags of [0, 1, 2, 3]) {
        const [a, b] = [new Framebuffer(new Uint8Array(512 * 128), fonts), new Framebuffer(new Uint8Array(512 * 128), fonts)];
        for (const fb of [a, b]) fb.fill(0, 0, 319, 199, 8);
        a.image(v, 20, 10, flags);
        b.image(v, 20, 10, flags, { kind: 'skin', px: asSkin(v), width: v.width, height: v.height });
        expect(firstDifference(shown(b), shown(a)), `${name} ${i} flags ${flags}`).toBeNull();
      }
    }
  });

  it("show the wall through a skin piece's clear pixels, whatever the EGA mask says", () => {
    const v = picture(res('DNG1.16'), 0)!;
    const px = new Uint32Array(v.width * v.height);
    px[0] = 0xff0000ff;
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.fill(0, 0, 319, 199, 8);
    const before = shown(fb);
    fb.image(v, 20, 10, 0, { kind: 'skin', px, width: v.width, height: v.height });
    const after = shown(fb);
    const changed: number[] = [];
    for (let k = 0; k < after.length; k++) if (after[k] !== before[k]) changed.push(k);
    expect(changed.length).toBe(HI * HI);
    expect(after[10 * HI * HI_WIDTH + 20 * HI]).toBe(0xff0000ff);
  });

  it('draw the corridor in each dungeon from its own walls, named for the skin', () => {
    for (const [d, file] of [
      [2, 'DNG1'],
      [6, 'DNG2'],
      [1, 'DNG3'],
    ] as const) {
      const { g, p } = inDungeon(d);
      const from = new Set<string>();
      p.fx.image = (_r, _i, _x, _y, _f, style, name) => {
        if (style === 'dungeon') from.add(pieceFileOf(name ?? '') ?? '?');
      };
      refresh(g);
      expect([...from], `dungeon ${d}`).toEqual([file]);
    }
  });

  it("give the pieces of the skin now set, never one kept from another's", () => {
    const overs = new SkinOvers();
    const [a, b] = [flatSkin('pc-cga', { DNG1: 0xff0000ff }), flatSkin('c64', { DNG1: 0xff00ff00 })];
    expect(overs.over(a, 'DNG1', 0)?.px[0]).toBe(0xff0000ff);
    expect(overs.over(b, 'DNG1', 0)?.px[0]).toBe(0xff00ff00);
    expect(overs.over(a, 'DNG1', 0)?.px[0]).toBe(0xff0000ff);
    expect(overs.over(null, 'DNG1', 0)).toBeUndefined();
  });

  it("draw the corridor's lines in the skin's ink, and as ever without one", () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.line(10, 10, 20, 10, 15);
    expect(shown(fb)[10 * HI * HI_WIDTH + 10 * HI]).toBe(EGA_RGBA[15]);
    const ink = Uint32Array.from(EGA_RGBA);
    ink[15] = 0xff00ffff;
    fb.lineInk = ink;
    fb.line(10, 12, 20, 12, 15);
    expect(shown(fb)[12 * HI * HI_WIDTH + 10 * HI]).toBe(0xff00ffff);
  });

  it("cut a sign's plate flat in a set's two colours, and in the cobbles' without them", () => {
    const [plain, flat] = [new Uint32Array(64 * 64), new Uint32Array(64 * 64)];
    plate(plain, 64, 0, 0, 64, 64, HI);
    plate(flat, 64, 0, 0, 64, 64, HI, 1, { plate: 0x000000, edge: 0x204060 });
    expect(new Set(plain)).not.toContain(0xff604020);
    expect(new Set(flat)).toEqual(new Set([0xff000000, 0xff604020]));
  });

  it("recolour an EGA piece in a machine's palette alone, clear where its mask is", () => {
    const v = picture(res('ITEMS.16'), 0)!;
    const palette = [0x000000, 0x55ffff, 0xff55ff, 0xffffff];
    const px = recolouredPiece(v, palette);
    const want = new Set(palette.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));
    const own = asSkin(v);
    for (let k = 0; k < px.length; k++) {
      expect(px[k] >>> 24 === 0).toBe(own[k] >>> 24 === 0);
      if (px[k] >>> 24) expect(want.has(px[k])).toBe(true);
    }
  });
});

/**
 * The PC CGA skin (tools/art/cgaDungeon.ts): the 1988 PC game's own CGA dungeon pictures, DNG1-3.4, ITEMS.4 and
 * MON0-7.4 - the .16's pieces, two bits a pixel in the CGA's four colours - shipped as a sheet.
 */
describe('the PC CGA skin', () => {
  const cgaRgba = new Set(CGA_COLOURS.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));
  const fours = Object.fromEntries(FILES.map((f) => [f, lzwDecompress(files.get(`${f}.4`))])) as Record<PieceFile, Uint8Array>;

  it("read a .4 picture as the .16's piece, in the CGA's colours, clear where its mask is", () => {
    const px = cgaPicture(fours.DNG1, 0);
    expect([px.width, px.height]).toEqual([24, 164]);
    for (const v of px.px) expect(cgaRgba.has(v)).toBe(true);
    const thing = cgaPicture(fours.ITEMS, 0);
    const ega = picture(res('ITEMS.16'), 0)!;
    const egaClear = asSkin(ega).map((v) => (v >>> 24 ? 1 : 0));
    expect(Array.from(thing.px, (v) => (v >>> 24 ? 1 : 0))).toEqual(Array.from(egaClear));
  });

  it("ship exactly the game's .4 pictures, every piece drawn", () => {
    const png = decodePng(readFileSync(new URL('../public/graphics/pc-cga-u5-dungeon.png', import.meta.url)));
    const want = cgaDungeonSheet(fours);
    expect([png.width, png.height]).toEqual([want.width, want.height]);
    expect(Buffer.from(png.data).equals(Buffer.from(want.data))).toBe(true);
    const sheet = new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));
    const skin = skinFromSheet('pc-cga', sheet, png.width, SKIN_SPECS['pc-cga']!.colours);
    for (const p of PIECES)
      expect(
        skin.piece(p.file, p.i)!.px.some((v) => v >>> 24 !== 0),
        `${p.file} ${p.i}`,
      ).toBe(true);
  });

  it("draw its lines, its sign and its frame in the CGA's four colours, a drip still seen", () => {
    const { ink, sign, frame } = SKIN_SPECS['pc-cga']!.colours;
    for (const v of ink) expect(cgaRgba.has(v)).toBe(true);
    expect(ink[1]).not.toBe(ink[0]); // the drips' blue is not lost in the black
    for (const c of [sign.plate, sign.edge, sign.ink, frame.blue, frame.white]) expect(CGA_COLOURS).toContain(c);
  });
});

const PRIVATE = new URL('../../../ultima5-private/', import.meta.url);
const hasPrivate = existsSync(PRIVATE);

/**
 * The Sharp X68k skin (tools/art/x68kDungeon.ts): its own dungeon off its disk 1 - each piece three bitplanes of its
 * text palette's first eight colours (a thing's and creature's a fourth, its mask), at twice the PC's size - its
 * things the left halves of its whole pictures; the narrow doorways recoloured and dithered.
 */
describe('the Sharp X68k skin', () => {
  const x68k = new Set(X68K_PALETTE.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));

  it('dither a colour between the two of the palette nearest it', () => {
    const grey: Picture = { width: 2, height: 2, pixels: Uint8Array.from([0x77, 0, 0, 0, 0x77, 0, 0, 0]), stride: 4, mask: null };
    const px = recolouredPiece(grey, X68K_PALETTE, true);
    expect(new Set(px).size).toBe(2);
    for (const v of px) expect(x68k.has(v)).toBe(true);
  });

  it('draw its lines, its sign and its frame in its eight colours', () => {
    const { ink, sign, frame } = SKIN_SPECS.x68k!.colours;
    for (const v of ink) expect(x68k.has(v)).toBe(true);
    for (const c of [sign.plate, sign.edge, sign.ink, frame.blue, frame.white]) expect(X68K_PALETTE).toContain(c);
  });

  const png = decodePng(readFileSync(new URL('../public/graphics/x68k-u5-dungeon.png', import.meta.url)));

  it('ship its own dungeon in its eight colours, twice the layout, every piece drawn at its own size', () => {
    expect([png.width, png.height]).toEqual([SKIN_SHEET_W * X68K_SCALE, SKIN_SHEET_H * X68K_SCALE]);
    // The first pixel in none of the eight, checked in a plain loop: an expect per pixel took seconds.
    let bad: string | null = null;
    for (let i = 0; i < png.data.length && bad === null; i += 4) {
      const rgba = (0xff000000 | (png.data[i + 2] << 16) | (png.data[i + 1] << 8) | png.data[i]) >>> 0;
      if (png.data[i + 3] && !x68k.has(rgba)) bad = `pixel ${i / 4}: ${rgba.toString(16)} is none of the eight colours`;
    }
    expect(bad).toBeNull();
    const skin = skinFromSheet('x68k', sheetWords(png), png.width, SKIN_SPECS.x68k!.colours);
    for (const p of PIECES) {
      const piece = skin.piece(p.file, p.i)!;
      expect([piece.w, piece.h], `${p.file} ${p.i}`).toEqual(nativeSize('x68k', p.file, p.i));
      expect(
        piece.px.some((v) => v >>> 24 !== 0),
        `${p.file} ${p.i}`,
      ).toBe(true);
    }
  });

  it("stand its things against the middle, on their foot, the right half the left's mirror as the PC draws it", () => {
    const skin = skinFromSheet('x68k', sheetWords(png), png.width, SKIN_SPECS.x68k!.colours);
    for (let i = 0; i < 20; i++) {
      const { px, w, h } = skin.piece('ITEMS', i)!;
      // Something of it in its right-hand column, against the middle, and in its foot row.
      expect(
        Array.from({ length: h }, (_, y) => px[y * w + w - 1]).some((v) => v >>> 24 !== 0),
        `ITEMS ${i} at the middle`,
      ).toBe(true);
      expect(
        px.subarray((h - 1) * w).some((v) => v >>> 24 !== 0),
        `ITEMS ${i} on its foot`,
      ).toBe(true);
    }
  });

  it.skipIf(!hasPrivate)("be exactly its disk's: its files read off the Human68k disk, its creatures unpacked", () => {
    const dim = new Uint8Array(readFileSync(new URL('x68k/Ultima V Warriors of Destiny (1989)(Pony Canyon)(Disk 1 of 2).dim', PRIVATE)));
    const files = dimFiles(dim);
    for (const f of ['DNG1.DAT', 'DNG2.DAT', 'DNG3.DAT', 'ITEMS.DAT', 'MON0.DAT', 'U5.X']) expect(files.has(f), f).toBe(true);
    const d = x68kDungeon(dim);
    expect(d.DNG1.map((p) => p === null)).toEqual(Array.from({ length: 28 }, (_, i) => i === 8 || i === 24));
    expect([d.ITEMS.length, d.MON7.length]).toEqual([20, 6]);
    expect([d.MON0[0]!.w, d.MON0[0]!.h]).toEqual([48, 132]);
    const want = x68kDungeonSheet(d, Object.fromEntries(FILES.map((f) => [f, res(`${f}.16`)])) as Record<PieceFile, Uint8Array>);
    expect(Buffer.from(png.data).equals(Buffer.from(want.data))).toBe(true);
  });
});

/**
 * The C64 skin (tools/art/c64Dungeon.ts): its own dungeon off its disk 2 - the walls packed as the Apple's, the things
 * as they are - drawn at the PC's pieces' size; the two narrow doorways and the creatures (sprites) recoloured.
 */
describe('the C64 skin', () => {
  const c64Rgba = new Set(C64.map((c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0));
  const png = decodePng(readFileSync(new URL('../public/graphics/c64-u5-dungeon.png', import.meta.url)));

  it('ship its own dungeon in its own colours, every piece drawn', () => {
    for (let i = 0; i < png.data.length; i += 4)
      if (png.data[i + 3])
        expect(c64Rgba.has((0xff000000 | (png.data[i + 2] << 16) | (png.data[i + 1] << 8) | png.data[i]) >>> 0)).toBe(true);
    const sheet = new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));
    const skin = skinFromSheet('c64', sheet, png.width, SKIN_SPECS.c64!.colours);
    for (const p of PIECES)
      expect(
        skin.piece(p.file, p.i)!.px.some((v) => v >>> 24 !== 0),
        `${p.file} ${p.i}`,
      ).toBe(true);
    for (const v of SKIN_SPECS.c64!.colours.ink) expect(c64Rgba.has(v)).toBe(true);
  });

  it.skipIf(!hasPrivate)("be exactly its disk's, unpacked to the walls' 11952 bytes", () => {
    const d64 = new Uint8Array(readFileSync(new URL('c64/Ultima V - Disk 2.d64', PRIVATE)));
    const dungeon = c64Dungeon(d64);
    for (const f of ['DNG1', 'DNG2', 'DNG3'] as const) expect(dungeon.walls[f].length).toBe(0x2eb0);
    const want = c64DungeonSheet(dungeon, Object.fromEntries(FILES.map((f) => [f, res(`${f}.16`)])) as Record<PieceFile, Uint8Array>);
    expect(Buffer.from(png.data).equals(Buffer.from(want.data))).toBe(true);
  });
});

/**
 * The Apple skins (tools/art/apple2Dungeon.ts): its own dungeon off its Dungeon disk, in its colours (Apple Color) and
 * on a monochrome monitor (the //e's and //c's, tinted); its two narrow doorways and its creatures recoloured.
 */
describe('the Apple skins', () => {
  const rgbaOf = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0;
  const [colour, mono] = ['apple2-u5-dungeon.png', 'apple2-u5-dungeon-mono.png'].map((n) =>
    decodePng(readFileSync(new URL(`../public/graphics/${n}`, import.meta.url))),
  );
  const words = (png: typeof colour): Uint32Array =>
    new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));

  it("keep the machines' colours as their tools have them", () => {
    expect([...C64_PALETTE]).toEqual(C64);
    expect([...APPLE_PALETTE]).toEqual([...APPLE_COLOURS]);
    expect([APPLE_GREEN, APPLE_WHITE]).toEqual([GREEN_SCREEN, WHITE_SCREEN]);
  });

  it('ship its dungeon in its six colours, and lit where it is lit on the monitor', () => {
    const allowed = new Set(APPLE_PALETTE.map(rgbaOf));
    const [c, m] = [words(colour), words(mono)];
    const [black, white] = [rgbaOf(0), rgbaOf(0xffffff)];
    // The first pixel that breaks a rule, checked in a plain loop: an expect per pixel took seconds (CI timed it out).
    let bad: string | null = c.length === m.length ? null : `${c.length} colour pixels, ${m.length} monitor`;
    for (let k = 0; k < c.length && bad === null; k++) {
      const [lit, monoLit] = [c[k] >>> 24 !== 0, m[k] >>> 24 !== 0];
      if (lit !== monoLit) bad = `pixel ${k}: lit in ${lit ? 'colour' : 'the monitor'} only`;
      else if (lit && !allowed.has(c[k])) bad = `pixel ${k}: ${c[k].toString(16)} is none of the six colours`;
      else if (monoLit && m[k] !== black && m[k] !== white) bad = `pixel ${k}: ${m[k].toString(16)} on the monitor`;
    }
    expect(bad).toBeNull();
    for (const [name, png] of [
      ['apple2', colour],
      ['apple2e', mono],
      ['apple2c', mono],
    ] as const) {
      const spec = SKIN_SPECS[name]!;
      const sheet = spec.tint === undefined ? words(png) : tintSheet(words(png), spec.tint);
      const skin = skinFromSheet(name, sheet, png.width, spec.colours);
      for (const p of PIECES)
        expect(
          skin.piece(p.file, p.i)!.px.some((v) => v >>> 24 !== 0),
          `${name} ${p.file} ${p.i}`,
        ).toBe(true);
    }
    expect(SKIN_SPECS.apple2e!.tint).toBe(APPLE_GREEN);
    expect(SKIN_SPECS.apple2c!.tint).toBe(APPLE_WHITE);
  });

  it.skipIf(!hasPrivate)("be exactly its disk's, unpacked to the walls' 11952 bytes and the things' 3528", () => {
    const disk = unzipSync(new Uint8Array(readFileSync(new URL('apple2/UltimaV-WarriorsofDestiny(Dungeon)(Disk7of8).zip', PRIVATE))));
    const image = Object.entries(disk).find(([n]) => /\.dsk$/i.test(n))![1];
    const apple = appleDungeon(image);
    for (const f of ['DNG1', 'DNG2', 'DNG3'] as const) expect(apple.walls[f].length).toBe(0x2eb0);
    expect(apple.items.length).toBe(0xdc8);
    const pc = Object.fromEntries(FILES.map((f) => [f, res(`${f}.16`)])) as Record<PieceFile, Uint8Array>;
    expect(Buffer.from(colour.data).equals(Buffer.from(appleDungeonSheet(apple, pc, false).data))).toBe(true);
    expect(Buffer.from(mono.data).equals(Buffer.from(appleDungeonSheet(apple, pc, true).data))).toBe(true);
  });
});

/**
 * A skin's frame (skins.ts FrameSkin; Framebuffer.frameSkin): the frame's EGA blue and white shown in the machine's
 * colours, flat, in either interface; Remastered alone keeps the copper and its place's tones (skins.ts frameFor).
 */
describe("a skin's frame", () => {
  const cga = SKIN_SPECS['pc-cga']!.colours.frame;
  const rgbaOf = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0;
  /** A bar of the frame's blue across the top with its white rim under it, the rest black, as chrome.test.ts has it. */
  function barred(chrome: boolean): Framebuffer {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.chrome = chrome;
    fb.chromeAlso = [[0, 0, 319, 199]];
    fb.fill(0, 0, 319, 199, 0);
    fb.fill(0, 0, 319, 7, 1);
    fb.fill(0, 8, 319, 8, 15);
    return fb;
  }

  it("draw the PC layout as ever without a skin, and in the skin's two colours with one", () => {
    const [plain, skinned] = [barred(false), barred(false)];
    expect(shown(plain)[0]).toBe(EGA_RGBA[1]);
    skinned.frameSkin = cga;
    const out = shown(skinned);
    expect(out[0]).toBe(rgbaOf(cga.blue));
    expect(out[8 * HI * HI_WIDTH]).toBe(rgbaOf(cga.white));
    expect(new Set(out.subarray(0, 12 * HI * HI_WIDTH))).toEqual(new Set([rgbaOf(cga.blue), rgbaOf(cga.white), EGA_RGBA[0]]));
  });

  it("draw the Enhanced frame flat in the skin's colours, whatever the place's tone", () => {
    const fb = barred(true);
    fb.chromeTone = { hue: 215, sat: 1, value: 1.1 }; // out in Britannia: Remastered's copper turns blue; a skin's does not
    fb.frameSkin = cga;
    const out = shown(fb).subarray(0, 12 * HI * HI_WIDTH);
    expect(new Set(out)).toEqual(new Set([rgbaOf(cga.blue), rgbaOf(cga.white), EGA_RGBA[0]]));
  });

  it("give the copper and its place's tones to Remastered alone, PC EGA its own blue and white, each set its own", () => {
    const skin = (t: Tiles): Skin => ({ ...flatSkin(t, {}), frame: SKIN_SPECS[t]?.colours.frame ?? { blue: 1, white: 2 } });
    expect(frameFor('modern-pc', null, true)).toBeNull();
    expect(frameFor('pc-ega', null, true)).toEqual({ blue: 0x0000aa, white: 0xffffff });
    expect(frameFor('pc-ega', null, false), "Retro's PC EGA: the game's own, as ever").toBeNull();
    for (const t of ['pc-cga', 'apple2', 'apple2e', 'apple2c', 'x68k', 'c64'] as const)
      for (const enhanced of [true, false]) expect(frameFor(t, skin(t), enhanced), t).toEqual(SKIN_SPECS[t]!.colours.frame);
    expect(frameFor('c64', null, true), 'its skin not yet loaded').toBeNull();
  });
});

describe("each skin's own pieces", () => {
  it("say which are the machine's own and which the PC's recoloured, as the tools make them", () => {
    expect(PIECES.every((p) => ownPiece('pc-cga', p.file, p.i))).toBe(true);
    expect(PIECES.filter((p) => !ownPiece('x68k', p.file, p.i)).map((p) => `${p.file} ${p.i}`)).toEqual([
      'DNG1 8', 'DNG1 24', 'DNG2 8', 'DNG2 24', 'DNG3 8', 'DNG3 24',
    ]); // prettier-ignore
    const c64 = PIECES.filter((p) => !ownPiece('c64', p.file, p.i));
    expect(c64.filter((p) => !p.file.startsWith('MON')).map((p) => `${p.file} ${p.i}`)).toEqual([
      'DNG1 8', 'DNG1 24', 'DNG2 8', 'DNG2 24', 'DNG3 8', 'DNG3 24',
    ]); // prettier-ignore
    expect(c64.filter((p) => p.file.startsWith('MON')).length).toBe(48);
    const apple = PIECES.filter((p) => !ownPiece('apple2', p.file, p.i));
    expect(apple.filter((p) => !p.file.startsWith('MON')).map((p) => `${p.file} ${p.i}`)).toEqual([
      'DNG1 8', 'DNG1 24', 'DNG2 8', 'DNG2 24', 'DNG3 8', 'DNG3 24', 'ITEMS 19',
    ]); // prettier-ignore
    expect(apple.filter((p) => p.file.startsWith('MON')).length).toBe(48);
    expect([...C64_RECOLOURED_WALLS]).toEqual([8, 24]);
    expect([...APPLE_RECOLOURED_WALLS]).toEqual([8, 24]);
  });
});

/** A sheet's pixels as words (RGBA in memory order). */
const sheetWords = (png: { data: Uint8Array | Uint8ClampedArray }): Uint32Array =>
  new Uint32Array(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength));

/**
 * Corrections from the review (2026-11-14): the Apple and the C64 draw each picture from its last row up, so their
 * pieces stand as the PC's do only read that way; the C64's walls one colour a dungeon; the X68k the PC's own pictures,
 * the walls inverted; the CGA's colours palette 1 at low intensity, as the game's CGA.DRV sets it.
 */
describe('the machine sheets, as reviewed', () => {
  const pcMask = (i: number): Uint8Array => Uint8Array.from(asSkin(picture(res('ITEMS.16'), i)!), (v) => (v >>> 24 ? 1 : 0));

  /** How many of the things' pixels are drawn where the PC's are drawn, upright and upside down. */
  function agreement(png: { data: Uint8Array | Uint8ClampedArray; width: number }): { upright: number; flipped: number } {
    const words = sheetWords(png);
    let [upright, flipped] = [0, 0];
    for (const p of PIECES.filter((q) => q.file === 'ITEMS')) {
      const pc = pcMask(p.i);
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const drawn = words[(p.y + y) * png.width + p.x + x] >>> 24 ? 1 : 0;
          if (drawn === pc[y * p.w + x]) upright++;
          if (drawn === pc[(p.h - 1 - y) * p.w + x]) flipped++;
        }
    }
    return { upright, flipped };
  }

  it.each(['apple2-u5-dungeon.png', 'c64-u5-dungeon.png'])('stand the things of %s upright, as the PC has them', (name) => {
    const a = agreement(decodePng(readFileSync(new URL(`../public/graphics/${name}`, import.meta.url))));
    expect(a.upright).toBeGreaterThan(a.flipped);
  });

  it("draw the C64's walls light blue in black lines in every dungeon, the doorways too, as its Despise is", () => {
    const png = decodePng(readFileSync(new URL('../public/graphics/c64-u5-dungeon.png', import.meta.url)));
    const words = sheetWords(png);
    const lightBlue = (0xff000000 | (0xb5 << 16) | (0x5e << 8) | 0x6c) >>> 0;
    for (const f of ['DNG1', 'DNG2', 'DNG3'] as const) {
      const inks = new Set<number>();
      for (const p of PIECES.filter((q) => q.file === f))
        for (let y = 0; y < p.h; y++)
          for (let x = 0; x < p.w; x++) {
            const v = words[(p.y + y) * png.width + p.x + x];
            if (v >>> 24 && (v & 0xffffff) !== 0) inks.add(v);
          }
      expect([...inks], f).toEqual([lightBlue]);
    }
  });

  it("give the C64's sign its white runes on black in its light blue's border, in a frame of its blue", () => {
    const { sign, frame } = SKIN_SPECS.c64!.colours;
    expect([sign.plate, sign.edge, sign.ink, frame.blue]).toEqual([0x000000, 0x6c5eb5, 0xffffff, 0x352879]);
  });

  it("draw the Apple //e's and //c's walls dark in light lines: a set its colours draw mostly lit inverted", () => {
    const [colour, mono] = ['apple2-u5-dungeon.png', 'apple2-u5-dungeon-mono.png'].map((n) =>
      sheetWords(decodePng(readFileSync(new URL(`../public/graphics/${n}`, import.meta.url)))),
    );
    for (const f of ['DNG1', 'DNG2', 'DNG3'] as const) {
      let [lit, all, agree] = [0, 0, 0];
      for (const p of PIECES.filter((q) => q.file === f))
        for (let y = 0; y < p.h; y++)
          for (let x = 0; x < p.w; x++) {
            const k = (p.y + y) * SKIN_SHEET_W + p.x + x;
            if (!(colour[k] >>> 24)) continue;
            all++;
            if (mono[k] & 0xffffff) lit++;
            if (!(mono[k] & 0xffffff) === !(colour[k] & 0xffffff)) agree++;
          }
      expect(lit * 2, `${f}: mostly dark`).toBeLessThan(all);
      expect([0, all], `${f}: each pixel the colours' or its opposite`).toContain(agree);
    }
  });

  it("draw the crackle, the drips and the skeletons' eyes in a colour the walls are not", () => {
    const lightBlue = (0xff000000 | (0xb5 << 16) | (0x5e << 8) | 0x6c) >>> 0;
    expect([...SKIN_SPECS.c64!.colours.ink]).not.toContain(lightBlue);
    const magenta = (0xff000000 | (0xaa << 16) | 0xaa) >>> 0;
    for (const e of [12, 13]) expect(SKIN_SPECS['pc-cga']!.colours.ink[e], `a field's EGA ${e}, on the caves' magenta`).not.toBe(magenta);
    // The C64's things (a stalactite's puddle among them) not in its walls' light blue either.
    const png = decodePng(readFileSync(new URL('../public/graphics/c64-u5-dungeon.png', import.meta.url)));
    const words = sheetWords(png);
    for (const p of PIECES.filter((q) => q.file === 'ITEMS'))
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) expect(words[(p.y + y) * png.width + p.x + x], `ITEMS ${p.i}`).not.toBe(lightBlue);
  });

  it("show the CGA's palette 1 at low intensity, as CGA.DRV sets it, in its tiles, dungeon and skin alike", () => {
    expect([...CGA_COLOURS]).toEqual([0x000000, 0x00aaaa, 0xaa00aa, 0xaaaaaa]);
    const { sign, frame } = SKIN_SPECS['pc-cga']!.colours;
    expect([sign.plate, sign.edge, sign.ink, frame.blue, frame.white]).toEqual([0x000000, 0x00aaaa, 0xaaaaaa, 0x00aaaa, 0xaaaaaa]);
  });
});

/**
 * The second review (2026-11-14): the CGA's walls without its magenta, but for its doors; the Apple's and C64's
 * pictures enlarged without beating against their dithers; 1988's sign black on a plate of the set's own.
 */
describe('the machine sheets, as reviewed again', () => {
  const fours = Object.fromEntries(FILES.map((f) => [f, lzwDecompress(files.get(`${f}.4`))])) as Record<PieceFile, Uint8Array>;
  const magenta = (0xff000000 | (0xaa << 16) | 0xaa) >>> 0;

  it("keep the CGA's magenta off its walls but for its doors, and its things and creatures as they are", () => {
    const png = decodePng(readFileSync(new URL('../public/graphics/pc-cga-u5-dungeon.png', import.meta.url)));
    expect(Buffer.from(png.data).equals(Buffer.from(cgaDungeonSheet(fours).data))).toBe(true);
    const words = sheetWords(png);
    for (const p of PIECES) {
      const own = cgaPicture(fours[p.file], p.i).px;
      const plain = p.file.startsWith('DNG') && CGA_DOORS.has(p.i) ? cgaPicture(fours[p.file], CGA_DOORS.get(p.i)!).px : null;
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const got = words[(p.y + y) * png.width + p.x + x];
          const k = y * p.w + x;
          if (!p.file.startsWith('DNG')) expect(got).toBe(own[k]);
          else if (plain && plain[k] !== own[k] && own[k] !== magenta) expect(got, `${p.file} ${p.i}: its door`).toBe(own[k]);
          else if (!plain || p.file !== 'DNG3') expect(got, `${p.file} ${p.i} ${x},${y}`).not.toBe(magenta);
        }
    }
    // A door keeps its magenta where it lies thick (Deceit's), and a wall's streak beside a door none (Shame's).
    const pinkIn = (file: PieceFile, i: number): number => {
      const p = PIECES.find((q) => q.file === file && q.i === i)!;
      let n = 0;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (words[(p.y + y) * png.width + p.x + x] === magenta) n++;
      return n;
    };
    expect(pinkIn('DNG3', 13)).toBeGreaterThan(500);
    expect(pinkIn('DNG2', 13)).toBe(0);
    // Deceit's door the game's own, every pixel inside its edge - none taken for the wall's, its pink where the wall's is.
    for (const [i, plainI] of [
      [13, 9],
      [14, 10],
    ]) {
      const p = PIECES.find((q) => q.file === 'DNG3' && q.i === i)!;
      const [own, plain] = [cgaPicture(fours.DNG3, i).px, cgaPicture(fours.DNG3, plainI).px];
      // The door where differing pink is dense: the columns half as full of it as the fullest, the rows two thirds full,
      // short of their ends.
      const pinkDiffers = (x: number, y: number): boolean => own[y * p.w + x] !== plain[y * p.w + x] && own[y * p.w + x] === magenta;
      const inCol = (x: number): number => Array.from({ length: p.h }, (_, y) => pinkDiffers(x, y)).filter(Boolean).length;
      const most = Math.max(...Array.from({ length: p.w }, (_, x) => inCol(x)));
      const cols = Array.from({ length: p.w }, (_, x) => x).filter((x) => inCol(x) * 2 >= most);
      const rws = Array.from({ length: p.h }, (_, y) => y).filter(
        (y) => cols.filter((x) => pinkDiffers(x, y)).length * 3 >= cols.length * 2,
      );
      const [x1, x2, y1, y2] = [Math.min(...cols) + 2, Math.max(...cols) - 2, Math.min(...rws) + 2, Math.max(...rws) - 2];
      expect(x2 - x1, `DNG3 ${i}: a door found`).toBeGreaterThan(4);
      for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++) expect(words[(p.y + y) * png.width + p.x + x], `DNG3 ${i} ${x},${y}`).toBe(own[y * p.w + x]);
    }
  });

  it("colour a picture's edge as the pattern it is in goes on past it, not as though it ended in black", () => {
    // Lit three in four, its edge pixel's neighbour within dark: lit beside the lit one past it, white.
    const bits = (lit: (x: number) => boolean): number[] =>
      Array.from({ length: 4 }, (_, b) => Array.from({ length: 7 }, (_, k) => (lit(b * 7 + k) ? 1 << k : 0)).reduce((n, v) => n | v, 0));
    const solid = appleRow(bits((x) => x % 4 !== 1));
    expect(solid[0]).toBe(APPLE_LIT);
    const end = appleRow(bits((x) => x % 4 !== 2)); // 28 pixels: 27 lit, 26 dark, 25 and 24 lit
    expect(end[27]).toBe(APPLE_LIT);
    // Every other pixel lit: each alone, its column's colour, at its edges as within.
    const dither = appleRow(bits((x) => x % 2 === 0));
    expect(dither[0]).not.toBe(APPLE_LIT);
    expect(dither[0]).toBe(dither[2]);
  });

  it("give 1988's sign the //e's green runes, and white in every other set", () => {
    expect(signRunes('apple2e')).toBe(Colour.appleGreen);
    for (const t of ['pc-ega', 'pc-cga', 'x68k', 'c64', 'apple2', 'apple2c', 'modern-pc'] as const) expect(signRunes(t), t).toBeNull();
  });

  it("print 1988's sign light on black, in a black box a few pixels larger than its letters all round", () => {
    for (const runes of [Colour.appleGreen, null]) {
      const game = inDungeon(1);
      const g = game.g;
      g.options.tileSet = 'original';
      g.s.dungeon[cellIndexAhead(g)] = 0xb1;
      game.p.fx.signRunes = () => runes;
      const glyphs: [number, number, number, number][] = [];
      const out = (g.text as unknown as { out: { glyph: (...a: number[]) => void } }).out;
      const was = out.glyph.bind(out);
      out.glyph = (font: number, code: number, c: number, r: number, fg: number, bg: number, ...rest: number[]) => {
        if (font === 1) glyphs.push([c, r, fg, bg]);
        was(font, code, c, r, fg, bg, ...rest);
      };
      const boxes: number[][] = [];
      const fill = g.draw.fill.bind(g.draw);
      g.draw.fill = (x1: number, y1: number, x2: number, y2: number) => {
        if (g.draw.pen === 0) boxes.push([x1, y1, x2, y2]);
        fill(x1, y1, x2, y2);
      };
      refresh(g);
      expect(glyphs.length).toBeGreaterThan(0);
      for (const [, , fg, bg] of glyphs) expect([fg, bg]).toEqual([runes ?? 15, 0]);
      expect(g.text.win.fg, 'the window as it was').toBe(15);
      const [c1, r1] = [Math.min(...glyphs.map((v) => v[0])), Math.min(...glyphs.map((v) => v[1]))];
      const [c2, r2] = [Math.max(...glyphs.map((v) => v[0])), Math.max(...glyphs.map((v) => v[1]))];
      const box = boxes.find(([x1, y1, x2, y2]) => x1 <= c1 * 8 - 2 && y1 <= r1 * 8 - 2 && x2 >= c2 * 8 + 9 && y2 >= r2 * 8 + 9);
      expect(box, JSON.stringify(boxes)).toBeDefined();
      expect(box![0]).toBeGreaterThanOrEqual(c1 * 8 - 4);
    }
  });
});

/** The cell ahead of the party, north (inDungeon's facing), on its level. */
function cellIndexAhead(g: ReturnType<typeof newGame>['g']): number {
  return g.s.level * 0x40 + (g.s.y - 1) * 8 + g.s.x;
}

/**
 * The third review (2026-11-14): no seam where pieces meet - the CGA's edges taken off their magenta as their middles
 * are, the Apple's dither and colours kept in step with the screen, where its table puts each picture.
 */
describe('the machine sheets, seamless', () => {
  it("take the CGA's magenta off a piece's edge columns as off its middle, not darker", () => {
    const fours = Object.fromEntries(FILES.map((f) => [f, lzwDecompress(files.get(`${f}.4`))])) as Record<PieceFile, Uint8Array>;
    const png = decodePng(readFileSync(new URL('../public/graphics/pc-cga-u5-dungeon.png', import.meta.url)));
    const words = sheetWords(png);
    const magenta = (0xff000000 | (0xaa << 16) | 0xaa) >>> 0;
    const [edge, middle] = [
      [0, 0],
      [0, 0],
    ];
    for (const p of PIECES.filter((q) => q.file.startsWith('DNG') && !CGA_DOORS.has(q.i))) {
      const own = cgaPicture(fours[p.file], p.i).px;
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          if (own[y * p.w + x] !== magenta) continue;
          const tally = x === 0 || x === p.w - 1 ? edge : middle;
          tally[1]++;
          if ((words[(p.y + y) * png.width + p.x + x] & 0xffffff) === 0) tally[0]++;
        }
    }
    expect(edge[0] / edge[1]).toBeLessThan(middle[0] / middle[1] + 0.1);
  });

  it("colour an Apple pixel lit alone by its column on the screen, its picture's first byte where the table puts it", () => {
    // Every other pixel lit, from its first: each alone.
    expect(appleRow([0x55, 0x2a])[0]).toBe(APPLE_GREEN_HUE); // column 0, even
    expect(appleRow([0x55, 0x2a], false, 3)[0]).toBe(APPLE_VIOLET); // byte 3: column 21, odd
    // The view on an odd screen byte: Shame's halls orange, as play of the Apple shows them, not blue.
    const png = decodePng(readFileSync(new URL('../public/graphics/apple2-u5-dungeon.png', import.meta.url)));
    let [orange, blue] = [0, 0];
    for (const p of PIECES.filter((q) => q.file === 'DNG2'))
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const o = ((p.y + y) * png.width + p.x + x) * 4;
          const c = (png.data[o] << 16) | (png.data[o + 1] << 8) | png.data[o + 2];
          if (c === 0xff6a3c) orange++;
          if (c === 0x15cffd) blue++;
        }
    expect(orange).toBeGreaterThan(blue * 2);
  });
});

/**
 * Native resolution (2026-11-14): the Apple's and the C64's pieces shipped at their own size, as their disks have them,
 * and drawn into the PC piece's place on the colour page's finer grid - none of their pixels lost or drawn twice.
 */
describe('the machines at their own resolution', () => {
  it("give each piece the size its machine drew it, the PC's where it is recoloured from the PC's", () => {
    expect(nativeSize('apple2', 'DNG1', 0)).toEqual([21, 144]);
    expect(nativeSize('apple2e', 'DNG3', 12)).toEqual([70, 144]);
    expect(nativeSize('c64', 'DNG2', 9)).toEqual([56, 144]);
    expect(nativeSize('apple2', 'DNG1', 8)).toEqual([28, 114]); // a doorway, recoloured
    expect(nativeSize('apple2c', 'ITEMS', 0)).toEqual([35, 70]);
    expect(nativeSize('apple2', 'ITEMS', 19)).toEqual([16, 16]); // none of its own
    expect(nativeSize('c64', 'ITEMS', 19)).toEqual([8, 7]);
    expect(nativeSize('c64', 'MON0', 0)).toEqual([24, 66]); // sprites, recoloured
    for (const p of PIECES) expect(nativeSize('pc-cga', p.file, p.i)).toEqual([p.w, p.h]);
    // The X68000's twice the PC's across, its walls 316 rows, the rest twice down; a doorway, recoloured, the PC's.
    expect(nativeSize('x68k', 'DNG1', 9)).toEqual([112, 316]);
    expect(nativeSize('x68k', 'ITEMS', 0)).toEqual([80, 160]);
    expect(nativeSize('x68k', 'MON0', 0)).toEqual([48, 132]);
    expect(nativeSize('x68k', 'DNG3', 24)).toEqual([28, 114]);
    // Each fits in its piece's place on the sheet.
    for (const t of ['apple2', 'c64'] as const)
      for (const p of PIECES) {
        const [w, h] = nativeSize(t, p.file, p.i);
        expect(w <= p.w && h <= p.h, `${t} ${p.file} ${p.i}`).toBe(true);
      }
  });

  it.skipIf(!hasPrivate)("take the sizes from the disks' own table, the Apple's and the C64's alike", () => {
    const disk = unzipSync(new Uint8Array(readFileSync(new URL('apple2/UltimaV-WarriorsofDestiny(Dungeon)(Disk7of8).zip', PRIVATE))));
    const apple = appleDungeon(Object.entries(disk).find(([n]) => /\.dsk$/i.test(n))![1]);
    const c64 = c64Dungeon(new Uint8Array(readFileSync(new URL('c64/Ultima V - Disk 2.d64', PRIVATE))));
    for (const t of [apple.table, c64.table]) {
      const size = (k: number): number[] => [t[k].x2 - t[k].x1 + 1, t[k].y2 - t[k].y1 + 1];
      expect(Array.from({ length: 28 }, (_, k) => size(k))).toEqual(NATIVE_WALLS.map((v) => [...v]));
      expect(Array.from({ length: 20 }, (_, i) => size(31 + i * 2))).toEqual(NATIVE_ITEMS.map((v) => [...v]));
    }
  });

  it("draw a piece of its own size into the PC piece's place on the finer grid, each pixel four or five wide, mirrored", () => {
    // Seven columns, each its own colour, two rows: into a picture of eight by two.
    const col = (x: number): number => (0xff000000 | (x * 30 + 10)) >>> 0;
    const px = Uint32Array.from({ length: 14 }, (_, k) => col(k % 7));
    const v: Picture = { width: 8, height: 2, pixels: new Uint8Array(8), stride: 4, mask: null };
    for (const flags of [0, 2]) {
      const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
      fb.image(v, 40, 50, flags, { kind: 'skin', px, width: 7, height: 2 });
      const out = shown(fb);
      const left = flags & 2 ? 39 : 40;
      const row = Array.from({ length: 8 * HI }, (_, hx) => out[50 * HI * HI_WIDTH + left * HI + hx]);
      const runs: number[][] = [];
      for (const c of row) {
        if (runs.length && runs[runs.length - 1][0] === c) runs[runs.length - 1][1]++;
        else runs.push([c, 1]);
      }
      expect(runs.map(([c]) => c)).toEqual(Array.from({ length: 7 }, (_, x) => col(flags & 2 ? 6 - x : x)));
      for (const [, n] of runs) expect(n).toBeOneOf([4, 5]);
    }
  });

  it.skipIf(!hasPrivate)("ship the Apple's own pieces uncut: each row its disk's, every pixel, at its own size", () => {
    const disk = unzipSync(new Uint8Array(readFileSync(new URL('apple2/UltimaV-WarriorsofDestiny(Dungeon)(Disk7of8).zip', PRIVATE))));
    const apple = appleDungeon(Object.entries(disk).find(([n]) => /\.dsk$/i.test(n))![1]);
    const mono = sheetWords(decodePng(readFileSync(new URL('../public/graphics/apple2-u5-dungeon-mono.png', import.meta.url))));
    // A thing on the monitor: its own bits, lit where set, clear where its mask is, at its own size.
    const p = PIECES.find((q) => q.file === 'ITEMS' && q.i === 6)!;
    const [w, h] = nativeSize('apple2e', 'ITEMS', 6);
    const e = apple.table[31 + 6 * 2];
    const per = e.x2 - e.x1 + 1;
    for (let r = 0; r < h; r++) {
      // Stored last row first.
      const bytes = Array.from(apple.items.subarray(e.at - 0x6eb0 + (h - 1 - r) * per, e.at - 0x6eb0 + (h - r) * per));
      const lit = appleRow(bytes, true);
      for (let x = 0; x < w; x++) {
        const got = mono[(p.y + r) * SKIN_SHEET_W + p.x + x];
        if (got >>> 24) expect((got & 0xffffff) !== 0, `${x},${r}`).toBe(lit[x] !== 0x000000);
      }
    }
  });
});

/**
 * The Enhanced sign in each look's own colours (2026-11-14): every look but Remastered's its sign flat in its machine's
 * colours - its runes light on a black plate in a border of its frame's colour - not the port's carved stone.
 */
describe("the Enhanced sign in each look's colours", () => {
  const palettes: Record<string, number[]> = {
    'pc-ega': [0x000000, 0x5555ff, 0xffffff],
    'pc-cga': [...CGA_COLOURS],
    x68k: [...X68K_PALETTE],
    c64: [...C64],
    apple2: [...APPLE_COLOURS],
  };

  it("give each look's sign its machine's colours alone, and Remastered's flat: red runes on black in a dark grey border", () => {
    // As PC EGA's sign is drawn, in the runes' red, the //c's dark grey round it (2026-11-16, the player's choice).
    expect(signStyleFor('modern-pc', null)).toEqual({ plate: 0x000000, edge: 0x787874, ink: RUNE_RED });
    expect(signStyleFor('apple2c', { ...flatSkin('apple2c', {}), sign: SKIN_SPECS.apple2c!.colours.sign })!.edge).toBe(0x787874);
    expect(signStyleFor('pc-ega', null)).toEqual({ plate: 0x000000, edge: 0x5555ff, ink: 0xffffff });
    for (const t of ['pc-cga', 'x68k', 'c64', 'apple2'] as const) {
      const style = signStyleFor(t, { ...flatSkin(t, {}), sign: SKIN_SPECS[t]!.colours.sign })!;
      for (const c of [style.plate, style.edge, style.ink]) expect(palettes[t], `${t} 0x${c.toString(16)}`).toContain(c);
      expect(style.plate).toBe(0x000000);
    }
    for (const [t, tint] of [
      ['apple2e', APPLE_GREEN],
      ['apple2c', APPLE_WHITE],
    ] as const)
      expect(signStyleFor(t, { ...flatSkin(t, {}), sign: SKIN_SPECS[t]!.colours.sign })!.ink).toBe(tint);
  });

  it('carve a sign in its three colours alone: its plate, its border and bolts, its runes', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    // Each letter a checkerboard, so it has edges everywhere a groove would shade.
    fb.letterMask = (_face, _text, side = 32) =>
      Uint8Array.from({ length: side * side }, (_, i) => ((i % side) + Math.floor(i / side)) % 2);
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    const grey = fb.hi[1][0x20 * HI * HI_WIDTH + 0x20 * HI];
    fb.signStyle = { plate: 0x000000, edge: 0x00aaaa, ink: 0xffffff }; // its ink not the grey wall's
    expect(fb.carveSign('AB', 11, 11, 'here', false)).toBe(true);
    const seen = new Set<number>();
    for (let y = 0xe * HI; y < 0xb3 * HI; y++) for (let x = 0x10 * HI; x < 0xb0 * HI; x++) seen.add(fb.hi[1][y * HI_WIDTH + x]);
    seen.delete(grey);
    const rgbaOf = (c: number): number => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16)) >>> 0;
    expect([...seen].sort()).toEqual([0x000000, 0x00aaaa, 0xffffff].map(rgbaOf).sort());
  });
});

/** The sign's runes in even strokes (runeStrokes.ts, 2026-11-16): the font's letter, each stroke two of the sign's dots. */
describe("a dungeon sign's runes", () => {
  it('are drawn in strokes two dots wide (four colour pixels), however heavy the font sets them', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    // The rune font's letter a heavy upright bar, a fifth of it wide; the English whole.
    fb.letterMask = (face, _text, side = 32) =>
      Uint8Array.from({ length: side * side }, (_, i) => (face !== 'runes' || Math.abs((i % side) - side / 2) < side / 10 ? 1 : 0));
    fb.page = 1;
    fb.fill(0x10, 0xe, 0xaf, 0xb2, 7);
    fb.signStyle = { plate: 0x000000, edge: 0x787874, ink: 0xc8201f };
    expect(fb.carveSign('A', 11, 11, 'here', false)).toBe(true);
    const red = (0xff000000 | (0x1f << 16) | (0x20 << 8) | 0xc8) >>> 0;
    const widths = new Set<number>();
    for (let y = 0; y < HI_HEIGHT; y++) {
      let n = 0;
      for (let x = 0; x < HI_WIDTH; x++) if (fb.hi[1][y * HI_WIDTH + x] === red) n++;
      if (n) widths.add(n);
    }
    expect([...widths]).toEqual([4]);
  });
});

/** A sign read: its English in the font chosen (Appearance > Font), DOS's the game's own letters. */
describe("a dungeon sign's English, read", () => {
  /** The faces asked for as sign `text` is read through to its English, the DOS font chosen or not. */
  const asked = (dos: boolean): string[] => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    const faces: string[] = [];
    fb.letterMask = (face, _text, side = 32) => {
      faces.push(face);
      return new Uint8Array(side * side).fill(1);
    };
    fb.dosLetters = dos;
    fb.signStyle = { plate: 0x000000, edge: 0x787874, ink: 0xc8201f };
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      fb.carveSign('A', 11, 11, 'here', true);
      now += 60_000; // long since read: all English
      faces.length = 0;
      fb.carveSign('A', 11, 11, 'here', true);
    } finally {
      clock.mockRestore();
    }
    return faces;
  };

  it("is set in the chosen font's letters ('mono', SixtyFour, Legible or Dyslexic as chosen)", () => {
    expect(asked(false)).toContain('mono');
  });

  it("is set in the game's own 8x8 letters with DOS chosen, the font's not asked for", () => {
    expect(asked(true)).not.toContain('mono');
  });
});

/** The maps (the Map command's, a town's seen) in the look chosen, in either interface (2026-11-14). */
describe('the maps in each look', () => {
  it("draw with the look's own art in either interface, and the game's own tiles for Retro's PC EGA", () => {
    const art = { name: 'the look in use' };
    expect(mapArtFor('standard', 'c64', art)).toBe(art);
    expect(mapArtFor('standard', 'modern-pc', art)).toBe(art);
    expect(mapArtFor('original', 'c64', art)).toBe(art);
    expect(mapArtFor('original', 'apple2e', art)).toBe(art);
    expect(mapArtFor('original', 'pc-ega', art)).toBeNull(); // the game's own, the last look's art perhaps still kept
    expect(mapArtFor('standard', 'c64', null)).toBeNull();
  });
});

/** The dungeon's pictures in the port's own drawing (2026-11-14): Remastered's alone; PC EGA's the 1988 game's own. */
describe("the dungeon's pictures in each look", () => {
  it("draw in the port's stone for Remastered alone - PC EGA's the game's own pictures, in either interface", () => {
    expect(portDungeon('standard', 'modern-pc')).toBe(true);
    expect(portDungeon('standard', 'pc-ega')).toBe(false);
    expect(portDungeon('original', 'pc-ega')).toBe(false);
    for (const t of ['pc-cga', 'apple2', 'c64', 'x68k'] as const) expect(portDungeon('standard', t), t).toBe(false);
  });
});
