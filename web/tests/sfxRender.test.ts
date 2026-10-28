import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import type { XmiSequence } from '../src/audio/xmi.ts';
import { playSfx } from '../tools/music/styles/engine.ts';
import { bandsLoudest, checkSuite, loudest, LIMITS } from '../tools/sfx/check.ts';
import { finish, layOutAtlas, levelSlice, tame, toSequence } from '../tools/sfx/render.ts';
import type { Stereo } from '../tools/music/pcm.ts';

/** Notes as a sequence: each `[at, program, note, length]` on a channel of its own. */
function notes(...ns: [number, number, number, number][]): XmiSequence {
  const events: XmiSequence['events'] = [];
  ns.forEach(([at, program, note, length], channel) => {
    events.push({ time: 0, kind: 'program', channel, program });
    events.push({ time: at, kind: 'on', channel, note, velocity: 100 });
    events.push({ time: at + length, kind: 'off', channel, note });
  });
  events.sort((a, b) => a.time - b.time);
  return { events, length: Math.max(...ns.map(([at, , , l]) => at + l)) };
}

describe("the Electronic suite's voice", () => {
  it("plays an effect's notes on the Electronic voices", async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const base = ctx as unknown as BaseAudioContext;
    playSfx(base, base.destination, notes([0, 14, 72, 0.3], [0.5, 47, 43, 0.3]));
    const left = (await ctx.startRendering()).getChannelData(0);
    const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(left.every(Number.isFinite)).toBe(true);
    expect(peak(left)).toBeGreaterThan(0.01);
    expect(peak(left)).toBeLessThan(1);
    expect(peak(left.subarray(22050))).toBeGreaterThan(0.005);
  });
});

const RATE = 44100;
const sine = (seconds: number, amp: number, hz = 440): Stereo => {
  const a = Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
  return [a, Float32Array.from(a)];
};
const peakOf = (pcm: Stereo): number => Math.max(...pcm.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));

describe('the render of the suites', () => {
  it('turns a score into a sequence with a program per channel', () => {
    const seq = toSequence({
      length: 1,
      notes: [
        { at: 0, note: 60, length: 0.5, velocity: 90, program: 46 },
        { at: 0.2, note: 64, length: 0.5, velocity: 90, program: 48 },
        { at: 0.4, note: 67, length: 0.5, velocity: 90, program: 46 },
      ],
    });
    const programs = seq.events.filter((e) => e.kind === 'program');
    expect(programs.map((e) => (e.kind === 'program' ? e.program : -1)).sort()).toEqual([46, 48]);
    expect(new Set(programs.map((e) => e.channel)).size).toBe(2);
    for (const p of programs) {
      const first = seq.events.find((e) => e.channel === p.channel);
      expect(first).toBe(p);
    }
    expect(seq.events.filter((e) => e.kind === 'on')).toHaveLength(3);
    expect(seq.events.filter((e) => e.kind === 'off')).toHaveLength(3);
  });

  it('levels a slice by its loudest moment, under the peak', () => {
    const pcm = sine(0.5, 0.5);
    levelSlice(pcm, -24);
    expect(loudest(pcm, RATE)).toBeCloseTo(-24, 1);
    expect(peakOf(pcm)).toBeLessThanOrEqual(Math.pow(10, -1 / 20) + 1e-6);
  });

  it('ends a slice faded, half a second past its length at most', () => {
    const out = finish(sine(3, 0.5), 1);
    expect(out[0].length).toBe(Math.round(1.5 * RATE));
    expect(Math.abs(out[0][out[0].length - 1])).toBeLessThan(0.001);
    const short = finish(sine(0.4, 0.5), 1);
    expect(short[0].length).toBe(Math.round(0.4 * RATE));
  });

  it('keeps beside a slice how long its sound is, without the ring after it', () => {
    const { slices } = layOutAtlas([{ key: 'tick', pcm: sine(0.65, 0.1), nominal: 0.15 }]);
    expect(slices.tick[0][0]).toBe(0);
    expect(slices.tick[0][1]).toBeCloseTo(0.65, 6);
    expect(slices.tick[0][2]).toBe(0.15);
  });

  it('lays slices end to end with gaps and says where each is', () => {
    const { pcm, slices } = layOutAtlas([
      { key: 'a', pcm: sine(0.5, 0.1) },
      { key: 'b', pcm: sine(0.25, 0.1) },
      { key: 'a', pcm: sine(0.3, 0.1) },
    ]);
    expect(slices.a[0]).toEqual([0, 0.5]);
    expect(slices.b[0][0]).toBeCloseTo(0.6, 6);
    expect(slices.b[0][1]).toBeCloseTo(0.25, 6);
    expect(slices.a[1][0]).toBeCloseTo(0.95, 6);
    expect(pcm[0].length).toBeGreaterThanOrEqual(Math.round(1.25 * RATE));
  });

  it('fails a slice louder than the rule allows', () => {
    const loud = sine(0.5, 0.25); // about -15 dBFS RMS
    const fine = sine(0.5, 0.25);
    levelSlice(fine, LIMITS.everyday - 1);
    const failures = checkSuite('classical', [
      { key: 'loud', pcm: loud, standout: false },
      { key: 'fine', pcm: fine, standout: false },
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('loud');
  });

  it("fails a slice whose highs stand louder above the music's than the rule allows", () => {
    // Quiet enough overall, but all of it at 3 kHz, where the music at its default level has little.
    const bright = sine(0.5, 0.25, 3000);
    levelSlice(bright, LIMITS.everyday - 1);
    const warm = sine(0.5, 0.25, 220);
    levelSlice(warm, LIMITS.everyday - 1);
    const music = { presence: LIMITS.everyday - 20, sibilance: LIMITS.everyday - 30 };
    const failures = checkSuite(
      'classical',
      [
        { key: 'bright', pcm: bright, standout: false },
        { key: 'warm', pcm: warm, standout: false },
      ],
      music,
    );
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.every((f) => f.includes('bright'))).toBe(true);
    expect(failures.some((f) => f.includes('2-5 kHz'))).toBe(true);
  });

  it('tames a slice whose highs break the rule until they pass, its loudness kept', () => {
    // A bright square at 600 Hz: its harmonics fill 2-10 kHz.
    const sq = Float32Array.from({ length: RATE / 2 }, (_, i) => (Math.sin((2 * Math.PI * 600 * i) / RATE) >= 0 ? 0.3 : -0.3));
    const pcm: Stereo = [sq, Float32Array.from(sq)];
    levelSlice(pcm, -24);
    const music = { presence: -45, sibilance: -55 };
    const before = bandsLoudest(pcm);
    expect(before.presence).toBeGreaterThan(music.presence + 6);
    const out = tame(pcm, music, 6, -24);
    const after = bandsLoudest(out);
    expect(after.presence).toBeLessThanOrEqual(music.presence + 6 + 0.05);
    expect(after.sibilance).toBeLessThanOrEqual(music.sibilance + 6 + 0.05);
    expect(loudest(out)).toBeCloseTo(-24, 0);
  });

  it('leaves a slice that passes as it is', () => {
    const pcm = sine(0.5, 0.25, 220);
    levelSlice(pcm, -24);
    expect(tame(pcm, { presence: -45, sibilance: -55 }, 6, -24)).toBe(pcm);
  });
});
