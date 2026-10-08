import { describe, expect, it } from 'vitest';
import type { Place } from '../src/game/io.ts';
import { CELL } from '../src/ui/standardArt.ts';
import { Woods } from '../src/ui/woods.ts';

/**
 * The Standard look plants the world map's woods from the map (web/src/ui/woods.ts): a tree stands on a spot set
 * by the world's own pixels, and every square its crown reaches draws it whole, so the different kinds of wood, and
 * the grass beside them, meet without a seam.
 */
describe('the woods planted from the map', () => {
  const N = CELL;
  // A sheet of flat colours: the grass green; the oak a solid teal block (leaves, not trunk), the bush a blue one.
  const TEAL = 0xffc8c800;
  const GREEN = 0xff00a000;
  const BLUE = 0xffc80000;
  const OAK = 900;
  const BUSH = 901;
  const woods = new Woods({
    pixel: (cell) => (cell === OAK ? TEAL : cell === BUSH ? BLUE : GREEN),
    oak: { cell: OAK, w: 32, h: 39 }, // the ultima3 oak's size
    bush: { cell: BUSH, w: 16, h: 10 },
  });
  const place = (rows: number[][], x: number, y: number): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map: 0, x: 40 + x, y: 40 + y, around };
  };
  /** The map drawn, its squares side by side (a square the woods leave alone stays black). */
  const drawn = (rows: number[][]): { px: Uint32Array; w: number } => {
    const w = rows[0].length * N;
    const px = new Uint32Array(w * rows.length * N);
    rows.forEach((r, y) =>
      r.forEach((_, x) => {
        const out = new Uint32Array(N * N).fill(GREEN);
        const p = place(rows, x, y);
        if (Woods.drawn(p)) woods.draw(out, p);
        else out.fill(0);
        for (let j = 0; j < N; j++) px.set(out.subarray(j * N, j * N + N), (y * N + j) * w + x * N);
      }),
    );
    return { px, w };
  };
  /** A crown's pixel. */
  const crown = (v: number): boolean => ((v >> 8) & 0xff) > 100 && ((v >> 16) & 0xff) > 100;
  /** Rows where a crown (at least 16 pixels wide) stops short, exactly at a square's edge; and how many edges it crosses. */
  const cut = (d: { px: Uint32Array; w: number }, rows: number): { cut: number; crossing: number } => {
    let n = 0;
    let crossing = 0;
    for (let y = 0; y < rows * N; y++)
      for (let edge = N; edge < d.w; edge += N) {
        const left = crown(d.px[y * d.w + edge - 1]);
        const right = crown(d.px[y * d.w + edge]);
        if (left && right) crossing++;
        if (!left || right) continue;
        let run = 0;
        while (run < 32 && crown(d.px[y * d.w + edge - 1 - run])) run++;
        if (run < 14) n++;
      }
    return { cut: n, crossing };
  };

  it('never cuts a crown at a square’s edge, in deep forest', () => {
    const deep = Array.from({ length: 4 }, () => [0x0a, 0x0a, 0x0a, 0x0a]);
    const c = cut(drawn(deep), 4);
    expect(c.crossing).toBeGreaterThan(50); // crowns do cross the edges,
    expect(c.cut).toBe(0); // and none is cut there
  });

  it('lets deep forest, forest, scrub and grass meet without a seam', () => {
    const mixed = Array.from({ length: 4 }, () => [0x0a, 0x09, 0x0a, 0x09, 0x08, 0x05]);
    const c = cut(drawn(mixed), 4);
    expect(c.crossing).toBeGreaterThan(50);
    expect(c.cut).toBe(0);
  });

  it('keeps crowns out of the water', () => {
    const lake = Array.from({ length: 3 }, () => [0x0a, 0x0a, 0x01]);
    const d = drawn(lake);
    let near = 0;
    for (let y = 0; y < 3 * N; y++) {
      expect(crown(d.px[y * d.w + 2 * N - 1])).toBe(false); // not at the water's edge
      for (let x = 2 * N - 24; x < 2 * N - 1; x++) if (crown(d.px[y * d.w + x])) near++;
    }
    expect(near).toBeGreaterThan(0); // though the wood runs up close to it
  });

  it('plants the deep forest thicker than the forest', () => {
    // Crown pixels over the middle three by three squares of five by five, so a few trees more or less do not decide it.
    const count = (t: number): number => {
      const d = drawn(Array.from({ length: 5 }, () => [t, t, t, t, t]));
      let n = 0;
      for (let y = N; y < 4 * N; y++) for (let x = N; x < 4 * N; x++) if (crown(d.px[y * d.w + x])) n++;
      return n;
    };
    // The stand-in oak is solid, so where deep forest's crowns overlap its cover saturates: the margin is modest.
    expect(count(0x0a)).toBeGreaterThan(count(0x09) * 1.15);
  });

  it('draws the grass beside the woods, for the crowns that overhang it, and leaves open grass alone', () => {
    expect(Woods.drawn(place([[0x05, 0x09]], 0, 0))).toBe(true);
    expect(Woods.drawn(place([[0x05, 0x05, 0x05]], 1, 0))).toBe(false);
  });
});
