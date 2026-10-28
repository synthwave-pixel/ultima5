import { describe, expect, it } from 'vitest';
import { standard } from '../src/audio/chip.ts';
import { u3Effect } from '../src/audio/chip3.ts';
import { RULES } from '../src/audio/effects.ts';
import { BANKED, NOTE_BANK } from '../src/audio/sfxKeys.ts';
import { bankScore, SCORES, sourceOf, VARIANTS } from '../tools/sfx/scores.ts';
import { UNIVERSAL } from '../tools/sfx/universal.ts';
import { bandsLoudest } from '../tools/sfx/check.ts';
import { levelSlice } from '../tools/sfx/render.ts';
import type { Stereo } from '../tools/music/pcm.ts';

/** How long an effect sounds now, in the Standard set (seconds); a very short one counts as 0.15 s. */
function now(key: string): number | null {
  if (key.startsWith('cue:')) {
    const pcm = u3Effect(key.slice(4));
    return pcm ? Math.max(0.15, pcm.length / 44100) : null;
  }
  const rule = RULES.find(([, , name]) => name === key);
  return rule ? Math.max(0.15, standard({ name: key }, rule[0], rule[1], () => 0.5).length / 44100) : null;
}

describe('the scores of the new suites', () => {
  it('scores every pitched effect the user named', () => {
    for (const k of ['spiritin', 'shrine1', 'chime', 'failure', 'cue:CombatStart', 'victory1', 'cue:Alarm'])
      expect(SCORES[k], k).toBeDefined();
    for (const k of ['fall', 'trapfall', 'cue:MountHorse', 'cue:Ouch', 'foefire']) expect(UNIVERSAL[k], k).toBeDefined();
    for (const f of ['harpsichord', 'lute'] as const) expect(bankScore(f, 60).notes.length).toBe(1);
  });

  it('keeps each effect about as long as it is now', () => {
    for (const key of Object.keys(SCORES)) {
      if (key === 'spiritin') continue;
      const was = now(key);
      if (was === null) continue;
      const ratio = SCORES[key](0).length / was;
      expect(ratio, `${key}: ${SCORES[key](0).length} s against ${was.toFixed(3)} s`).toBeGreaterThanOrEqual(0.8);
      expect(ratio, `${key}: ${SCORES[key](0).length} s against ${was.toFixed(3)} s`).toBeLessThanOrEqual(1.25);
    }
  });

  it('lets the apparition phrase run to about three and a half seconds', () => {
    const s = SCORES.spiritin(0);
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(3.6);
    expect(s.standout).toBe(true);
    for (const n of s.notes) expect(n.at + n.length).toBeLessThanOrEqual(s.length + 1e-9);
  });

  it('writes notes a synthesizer can play', () => {
    const scores = [
      ...Object.entries(SCORES).flatMap(([k, f]) => Array.from({ length: VARIANTS[k] ?? 1 }, (_, v) => f(v))),
      ...BANKED.flatMap((f) => [bankScore(f, NOTE_BANK.low), bankScore(f, NOTE_BANK.high)]),
    ];
    for (const s of scores) {
      expect(s.notes.length).toBeGreaterThan(0);
      for (const n of s.notes) {
        expect(n.program).toBeGreaterThanOrEqual(0);
        expect(n.program).toBeLessThanOrEqual(127);
        expect(n.note).toBeGreaterThanOrEqual(24);
        expect(n.note).toBeLessThanOrEqual(100);
        expect(n.velocity).toBeGreaterThanOrEqual(1);
        expect(n.velocity).toBeLessThanOrEqual(127);
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.length).toBeGreaterThan(0);
      }
    }
  });

  it('takes the sounds the user chose from one set for all three, and keeps some as Standard', () => {
    expect(sourceOf('victory1')).toBe('electronic');
    expect(sourceOf('cue:CombatStart')).toBe('electronic');
    expect(sourceOf('tickhigh')).toBe('electronic');
    expect(sourceOf('air')).toBe('electronic');
    expect(sourceOf('blackthorn2')).toBe('electronic');
    expect(sourceOf('spell3')).toBe('ambient');
    expect(sourceOf('chant:65')).toBe('ambient');
    for (const k of ['status', 'spiritin', 'raise', 'shrine1', 'shrine2', 'cue:Invocation']) expect(sourceOf(k), k).toBe('ambient');
    for (const k of ['drip0', 'cue:Upwards', 'cue:Downwards', 'denyhi', 'denylo']) expect(sourceOf(k), k).toBe('standard');
    expect(sourceOf('moongate')).toBeNull();
    expect(sourceOf('harpsichord:65')).toBeNull();
    // Kept as Standard, they have no score of their own.
    for (const k of ['drip0', 'cue:Upwards', 'cue:Downwards', 'denyhi', 'denylo', 'vanish']) expect(SCORES[k], k).toBeUndefined();
  });
});

describe('the sounds made once for every suite', () => {
  const r = (): number => 0.5;
  const stereo = (m: Float32Array): Stereo => [Float32Array.from(m), Float32Array.from(m)];

  it('are sound, and about as long as the moment they mark', () => {
    const lengths: Record<string, [number, number]> = {
      'cue:MountHorse': [0.4, 1],
      fall: [0.96, 1.5],
      trapfall: [0.82, 1.28],
      'cue:Ouch': [0.15, 0.3],
      foefire: [0.15, 0.3],
    };
    for (const [key, [lo, hi]] of Object.entries(lengths)) {
      const pcm = UNIVERSAL[key](r);
      expect(pcm.length / 44100, key).toBeGreaterThanOrEqual(lo);
      expect(pcm.length / 44100, key).toBeLessThanOrEqual(hi);
      expect(pcm.every(Number.isFinite), key).toBe(true);
      expect(
        pcm.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
        key,
      ).toBeGreaterThan(0.01);
    }
  });

  it("give a cactus and a monster's shot less brightness than today's", () => {
    for (const [key, today] of [
      ['cue:Ouch', u3Effect('Ouch')!],
      ['foefire', standard({ name: 'foefire' }, 'sweep', [750, 400, 5, 150], () => 0.5)],
    ] as const) {
      const was = stereo(today);
      const now = stereo(UNIVERSAL[key](r));
      levelSlice(was, -24);
      levelSlice(now, -24);
      expect(bandsLoudest(now).presence, key).toBeLessThan(bandsLoudest(was).presence - 3);
    }
  });
});
