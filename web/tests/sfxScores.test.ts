import { describe, expect, it } from 'vitest';
import { standard } from '../src/audio/chip.ts';
import { u3Effect } from '../src/audio/chip3.ts';
import { RULES } from '../src/audio/effects.ts';
import { BANKED, NOTE_BANK } from '../src/audio/sfxKeys.ts';
import { bankScore, SCORES, VARIANTS } from '../tools/sfx/scores.ts';

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
    for (const k of ['spiritin', 'shrine1', 'chime', 'failure', 'cue:CombatStart', 'vanish', 'victory1', 'trapfall', 'fall'])
      expect(SCORES[k], k).toBeDefined();
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
});
