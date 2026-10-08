/**
 * lzw.ts
 *
 * The LZW compression of the DOS game's pictures and tiles (*.16, *.4,
 * *.BIT): a 32-bit little-endian length, then 9- to 12-bit codes read
 * least significant bit first, with 256 as Clear and 257 as End.
 * Follows u5d common/lzw.c (LzwDecompressFile).
 */

import { u32 } from './files.ts';

const CLEAR = 256;
const END = 257;
const FIRST = 258;
const MAX = 4096;
const MAX_BITS = 12;

export function lzwDecompress(file: Uint8Array): Uint8Array {
  const outLen = u32(file, 0);
  const out = new Uint8Array(outLen);
  const prefix = new Uint16Array(MAX);
  const suffix = new Uint8Array(MAX);
  const stack = new Uint8Array(MAX);

  let pos = 4;
  let bitBuffer = 0;
  let bits = 0;
  const read = (n: number): number => {
    while (bits < n) {
      if (pos >= file.length) return -1;
      bitBuffer |= file[pos++] << bits;
      bits += 8;
    }
    const code = bitBuffer & ((1 << n) - 1);
    bitBuffer >>>= n;
    bits -= n;
    return code;
  };

  /** Pushes the string for `code` onto the stack (reversed); returns its first byte. */
  let sp = 0;
  const expand = (code: number): number => {
    while (code >= 256) {
      stack[sp++] = suffix[code];
      code = prefix[code];
    }
    stack[sp++] = code;
    return code;
  };

  let codeSize = 9;
  let nextCode = FIRST;
  let prevCode = -1;
  let produced = 0;
  while (produced < outLen) {
    const code = read(codeSize);
    if (code < 0 || code === END) break;
    if (code === CLEAR) {
      codeSize = 9;
      nextCode = FIRST;
      prevCode = -1;
      continue;
    }
    let first: number;
    sp = 0;
    if (code < nextCode) {
      first = expand(code);
      while (sp > 0 && produced < outLen) out[produced++] = stack[--sp];
    } else if (code === nextCode && prevCode >= 0) {
      first = expand(prevCode);
      while (sp > 0 && produced < outLen) out[produced++] = stack[--sp];
      if (produced < outLen) out[produced++] = first;
    } else {
      throw new Error(`Invalid LZW code ${code} (next ${nextCode})`);
    }
    if (prevCode >= 0 && nextCode < MAX) {
      prefix[nextCode] = prevCode;
      suffix[nextCode] = first;
      nextCode++;
      if (codeSize < MAX_BITS && nextCode === 1 << codeSize) codeSize++;
    }
    prevCode = code;
  }
  if (produced !== outLen) throw new Error(`LZW produced ${produced} bytes, expected ${outLen}`);
  return out;
}
