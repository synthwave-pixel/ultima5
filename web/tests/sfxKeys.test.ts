import { describe, expect, it } from 'vitest';
import { pulseShape } from '../src/audio/chip.ts';
import { identify } from '../src/audio/effects.ts';
import { BANK_TRANSPOSE, NOTE_BANK, sfxKey } from '../src/audio/sfxKeys.ts';
import { newGame } from './helpers.ts';

describe("the new suites' effect keys", () => {
  const { g } = newGame();

  it("folds the apparition notes, the second victory note and a spell's hums", () => {
    expect(sfxKey({ name: 'apparition', note: 2 }, 'pulse', [1000, 1, 5000, 200, 0xd])).toBe('silent');
    expect(sfxKey({ name: 'victory2' }, 'pulse', [6100, 1, 21600, 300, 3])).toBe('silent');
    expect(sfxKey({ name: 'cast', note: 3 }, 'pulse', [1000, 1, 22000, 300, 3])).toBe('silent');
    expect(sfxKey({ name: 'gemshard', continued: true }, 'pulse', [0xa50, 1, 200, 2050, 0])).toBe('silent');
  });

  it("folds the old man's long tone after each member's flash into his blessing: no chip's tone in a suite", () => {
    const flash = [5500, 1, 5000, 200, 13];
    const tone = [5500, 1, 60000, 2500, 1];
    expect(sfxKey(identify(g.data, 'pulse', flash), 'pulse', flash)).toEqual({ key: 'raise' });
    expect(sfxKey(identify(g.data, 'pulse', tone), 'pulse', tone)).toBe('silent');
  });

  it('banks a harpsichord key at its own pitch, two octaves down', () => {
    for (const [i, f] of g.data.ovl.words(0x2746, 10).entries()) {
      const args = [f, 1, 4000, 20000, -4];
      const key = sfxKey({ name: 'harpsichord', note: i }, 'pulse', args);
      if (!key || key === 'silent') throw new Error(`harpsichord ${i}: ${String(key)}`);
      const m = Number(key.key.split(':')[1]);
      expect(key.key).toBe(`harpsichord:${m}`);
      expect(m).toBeGreaterThanOrEqual(NOTE_BANK.low);
      expect(m).toBeLessThanOrEqual(NOTE_BANK.high);
      expect(key.hz).toBeCloseTo(pulseShape(args).hz * BANK_TRANSPOSE, 6);
      expect(Math.abs(12 * Math.log2(key.hz! / 440) + 69 - m)).toBeLessThanOrEqual(0.5);
    }
  });

  it("names Blackthorn's notes and every other effect by name", () => {
    expect(sfxKey({ name: 'blackthorn', note: 4 }, 'pulse', [1, 1, 1, 1, 1])).toEqual({ key: 'blackthorn4' });
    expect(sfxKey({ name: 'moongate' }, 'pulse', [5900, 1, 30000, 2000, 2])).toEqual({ key: 'moongate' });
  });

  it('leaves an unnamed call to the shared voice', () => {
    expect(sfxKey(null, 'pulse', [1234, 1, 5, 6, 7])).toBeNull();
  });
});
