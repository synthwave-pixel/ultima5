/**
 * kept.ts
 *
 * What the Standard look's painters work out for a square (its shore, soils, wear, ranges, woods), kept for the
 * next time it is drawn: up to `size` of them, the first kept the first to go when there is no room - one at a time,
 * so the squares in view, the last worked out, stay. (Emptying the lot when full had the whole view worked out again
 * in one frame, every twenty-odd steps of a voyage.)
 */

/** The squares a painter keeps, by the square: four views' worth (121 each), and more. */
export const SQUARES_KEPT = 512;

export class Kept<V> {
  private readonly map = new Map<string, V>();

  constructor(readonly size: number) {}

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  set(key: string, value: V): void {
    if (this.map.size >= this.size && !this.map.has(key)) this.map.delete(this.map.keys().next().value as string);
    this.map.set(key, value);
  }

  /** Nothing kept (what it was worked out from has changed). */
  clear(): void {
    this.map.clear();
  }

  /** How many are kept. */
  get count(): number {
    return this.map.size;
  }
}
