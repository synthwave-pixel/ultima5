import { OfflineAudioContext } from 'node-web-audio-api';
import { describe, expect, it } from 'vitest';
import type { XmiSequence } from '../src/audio/xmi.ts';
import { playSfx } from '../tools/music/styles/engine.ts';

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
