/**
 * effects.ts
 *
 * Which effect a call of the four speaker routines is, by its arguments:
 * u5d's table (audio/sfx_map.h) and its families (audio/aud_sfx.c), so
 * the Standard sound can give each its own voice. The game calls the
 * routines with numbers, not names.
 */

/** Anything with DATA.OVL's words, where the families' tables are. */
export interface WordSource {
  words(address: number, count: number): number[];
}

export type Kind = 'pulse' | 'noise' | 'tone' | 'sweep';

/** An effect named: its name, and for a family its note (0 up) within it. */
export interface Effect {
  name: string;
  note?: number;
  /** For a run of calls that u5d plays as one sound: this is not its first call. */
  continued?: boolean;
}

/** u5d's rules: routine, arguments, name. */
export const RULES: [Kind, number[], string][] = [
  ['pulse', [3116, 1, 2000, 20000, -10], 'chime'],
  ['pulse', [5900, 1, 30000, 2000, 2], 'moongate'],
  ['pulse', [4050, 1, 65000, 1, 1], 'sceptre'],
  ['pulse', [2800, 1, 13000, 100, 5], 'blackapp'],
  ['pulse', [9800, 1, 28000, 1000, 2], 'absorb'],
  ['pulse', [5200, 1, 50000, 5000, 1], 'sceptuse'],
  ['pulse', [4480, 1, 65000, 300, 1], 'artifact'],
  ['pulse', [2760, 1, 12000, 500, 5], 'summon'],
  ['pulse', [10400, 1, 30000, 2000, 2], 'shadowin'],
  ['pulse', [3100, 1, 30000, 1000, 2], 'possess'],
  ['pulse', [2760, 1, 5000, 1000, 15], 'gatein'],
  ['pulse', [8800, 1, 40000, 5000, 1], 'revive'],
  ['pulse', [5200, 1, 50000, 10000, 1], 'endmoon'],
  ['pulse', [2620, 1, 10000, 2500, 6], 'spiritin'],
  ['pulse', [5500, 1, 5000, 200, 13], 'raise'],
  ['pulse', [4110, 1, 22500, 5000, 1], 'shop0'],
  ['pulse', [4530, 1, 40000, 1, 1], 'shop1'],
  ['pulse', [2300, 1, 18000, 1, 2], 'shop2'],
  ['pulse', [6600, 1, 60000, 2000, 1], 'air'],
  ['pulse', [4600, 1, 10800, 300, 6], 'victory1'],
  ['pulse', [6100, 1, 21600, 300, 3], 'victory2'],
  ['noise', [10, 1600, 2000], 'damage'],
  ['noise', [40, 3000, 500], 'burst1'],
  ['noise', [10, 3000, 2000], 'burst2'],
  ['noise', [20, 60, 10000], 'watrfall'],
  ['noise', [10, 30, 25000], 'fountain'],
  ['noise', [1, 25, 1000], 'step0'],
  ['noise', [1, 25, 1500], 'step1'],
  ['noise', [1, 7000, 600], 'regurgit'],
  ['noise', [1, 500, 20000], 'shock'],
  ['noise', [1, 50, 3500], 'status'],
  ['noise', [1, 1200, 4000], 'introhit'],
  ['noise', [100, 2000, 300], 'shiphit'],
  ['noise', [1, 15, 20000], 'dunstep0'],
  ['noise', [1, 11, 20000], 'dunstep1'],
  ['noise', [1, 7, 20000], 'dunstep2'],
  ['noise', [1, 3, 20000], 'dunstep3'],
  ['noise', [800, 9600, 700], 'spell1'],
  ['noise', [800, 11200, 700], 'spell2'],
  ['noise', [800, 12800, 700], 'spell3'],
  ['noise', [800, 14400, 700], 'spell4'],
  ['noise', [800, 16000, 700], 'spell5'],
  ['noise', [800, 17600, 700], 'spell6'],
  ['noise', [800, 19200, 700], 'spell7'],
  ['noise', [800, 20800, 700], 'spell8'],
  ['tone', [3000, 3], 'tickhigh'],
  ['tone', [2000, 3], 'ticklow'],
  ['tone', [165, 200], 'blocked'],
  ['tone', [220, 150], 'denyhi'],
  ['tone', [150, 150], 'denylo'],
  ['sweep', [1200, 2000, 1, 40], 'vanish'],
  ['sweep', [800, 2000, 1, 50], 'failure'],
  ['sweep', [1000, 200, 5, 300], 'cannon'],
  ['sweep', [750, 400, 5, 150], 'foefire'],
  ['sweep', [1300, 300, 5, 100], 'launch'],
  ['sweep', [400, 750, 5, 150], 'attack'],
  ['sweep', [660, 150, 40, 7800], 'whirl'],
  ['sweep', [2500, 800, 1, 300], 'fall'],
  ['sweep', [3200, 3500, 1, 20], 'drip0'],
  ['sweep', [1000, 250, 40, 30000], 'trapfall'],
  ['noise', [19, 16000, 150], 'shake'],
  ['sweep', [3200, 3500, 1, 12], 'drip0'],
  ['sweep', [3200, 3500, 1, 4], 'drip0'],
];

