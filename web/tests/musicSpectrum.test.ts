import { describe, expect, it } from 'vitest';
import { measure } from '../tools/music/spectrum.ts';

const RATE = 44100;
const seconds = 6;
const tone = (hz: number): Float32Array =>
  Float32Array.from({ length: RATE * seconds }, (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / RATE));
/** White noise, from a fixed seed (mulberry32): the same power in every hertz, so each octave 3 dB above the one below. */
function white(): Float32Array {
  let a = 12345;
  const r = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Float32Array.from({ length: RATE * seconds }, () => (r() - 0.5) * 0.5);
}

describe('music measured for listening fatigue', () => {
  it('finds a tone where the ear is most sensitive all presence, and one below it none', () => {
    expect(measure(tone(3000), RATE).presence).toBeGreaterThan(-0.5);
    expect(measure(tone(400), RATE).presence).toBeLessThan(-40);
  });

  it('finds white noise tilting up three dB an octave, its loudness steady', () => {
    const m = measure(white(), RATE);
    expect(m.tilt).toBeCloseTo(3, 0);
    expect(m.range).toBeLessThan(1);
  });

  it('finds the harshest seconds harsher than the whole, where the presence comes and goes', () => {
    const [low, high] = [tone(300), tone(3000)];
    const mixed = Float32Array.from(low, (x, i) => (Math.floor(i / RATE) === 2 ? x + high[i] : x));
    const m = measure(mixed, RATE);
    expect(m.harshest).toBeGreaterThan(m.presence + 3);
  });
});
