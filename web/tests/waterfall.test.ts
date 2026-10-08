import { describe, expect, it } from 'vitest';
import {
  BABBLE_SECONDS,
  DROPLETS_SECONDS,
  fountainDroplets,
  fountainLevel,
  fountainSplash,
  ROAR_SECONDS,
  SPLASH_SECONDS,
  u3Effect,
  waterfallBabble,
  waterfallLevel,
  waterfallRoar,
} from '../src/audio/chip3.ts';
import { ducks } from '../src/ui/sound.ts';

const RATE = 44100;

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** The loudness (dB) of each `seconds` of it. */
function levels(pcm: Float32Array, seconds = 0.1): number[] {
  const step = Math.round(RATE * seconds);
  const out: number[] = [];
  for (let i = 0; i + step <= pcm.length; i += step) {
    let sum = 0;
    for (let j = i; j < i + step; j++) sum += pcm[j] * pcm[j];
    out.push(10 * Math.log10(sum / step + 1e-12));
  }
  return out;
}

const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

/** The loop played round twice: what is heard across its wrap. */
const twice = (pcm: Float32Array): Float32Array => {
  const out = new Float32Array(pcm.length * 2);
  out.set(pcm);
  out.set(pcm, pcm.length);
  return out;
};

describe('the Standard set’s waterfall', () => {
  const roar = waterfallRoar(seeded(1));
  const babble = waterfallBabble(seeded(2));

  it('is two loops of unlike length, so that together they come round again only after minutes', () => {
    expect(roar.length).toBe(Math.round(ROAR_SECONDS * RATE));
    expect(babble.length).toBe(Math.round(BABBLE_SECONDS * RATE));
    expect(ROAR_SECONDS / BABBLE_SECONDS).not.toBeCloseTo(Math.round(ROAR_SECONDS / BABBLE_SECONDS), 1);
  });

  it('roars steadily, swelling and easing a little, with the babble well under it', () => {
    const half = levels(roar, 0.5);
    expect(spread(half)).toBeLessThan(6);
    expect(spread(half)).toBeGreaterThan(0.5); // not a machine's hiss
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b) / xs.length;
    expect(mean(levels(roar)) - mean(levels(babble))).toBeGreaterThan(10);
  });

  it('wraps round without a seam: no step in loudness, no click', () => {
    for (const pcm of [roar, babble]) {
      const round = levels(twice(pcm), 0.05);
      const wrap = Math.round(pcm.length / RATE / 0.05);
      const near = round.slice(wrap - 10, wrap + 10);
      expect(Math.abs(round[wrap] - round[wrap - 1])).toBeLessThan(4);
      expect(spread(near)).toBeLessThan(spread(round) + 0.01);
      let jump = 0;
      for (let i = 1; i < pcm.length; i++) jump = Math.max(jump, Math.abs(pcm[i] - pcm[i - 1]));
      expect(Math.abs(pcm[0] - pcm[pcm.length - 1])).toBeLessThanOrEqual(jump);
    }
  });

  it('is new water each time it is made', () => {
    expect(waterfallRoar(seeded(3)).slice(RATE, RATE + 100)).not.toEqual(roar.slice(RATE, RATE + 100));
  });

  it('is loudest beside it, easing to about a third at the edge of hearing', () => {
    expect(waterfallLevel(0)).toBe(1);
    expect(waterfallLevel(1)).toBe(1);
    expect(waterfallLevel(4)).toBeLessThan(1);
    expect(waterfallLevel(50)).toBeGreaterThan(0.3);
    expect(waterfallLevel(50)).toBeLessThan(0.45);
  });

  it('plays once as a few seconds of it, rising from silence and falling back to it', () => {
    const play = u3Effect('Waterfall', 1, 1, seeded(4))!;
    expect(play.length / RATE).toBeCloseTo(4, 1);
    expect(Math.abs(play[0])).toBe(0);
    expect(Math.abs(play[play.length - 1])).toBeLessThan(0.001);
  });

  it('never lowers the music, nor does a fountain; other long effects still do', () => {
    expect(ducks('watrfall', 4)).toBe(false);
    expect(ducks('fountain', 1)).toBe(false);
    expect(ducks('explode', 1)).toBe(true);
  });
});

describe('the Standard set’s fountain', () => {
  const splash = fountainSplash(seeded(5));
  const drops = fountainDroplets(seeded(6));
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b) / xs.length;

  it('is two loops of unlike length, as the waterfall is, so it never falls into a beat', () => {
    expect(splash.length).toBe(Math.round(SPLASH_SECONDS * RATE));
    expect(drops.length).toBe(Math.round(DROPLETS_SECONDS * RATE));
    expect(SPLASH_SECONDS / DROPLETS_SECONDS).not.toBeCloseTo(Math.round(SPLASH_SECONDS / DROPLETS_SECONDS), 1);
  });

  it('splashes softly, swelling and easing a little, its droplets under it - and quieter than a waterfall', () => {
    const half = levels(splash, 0.5);
    expect(spread(half)).toBeLessThan(6);
    expect(spread(half)).toBeGreaterThan(0.5);
    expect(mean(levels(splash)) - mean(levels(drops))).toBeGreaterThan(5);
    expect(mean(levels(waterfallRoar(seeded(1)))) - mean(levels(splash))).toBeGreaterThan(5);
  });

  it('wraps round without a seam: no step at the wrap greater than the water makes of itself', () => {
    for (const pcm of [splash, drops]) {
      const round = levels(twice(pcm), 0.05);
      const wrap = Math.round(pcm.length / RATE / 0.05);
      let step = 0;
      for (let i = 1; i < wrap; i++) step = Math.max(step, Math.abs(round[i] - round[i - 1]));
      expect(Math.abs(round[wrap] - round[wrap - 1])).toBeLessThanOrEqual(step);
      if (pcm === splash) expect(Math.abs(round[wrap] - round[wrap - 1])).toBeLessThan(4);
      let jump = 0;
      for (let i = 1; i < pcm.length; i++) jump = Math.max(jump, Math.abs(pcm[i] - pcm[i - 1]));
      expect(Math.abs(pcm[0] - pcm[pcm.length - 1])).toBeLessThanOrEqual(jump);
    }
  });

  it('is heard only close by: full beside it, under a tenth at the edge of hearing', () => {
    expect(fountainLevel(1)).toBe(1);
    expect(fountainLevel(4)).toBeLessThan(waterfallLevel(4));
    expect(fountainLevel(50)).toBeLessThan(0.1);
  });

  it('plays once as a few seconds of it, rising from silence and falling back to it', () => {
    const play = u3Effect('Fountain', 1, 1, seeded(7))!;
    expect(play.length / RATE).toBeCloseTo(4, 1);
    expect(Math.abs(play[0])).toBe(0);
    expect(Math.abs(play[play.length - 1])).toBeLessThan(0.001);
  });
});
