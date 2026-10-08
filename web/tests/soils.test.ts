import { describe, expect, it } from 'vitest';
import type { Place } from '../src/game/io.ts';
import { Soils } from '../src/ui/soils.ts';
import { CELL } from '../src/ui/standardArt.ts';

/**
 * Swamp, sand and lava drawn from the map (web/src/ui/soils.ts): where one kind of ground meets another - the fen
 * and the grass, the sand and the grass - the edge wanders by the world's own noise instead of running along the
 * square's side, and two squares side by side agree on it. Grass and its worn earth are one kind (wear.ts runs
 * between them); water, rock and walls are none, and nothing runs into them.
 */
describe('swamp, sand and lava drawn from the map', () => {
  const N = CELL;
  // A sheet of flat colours, one to a tile, so a pixel tells which ground it was drawn from.
  const soils = new Soils({ pixel: (tile) => (0xff000000 | tile) >>> 0 });
  const kind = (v: number): number => v & 0xff;
  const place = (rows: number[][], x: number, y: number): Place => {
    const around = new Uint8Array(25);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const r = rows[Math.min(rows.length - 1, Math.max(0, y + dy))];
        around[(dy + 2) * 5 + dx + 2] = r[Math.min(r.length - 1, Math.max(0, x + dx))];
      }
    return { map: 0, x: 40 + x, y: 40 + y, around };
  };
  const square = (rows: number[][], x: number, y: number): Uint32Array => {
    const p = place(rows, x, y);
    const out = new Uint32Array(N * N).fill((0xff000000 | p.around[12]) >>> 0);
    soils.draw(out, p);
    return out;
  };

  it('leaves alone a square among its own kind, or beside only water and rock', () => {
    expect(Soils.drawn(place([[0x04, 0x04, 0x04]], 1, 0))).toBe(false);
    expect(Soils.drawn(place([[0x05, 0x24, 0x05]], 1, 0))).toBe(false); // grass and worn earth: the wear's
    expect(Soils.drawn(place([[0x01, 0x04, 0x0c]], 1, 0))).toBe(false);
    expect(Soils.drawn(place([[0x05, 0x04, 0x05]], 1, 0))).toBe(true);
    expect(Soils.drawn(place([[0x07, 0x09, 0x07]], 1, 0))).toBe(true); // sand beside woods: grass beneath them
  });

  it('runs the edge between them off the square side, both squares agreeing where it is', () => {
    const rows = [
      [0x05, 0x04],
      [0x05, 0x04],
      [0x05, 0x04],
    ];
    const a = square(rows, 0, 1);
    const b = square(rows, 1, 1);
    // Somewhere along the edge the fen runs into the grass's square, and somewhere the grass into the fen's.
    let fenInGrass = 0;
    let grassInFen = 0;
    let torn = 0;
    const fen = (v: number): boolean => kind(v) === 0x04;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (fen(a[y * N + x])) fenInGrass++;
        if (kind(b[y * N + x]) === 0x05) grassInFen++;
      }
      // Across the squares' side the ground goes on: a few pixels either side (dithered where two grounds meet, a
      // block at a time) differ much only where the edge crosses.
      let left = 0;
      let right = 0;
      for (let k = 0; k < 4; k++) {
        if (fen(a[y * N + N - 1 - k])) left++;
        if (fen(b[y * N + k])) right++;
      }
      if (Math.abs(left - right) > 2) torn++;
    }
    expect(fenInGrass).toBeGreaterThan(0);
    expect(grassInFen).toBeGreaterThan(0);
    expect(torn).toBeLessThanOrEqual(N / 4); // the dithered band where the grounds meet, not a seam down the side
    // Each square is its own at its middle.
    expect(kind(a[(N / 2) * N + N / 2])).toBe(0x05);
    expect(kind(b[(N / 2) * N + N / 2])).toBe(0x04);
  });

  it('runs nothing into water or rock', () => {
    const out = square([[0x01, 0x04, 0x0c]], 1, 0);
    for (const v of out) expect(kind(v)).toBe(0x04);
  });
});
