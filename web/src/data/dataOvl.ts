/**
 * dataOvl.ts
 *
 * DATA.OVL is the game's data segment: the tables and strings that u5d
 * lists as `D_xxxx` in vars.c. Data-segment offset X is file offset
 * X + 0x10, so the engine reads every table from the player's own file.
 * Pointers stored in the tables are data-segment offsets too.
 */

import { u16 } from './files.ts';

const BASE = 0x10;

export class DataOvl {
  constructor(readonly data: Uint8Array) {}

  byte(ds: number): number {
    return this.data[ds + BASE];
  }

  word(ds: number): number {
    return u16(this.data, ds + BASE);
  }

  bytes(ds: number, count: number): Uint8Array {
    return this.data.slice(ds + BASE, ds + BASE + count);
  }

  words(ds: number, count: number): number[] {
    return Array.from({ length: count }, (_, i) => this.word(ds + i * 2));
  }

  /** The NUL-terminated string at a data-segment offset. */
  string(ds: number): string {
    let end = ds + BASE;
    while (end < this.data.length && this.data[end] !== 0) end++;
    return String.fromCharCode(...this.data.subarray(ds + BASE, end));
  }

  /** A table of `count` near pointers to strings; a null pointer reads as ''. */
  strings(ds: number, count: number): string[] {
    return this.words(ds, count).map((p) => (p === 0 ? '' : this.string(p)));
  }
}
