import { PcSound } from '../src/ui/sound.ts';
import { describe, expect, it } from 'vitest';
import { identify } from '../src/audio/effects.ts';
import { standard } from '../src/audio/chip.ts';
import { CALIBRATION, noiseRuns, pulseRuns, runsLength, sweepRuns, toneRuns } from '../src/audio/speaker.ts';
import { newGame } from './helpers.ts';

describe('the PC speaker', () => {
  it('calibrates as ULTIMA_11b4 would at DOSBox speed', () => {
    expect(CALIBRATION).toBe(1318);
  });

  it('times the routines as their loops run', () => {
    // The chime: 2000 passes of the pulse loop.
    expect(runsLength(pulseRuns(3116, 1, 2000, 20000, -10))).toBeCloseTo(0.086, 2);
    // A bump: a 165 Hz tone for 200 waits.
    expect(runsLength(toneRuns(165, 200))).toBeCloseTo(0.176, 2);
    // The whirlpool's long sweep.
    expect(runsLength(sweepRuns(660, 150, 40, 7800))).toBeCloseTo(6.86, 1);
    expect(noiseRuns(800, 9600, 700).length).toBe(12);
  });
});

describe('effects', () => {
  const { g } = newGame();
  it('names calls as u5d does', () => {
    expect(identify(g.data.ovl, 'pulse', [5900, 1, 30000, 2000, 2])?.name).toBe('moongate');
    expect(identify(g.data.ovl, 'noise', [1, 25, 1000])?.name).toBe('step0');
    expect(identify(g.data.ovl, 'tone', [165, 200])?.name).toBe('blocked');
    const harp = g.data.ovl.words(0x2746, 10)[3];
    expect(identify(g.data.ovl, 'pulse', [harp, 1, 4000, 20000, -4])).toEqual({ name: 'harpsichord', note: 3 });
    expect(identify(g.data.ovl, 'pulse', [0xa50, 1, 200, 2050, 0])).toEqual({ name: 'gemshard', continued: true });
    expect(identify(g.data.ovl, 'pulse', [1234, 1, 5, 6, 7])).toBeNull();
  });

  it('gives every named effect a chip voice, quiet for the ones a turn repeats', () => {
    let seed = 1;
    const r = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const step = standard({ name: 'step0' }, 'noise', [1, 25, 1000], r);
    const gate = standard({ name: 'moongate' }, 'pulse', [5900, 1, 30000, 2000, 2], r);
    expect(peak(step)).toBeLessThanOrEqual(0.101); // the ultima3 port's footstep, at -20 dBFS
    expect(peak(step)).toBeLessThan(peak(gate) / 2); // well under a jingle
    expect(peak(gate)).toBeGreaterThan(0.15);
    expect(peak(gate)).toBeLessThan(1);
    expect([...step, ...gate].every(Number.isFinite)).toBe(true);
  });
});

/**
 * The ultima3 port's pace: an effect starts and the game goes on, a moment at most, where the DOS game stood still
 * while its speaker sounded; only a sound that is the timing (a tune note by note, a set piece) is waited out.
 */
describe('the pace of the effects', () => {
  const { g } = newGame();
  const sound = new PcSound(g.data.ovl);
  const timed = async (f: () => Promise<void>): Promise<number> => {
    const t = performance.now();
    await f();
    return performance.now() - t;
  };

  it('does not hold the game for a spell', async () => {
    // A first-circle spell's sparkle: over half a second on the speaker.
    expect(await timed(() => sound.noise(800, 9600, 700))).toBeLessThan(250);
  });

  it('waits out a tune played note by note', async () => {
    const harp = g.data.ovl.words(0x2746, 10)[3];
    expect(await timed(() => sound.pulse(harp, 1, 4000, 20000, -4))).toBeGreaterThan(40);
  });

  it('gives a spell the voice of the ultima3 port, folding its hums into it', () => {
    const r = (): number => 0.5;
    const spell = standard({ name: 'spell1' }, 'noise', [800, 9600, 700], r);
    const hum = standard({ name: 'cast', note: 1 }, 'pulse', [1, 1, 14000, 1, 1], r);
    expect(spell.length / 44100).toBeLessThan(0.6);
    expect(hum.length).toBeLessThanOrEqual(64);
  });

  it("knows both of a spell's hums as its cast sound, for every circle, and gives the second no voice of its own", () => {
    const { g } = newGame();
    const w = (at: number): number[] => g.data.words(at, 9);
    const step = w(0x4b2c).map((v) => (v << 16) >> 16);
    for (let n = 1; n <= 8; n++) {
      const [freq, dur] = [w(0x4af6)[n], n * 4000 + 10000];
      // castEffect's two calls: the hum rising, then falling.
      expect(identify(g.data, 'pulse', [freq, 1, dur, w(0x4b08)[n], step[n]]), `circle ${n}`).toEqual({ name: 'cast', note: n });
      const second = identify(g.data, 'pulse', [freq, 1, dur, w(0x4b1a)[n], -step[n]]);
      expect(second, `circle ${n}`).toEqual({ name: 'cast', note: n, continued: true });
      expect(standard(second, 'pulse', [freq, 1, dur, w(0x4b1a)[n], -step[n]], () => 0.5).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('a sound asked for while the sound is held', () => {
  it('is let go rather than kept for the moment the hold is lifted', async () => {
    const { g } = newGame();
    const sound = new PcSound(g.data.ovl);
    let started = 0;
    const ctx = {
      state: 'suspended',
      currentTime: 0,
      createBuffer: () => ({ copyToChannel: () => {} }),
      createBufferSource: () => ({ connect: () => {}, start: () => void started++ }),
    };
    const inner = sound as unknown as { ctx: unknown; out: unknown };
    inner.ctx = ctx;
    inner.out = {};
    await sound.cue('DoorOpen');
    expect(started).toBe(0); // the clock is frozen: a sound would wait there to sound with the rest
    ctx.state = 'running';
    await sound.cue('DoorOpen');
    expect(started).toBe(1);
  });
});