/** The families u5d names by table: their notes' words in DATA.OVL. */
export const FAMILIES = ['harpsichord', 'lute', 'cast', 'blackthorn', 'chant', 'apparition'] as const;

/** The runs of calls u5d plays as one sound (a pitch held while the width sweeps). */
const RUNS: [number, number, string][] = [
  [0xa50, 200, 'gemshard'],
  [0xa8c, 200, 'shrine1'],
  [0xc1c, 0x96, 'shrine2'],
];

const same = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** The effect a call is (AUDIO_Dispatch*), or null if u5d has no name for it. */
export function identify(data: WordSource, kind: Kind, args: number[]): Effect | null {
  if (kind === 'pulse') {
    const [freq, delay, dur, width, inc] = args;
    if (delay === 1) {
      for (const [f, d, name] of RUNS) {
        if (freq === f && dur === d && inc === 0 && width >= 2000 && width <= 25000) return { name, continued: width !== 2000 };
      }
      const family = (name: string, freqs: number, n: number, match: (i: number) => boolean): Effect | null => {
        const words = data.words(freqs, n);
        for (let i = 0; i < n; i++) if (words[i] === freq && match(i)) return { name, note: i };
        return null;
      };
      const hit =
        family('harpsichord', 0x2746, 10, () => dur === 4000 && width === 20000 && inc === -4) ??
        family('lute', 0x6a36, 9, () => dur === 2000 && width === 20000 && inc === -10) ??
        family(
          'cast',
          0x4af6,
          9,
          (i) => i >= 1 && dur === i * 4000 + 10000 && width === data.words(0x4b08, 9)[i] && inc === signed(data.words(0x4b2c, 9)[i]),
        ) ??
        family(
          'blackthorn',
          0x3720,
          6,
          (i) => dur === data.words(0x372c, 6)[i] && width === data.words(0x3738, 6)[i] && inc === signed(data.words(0x3744, 6)[i]),
        ) ??
        family(
          'chant',
          0x4be6,
          7,
          (i) => dur === data.words(0x4bf4, 7)[i] && width === data.words(0x4c02, 7)[i] && inc === signed(data.words(0x4c10, 7)[i]),
        ) ??
        family('apparition', 0x3a26, 6, () => dur === 5000 && width === 200 && inc === 0xd);
      if (hit) return hit;
      // A spell's second hum (CAST2's): the first's note, its other width, its step the other way - the rest of the
      // one 'cast' sound, which the Standard set folds into the spell's (chip.ts), not a sound of its own.
      const after = family(
        'cast',
        0x4af6,
        9,
        (i) => i >= 1 && dur === i * 4000 + 10000 && width === data.words(0x4b1a, 9)[i] && inc === -signed(data.words(0x4b2c, 9)[i]),
      );
      if (after) return { ...after, continued: true };
    }
  }
  for (const [k, params, name] of RULES) if (k === kind && same(params, args)) return { name };
  return null;
}

const signed = (w: number): number => (w << 16) >> 16;
