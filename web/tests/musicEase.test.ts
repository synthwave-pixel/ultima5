import { describe, expect, it } from 'vitest';
import { CAP, eased, easeToTarget, TARGET } from '../tools/music/ease.ts';
import type { Stereo } from '../tools/music/pcm.ts';
import { measure } from '../tools/music/spectrum.ts';

const RATE = 44100;
const tone = (hz: number, level = 0.3): Float32Array =>
  Float32Array.from({ length: RATE * 6 }, (_, i) => level * Math.sin((2 * Math.PI * hz * i) / RATE));
const stereo = (x: Float32Array): Stereo => [x, Float32Array.from(x)];
const rms = (x: Float32Array): number => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
const dB = (a: number, b: number): number => 20 * Math.log10(a / b);

describe('music eased for hearing over and over', () => {
  it('dips where the ear is most sensitive by as much as asked, leaving the bass and the middle', () => {
    const at = (hz: number): number => dB(rms(eased(stereo(tone(hz)), RATE, 6)[0].slice(RATE)), rms(tone(hz).slice(RATE)));
    expect(at(3200)).toBeCloseTo(-6, 0);
    expect(at(110)).toBeCloseTo(0, 1);
    expect(at(500)).toBeGreaterThan(-0.6);
  });

  it('leaves a render already within its target untouched', () => {
    const soft = stereo(Float32Array.from(tone(220), (x, i) => x + 0.002 * Math.sin((2 * Math.PI * 3000 * i) / RATE)));
    expect(easeToTarget(soft, RATE)).toEqual({ pcm: soft, dip: 0, over: false });
  });

  it('eases a bright render only as deep as brings it to its target', () => {
    const bright = stereo(Float32Array.from(tone(220), (x, i) => x + 0.06 * Math.sin((2 * Math.PI * 3000 * i) / RATE)));
    const { pcm, dip, over } = easeToTarget(bright, RATE);
    expect(over).toBe(false);
    expect(dip).toBeGreaterThan(0);
    expect(measure(pcm[0], RATE).presence).toBeLessThanOrEqual(TARGET.presence);
    expect(measure(eased(bright, RATE, dip - 1)[0], RATE).presence).toBeGreaterThan(TARGET.presence);
  });

  it('stops at its cap, and says so, where the equalizer is not enough', () => {
    const harsh = stereo(tone(3000));
    expect(easeToTarget(harsh, RATE)).toMatchObject({ dip: CAP, over: true });
  });
});
