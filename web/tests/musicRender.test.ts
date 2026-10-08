import { describe, expect, it } from 'vitest';
import { foldTail, layOut, level, type Stereo } from '../tools/music/pcm.ts';

const stereo = (...xs: number[]): Stereo => [Float32Array.from(xs), Float32Array.from(xs)];

describe('a rendered tune made a loop', () => {
  it('has its tail rung into its start, as when it comes round', () => {
    const [l] = foldTail(stereo(1, 2, 3, 4, 10, 20), 4);
    expect([...l]).toEqual([11, 22, 3, 4]);
  });

  it('is laid out as the render’s own start, then the loop on round, its span marked inside', () => {
    // A loop of 5 and a tail of 2 (10 and 20 ringing onto the first two), a pad of 1.
    const rendered = stereo(1, 2, 3, 4, 5, 10, 20);
    const { pcm, start, end } = layOut(rendered, 5, 2, 1);
    // The head as it sounded the first time, the tail not yet rung in; then the folded loop, 11 22 3 4 5, on round.
    expect([...pcm[0]]).toEqual([1, 2, 3, 4, 5, 11, 22, 3, 4]);
    expect([start, end]).toEqual([3, 8]);
    // The loop's end comes round to its start.
    expect(pcm[0][end]).toBe(pcm[0][start]);
  });

  it('is the loop in any window one loop long from a pad before its start, so a decoder’s shift leaves no seam', () => {
    const loop = 40;
    const tail = 6;
    const pad = 5;
    const noise = Array.from({ length: loop + tail }, (_, i) => Math.sin(i * 1.7) + (i % 7));
    const { pcm, start, end } = layOut(stereo(...noise), loop, tail, pad);
    const folded = [...foldTail(stereo(...noise), loop)[0]];
    expect(end - start).toBe(loop);
    expect(pcm[0]).toHaveLength(loop + tail + 2 * pad);
    for (const shift of [-pad, -2, -1, 0, 1, 2, pad]) {
      const w = [...pcm[0].slice(start + shift, end + shift)];
      const at = w.indexOf(folded[0]);
      expect([...w.slice(at), ...w.slice(0, at)]).toEqual(folded);
      // And the file keeps going round: the sample after the window is the window's first.
      if (end + shift < pcm[0].length) expect(pcm[0][end + shift]).toBe(pcm[0][start + shift]);
    }
  });

  it('is set at one loudness, a peak never past its ceiling', () => {
    const quiet = stereo(0.01, -0.01, 0.01, -0.01);
    level(quiet, -20, -1);
    expect(quiet[0][0]).toBeCloseTo(0.1, 3);
    const spiky = stereo(...Array<number>(99).fill(0.001), 0.5); // quiet, but for one peak
    level(spiky, -20, -1);
    expect(Math.max(...spiky[0])).toBeCloseTo(10 ** (-1 / 20), 3); // held at the ceiling, not raised to the RMS
  });
});

describe('a render that ran away', () => {
  it('is refused, where levelling would have hidden it as a near-silent file', async () => {
    const { assertBounded } = await import('../tools/music/pcm.ts');
    expect(() => assertBounded(stereo(0.5, -0.9, 1.4), 'fine')).not.toThrow();
    expect(() => assertBounded(stereo(0.5, 1e6, 0.2), 'grid BRITLAND.XMI')).toThrow('grid BRITLAND.XMI ran away');
    expect(() => assertBounded(stereo(0.5, Number.NaN), 'nan')).toThrow('ran away');
  });
});
