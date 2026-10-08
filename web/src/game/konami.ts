/**
 * konami.ts
 *
 * The Konami code - up, up, down, down, left, right, left, right, B, A - watched for in the Cheats menu, where it
 * turns on the development cheats (devMode.ts). On a controller or the touch pad its own buttons; on a keyboard the
 * arrows (or WASD) and the letters B and A (or Enter for A). The arrows go on moving the menu's bar as ever; the B
 * that is the code's is kept from closing the menu, and the A from choosing.
 */

import { K, Pad } from './io.ts';

/** One of the code's keys: whether menu key `k` (read from key `raw`) is it. */
type Step = (k: number, raw: number) => boolean;

const upper = (c: number): number => (c >= 0x61 && c <= 0x7a ? c - 0x20 : c);
const dir =
  (d: number): Step =>
  (k) =>
    k === d;
const B: Step = (k, raw) => k === Pad.B || upper(raw) === 0x42;
const A: Step = (k, raw) => k === Pad.A || k === K.Enter || upper(raw) === 0x41;

export const KONAMI: readonly Step[] = [
  dir(K.Up),
  dir(K.Up),
  dir(K.Down),
  dir(K.Down),
  dir(K.Left),
  dir(K.Right),
  dir(K.Left),
  dir(K.Right),
  B,
  A,
];

/** The code as it is entered, key by key. */
export class Konami {
  private readonly keys: [number, number][] = [];

  /**
   * Key `k` (from `raw`) pressed: 'done' when it ends the code, 'take' when it is the code's B (to be kept from the
   * menu), else nothing - the key the menu's own.
   */
  feed(k: number, raw: number): 'take' | 'done' | undefined {
    this.keys.push([k, raw]);
    if (this.keys.length > KONAMI.length) this.keys.shift();
    // How much of the code the last keys make: the longest start of it they end with (up, up, up still two).
    const made = (): number => {
      for (let n = Math.min(this.keys.length, KONAMI.length); n > 0; n--) {
        const tail = this.keys.slice(-n);
        if (tail.every(([key, r], i) => KONAMI[i](key, r))) return n;
      }
      return 0;
    };
    const n = made();
    if (n === KONAMI.length) {
      this.keys.length = 0;
      return 'done';
    }
    return n === KONAMI.length - 1 ? 'take' : undefined;
  }
}
