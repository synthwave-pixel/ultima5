/**
 * images.ts
 *
 * The DOS game's pictures (u5d graphics/image.c). A picture file (.16) is
 * a count, then pairs of offsets: an image of 16-colour pixels (two a
 * byte, rows padded to 8-pixel groups) and an optional 1-bit mask where
 * clear bits are drawn. A bit-image file (.BIT, .PCS) is a count and
 * offsets to 1-bit images drawn in white. Files named in DATA.OVL's
 * resource list (D_25ea) are LZW-compressed.
 */

import { DataOvl } from './dataOvl.ts';
import { GameFiles, u16 } from './files.ts';
import { lzwDecompress } from './lzw.ts';

export interface Picture {
  width: number;
  height: number;
  /** Packed pixels, `stride` bytes a row. */
  pixels: Uint8Array;
  stride: number;
  mask: { width: number; height: number; bits: Uint8Array; stride: number } | null;
}

export interface BitPicture {
  width: number;
  height: number;
  bits: Uint8Array;
  stride: number;
}

/** ULTIMA_1588: is the file one the game stores compressed. */
export function compressedName(ovl: DataOvl, name: string): boolean {
  return ovl.strings(0x25ea, 30).some((n) => n !== '' && n.toUpperCase() === name.toUpperCase());
}

/** A resource file's contents, expanded if compressed (ULTIMA_125d). */
export function loadResource(files: GameFiles, ovl: DataOvl, name: string): Uint8Array {
  const raw = files.get(name);
  return compressedName(ovl, name) ? lzwDecompress(raw) : raw;
}

/** IMAGE_GetImageView: picture `i` of a .16 file, or null. */
export function picture(res: Uint8Array, i: number): Picture | null {
  if (i >= u16(res, 0)) return null;
  const at = u16(res, 2 + i * 4);
  const maskAt = u16(res, 2 + i * 4 + 2);
  const width = u16(res, at);
  const height = u16(res, at + 2);
  const stride = ((width + 7) >> 3) * 4;
  let mask: Picture['mask'] = null;
  if (maskAt !== 0) {
    const mw = u16(res, maskAt);
    const mh = u16(res, maskAt + 2);
    mask = { width: mw, height: mh, bits: res.subarray(maskAt + 4), stride: (mw + 7) >> 3 };
  }
  return { width, height, pixels: res.subarray(at + 4), stride, mask };
}

/** IMAGE_GetBitImageView: bit picture `i`, or null. */
export function bitPicture(res: Uint8Array, i: number): BitPicture | null {
  if (i >= u16(res, 0)) return null;
  const at = u16(res, 2 + i * 2);
  const width = u16(res, at);
  const height = u16(res, at + 2);
  return { width, height, bits: res.subarray(at + 4), stride: (width + 7) >> 3 };
}
