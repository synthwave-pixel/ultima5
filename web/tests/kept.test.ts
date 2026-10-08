import { describe, expect, it } from 'vitest';
import { Kept } from '../src/ui/kept.ts';

/** The painters' kept squares (web/src/ui/kept.ts): first in, first out, one at a time. */
describe('the squares a painter keeps', () => {
  it('lets the first kept go when full, and only it', () => {
    const k = new Kept<number>(3);
    ['a', 'b', 'c', 'd'].forEach((key, i) => k.set(key, i));
    expect(k.count).toBe(3);
    expect(k.get('a')).toBeUndefined();
    expect([k.get('b'), k.get('c'), k.get('d')]).toEqual([1, 2, 3]);
  });

  it('keeps the squares in view through a long voyage: each step lets the oldest go, not the lot', () => {
    const k = new Kept<number>(512);
    const view = (cx: number): string[] => Array.from({ length: 121 }, (_, i) => `0:${cx - 5 + (i % 11)},${Math.floor(i / 11)}`);
    for (let step = 0; step < 200; step++) for (const key of view(step)) if (k.get(key) === undefined) k.set(key, step);
    expect(k.count).toBe(512);
    expect(view(199).every((key) => k.get(key) !== undefined)).toBe(true);
  });

  it('keeps a value of null (a square with no shore) as kept', () => {
    const k = new Kept<null>(2);
    k.set('a', null);
    expect(k.get('a')).toBeNull();
    expect(k.get('b')).toBeUndefined();
  });
});
