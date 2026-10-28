import { describe, expect, it } from 'vitest';
import { u3Effect } from '../src/audio/chip3.ts';
import { menuSound } from '../src/game/menu.ts';
import { CUES } from '../src/dev/sfxCatalogue.ts';
import { UNIVERSAL } from '../tools/sfx/universal.ts';
import { newGame } from './helpers.ts';

/** The game's sound, recording what it is asked for. */
function recorded() {
  const { g, p } = newGame();
  const asked: string[] = [];
  p.sound = {
    ...p.sound,
    pulse: async (...a: number[]) => void asked.push(`pulse ${a.join(',')}`),
    cue: async (name: string) => void asked.push(`cue ${name}`),
  };
  return { g, asked };
}

describe('backing out of a menu', () => {
  it("is a tap of its own, not the healer's light", () => {
    const { g, asked } = recorded();
    g.options.soundChoice = 'classical';
    menuSound(g, 'back');
    expect(asked).toEqual(['cue Back']);
  });

  it("keeps the PC speaker's low note in Upgrade (2001)", () => {
    const { g, asked } = recorded();
    g.options.soundChoice = 'upgrade';
    menuSound(g, 'back');
    expect(asked).toEqual(['pulse 2300,1,18000,1,2']);
  });

  it('is very subtle: short and quiet', () => {
    const peak = (a: Float32Array): number => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    for (const tap of [u3Effect('Back')!, UNIVERSAL['cue:Back'](() => 0.5)]) {
      expect(tap.length / 44100).toBeLessThanOrEqual(0.08);
      expect(peak(tap)).toBeLessThanOrEqual(0.1);
      expect(peak(tap)).toBeGreaterThan(0.005);
    }
    expect(CUES.Back).toBeDefined();
  });
});
