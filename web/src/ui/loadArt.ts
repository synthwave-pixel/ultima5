/**
 * loadArt.ts
 *
 * Fetch the Standard tile sheet and its manifest (public/graphics/), for
 * StandardArt. Null if either is missing, so the game falls back to the
 * EGA tiles.
 */

import { appleArt, appleMono, GREEN_SCREEN, WHITE_SCREEN } from './appleArt.ts';
import { C64_SHEET, CGA_SHEET, sheetArt, X68K_SHEET } from './sheetArt.ts';
import { StandardArt, type Manifest } from './standardArt.ts';

/**
 * The sheet and all that goes with it, fetched at once (the lettering, the runes' English, the caps): `font`, the
 * lettering if it is already to hand (the loading notice's).
 */
export async function loadStandardArt(font?: Promise<Uint8Array | null>): Promise<StandardArt | null> {
  // The lettering is a nicety: without it the game's own font is shown; without the runes' English, the runes.
  const extras = Promise.all([font ?? loadStandardFont(), loadStandardFont('standard-runes.png'), loadCaps()]);
  try {
    const base = `${import.meta.env.BASE_URL}graphics/`;
    const [png, json] = await Promise.all([fetch(`${base}standard-tiles.png`), fetch(`${base}standard-tiles.json`)]);
    if (!png.ok || !json.ok) return null;
    const bitmap = await createImageBitmap(await png.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const art = new StandardArt(new Uint32Array(pixels.buffer.slice(0)), bitmap.width, (await json.json()) as Manifest);
    [art.font, art.runes, art.caps] = await extras;
    return art;
  } catch {
    return null;
  }
}

/**
 * The Apple Color tiles (appleArt.ts): Ultima V's own Apple II tiles (apple2-u5-tiles.png), or the player's own `tiles` in
 * the Apple's colours if the sheet cannot be had - lettered as `lettering` is.
 */
export async function loadAppleArt(tiles: Uint8Array, lettering: StandardArt | null): Promise<StandardArt> {
  const got = await loadSheet('apple2-u5-tiles.png');
  return appleArt(tiles, got?.sheet ?? null, got?.width ?? 0, lettering);
}

/** A sheet in public/graphics/, in memory order, and its width; null where it cannot be had (not fetched, offline). */
async function loadSheet(file: string): Promise<{ sheet: Uint32Array; width: number } | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}graphics/${file}`);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const x = c.getContext('2d')!;
    x.drawImage(bitmap, 0, 0);
    return { sheet: new Uint32Array(x.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer.slice(0)), width: bitmap.width };
  } catch {
    return null;
  }
}

/**
 * The sets drawn from sheets (sheetArt.ts): the PC's own CGA tiles, the Apple //e's and //c's (the Apple's tiles on a green and a white
 * monitor, apple2-u5-mono.png, their fire found from the colour sheet), the C64's and the Sharp X68k's - lettered as
 * `lettering` is. Null where the sheet cannot be had: the set chosen is then drawn as the one before it was.
 */
export async function loadSheetArt(
  kind: 'pc-cga' | 'apple2e' | 'apple2c' | 'c64' | 'x68k',
  tiles: Uint8Array,
  lettering: StandardArt | null,
): Promise<StandardArt | null> {
  const sheets = {
    'pc-cga': ['cga-u5-tiles.png', CGA_SHEET],
    c64: ['c64-u5-tiles.png', C64_SHEET],
    x68k: ['x68k-u5-tiles.png', X68K_SHEET],
  } as const;
  if (kind === 'pc-cga' || kind === 'c64' || kind === 'x68k') {
    const [file, spec] = sheets[kind];
    const got = await loadSheet(file);
    return got && sheetArt(spec, tiles, got.sheet, got.width, lettering);
  }
  const [mono, colour] = await Promise.all([loadSheet('apple2-u5-mono.png'), loadSheet('apple2-u5-tiles.png')]);
  if (!mono) return null;
  const spec = appleMono(kind === 'apple2e' ? GREEN_SCREEN : WHITE_SCREEN, colour?.sheet ?? null, colour?.width ?? 0);
  return sheetArt(spec, tiles, mono.sheet, mono.width, lettering);
}

/**
 * The border's caps (standard-caps.png: the ultima3 port's Standard UI sheet's, 64 by 32), in memory order; null if
 * they cannot be had, and the frame's blue is cut to a wedge instead.
 */
async function loadCaps(): Promise<Uint32Array | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}graphics/standard-caps.png`);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const x = c.getContext('2d')!;
    x.drawImage(bitmap, 0, 0);
    return new Uint32Array(x.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer.slice(0));
  } catch {
    return null;
  }
}

/**
 * The Standard lettering (standard-font.png, the port's own, no game file needed): 96 glyphs of 32 by 32 from the
 * space on, nonzero where the ink is; null if it cannot be had. Or another sheet of 16-pixel glyphs drawn the same
 * way (standard-runes.png, the runes' English).
 */
export async function loadStandardFont(sheet = 'standard-font.png'): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}graphics/${sheet}`);
    if (!res.ok) return null;
    const glyphs = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(glyphs.width, glyphs.height);
    const x = c.getContext('2d')!;
    x.drawImage(glyphs, 0, 0);
    const data = x.getImageData(0, 0, glyphs.width, glyphs.height).data;
    const count = Math.floor(glyphs.width / 16);
    const font = new Uint8Array(count * 256);
    for (let g = 0; g < count; g++)
      for (let y = 0; y < 16; y++)
        for (let px = 0; px < 16; px++) font[g * 256 + y * 16 + px] = data[(y * glyphs.width + g * 16 + px) * 4 + 3] > 127 ? 1 : 0;
    return finerFont(font, count);
  } catch {
    return null;
  }
}

/**
 * The lettering at the screen's own grain: each 16-pixel glyph doubled by EPX to 32, so where a stroke turns or
 * slants it is followed a pixel at a time rather than stepped two at a time - the screen shows a glyph's cell
 * at 32 pixels, so the sheet's own pixels would otherwise be drawn as squares of four.
 */
export function finerFont(font: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count * 1024);
  for (let g = 0; g < count; g++) {
    const at = (x: number, y: number): number => (x < 0 || y < 0 || x > 15 || y > 15 ? 0 : font[g * 256 + y * 16 + x]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const p = at(x, y);
        const a = at(x, y - 1);
        const b = at(x + 1, y);
        const c = at(x - 1, y);
        const d = at(x, y + 1);
        const o = g * 1024 + y * 2 * 32 + x * 2;
        out[o] = c === a && c !== d && a !== b ? a : p;
        out[o + 1] = a === b && a !== c && b !== d ? b : p;
        out[o + 32] = d === c && d !== b && c !== a ? c : p;
        out[o + 33] = b === d && b !== a && d !== c ? d : p;
      }
    }
  }
  return out;
}
