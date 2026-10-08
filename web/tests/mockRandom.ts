/**
 * The tests' random numbers (game/rng.ts Random): a sound generator (sfc32) from a seed, so a test runs the same
 * every time - and numbers set ahead, which come first, so a test can have the roll it is about.
 */

import type { Random } from '../src/game/rng.ts';

export class MockRandom implements Random {
  private a = 0x9e3779b9;
  private b = 0x243f6a88;
  private c = 0xb7e15162;
  private d: number;
  private readonly set: number[] = [];

  constructor(seed = 1234) {
    this.d = seed >>> 0;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** The next numbers asked for, whatever their range (each must lie in it). */
  queue(...numbers: number[]): void {
    this.set.push(...numbers);
  }

  range(low: number, high: number): number {
    const n = this.set.shift();
    if (n !== undefined) {
      if (n < low || n > high) throw new Error(`MockRandom: ${n} set, where ${low} to ${high} is asked for`);
      return n;
    }
    return low + Math.floor((this.next() / 0x100000000) * (high - low + 1));
  }

  upTo(n: number): number {
    return this.range(0, n);
  }

  private next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
}
