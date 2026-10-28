/**
 * scores.ts
 *
 * The effects of the three new suites (src/audio/sfxKeys.ts), each written
 * once as a few notes on General MIDI instruments and rendered by every
 * suite's own renderer (render.ts): Classical plays the programs through
 * MuseScore General, Ambient through remaster.ts's voices, Electronic
 * through engine.ts's playSfx - so one score is the same gesture in three
 * soundtracks' sounds.
 *
 * What an effect was, it stays: the melodies the Standard set gave them
 * (chip3.ts: the spells' climb onto D major, Blackthorn's theme, Rule
 * Britannia at the sceptre and at the end, the laments, the heals' chords)
 * are kept, moved down into the middle of the instruments' range where they
 * sat high; a sweep becomes a run of notes over its span; each lasts about
 * as long as it does now. Nothing is written above C6, little above C5, and
 * the instruments are the soft ones - strings, harp, horn, clarinet,
 * bassoon, cello, timpani, bells struck low.
 *
 * The apparition's arrival (spiritin) is the opening of the castle's tune
 * (MONARCH.XMI, Rule Britannia in F minor), a little quicker, ending on F
 * major: about three and a half seconds, the end ringing on under the
 * reveal while the game waits its 1.7 s as before.
 */

import { BANKED } from '../../src/audio/sfxKeys.ts';

export interface SfxNote {
  at: number;
  note: number;
  length: number;
  velocity: number;
  program: number;
}

export interface Score {
  length: number;
  notes: SfxNote[];
  /** A moment meant to stand out (a victory, the apparition, a shrine): levelled louder (render.ts). */
  standout?: boolean;
}

/** General MIDI programs. */
const P = {
  piano: 0,
  celesta: 8,
  vibes: 11,
  marimba: 12,
  bells: 14,
  harpsichord: 6,
  nylon: 24,
  strings: 48,
  slow: 49,
  choir: 52,
  cello: 42,
  bass: 43,
  pizz: 45,
  harp: 46,
  timp: 47,
  horn: 60,
  oboe: 68,
  bassoon: 70,
  clarinet: 71,
  flute: 73,
} as const;

const note = (at: number, n: number, length: number, program: number, velocity = 90): SfxNote => ({
  at,
  note: n,
  length,
  velocity,
  program,
});
const chord = (at: number, ns: number[], length: number, program: number, velocity = 80): SfxNote[] =>
  ns.map((n) => note(at, n, length, program, velocity));
/** Notes one after another, `step` apart, each held a little over its step; the last held `last`. */
const run = (at: number, ns: number[], step: number, program: number, velocity = 85, last = step * 1.5): SfxNote[] =>
  ns.map((n, i) => note(at + i * step, n, i === ns.length - 1 ? last : step * 1.5, program, velocity));
/** A chord spread upward, a harp's: `step` between its notes, each held to `until`. */
const spread = (at: number, ns: number[], step: number, until: number, program: number = P.harp, velocity = 75): SfxNote[] =>
  ns.map((n, i) => note(at + i * step, n, Math.max(0.05, until - at - i * step), program, velocity));
/** A score of `length`: every note cut to end within it. */
const score = (length: number, parts: (SfxNote | SfxNote[])[], standout = false): Score => ({
  length,
  notes: parts.flat().map((n) => ({ ...n, length: Math.max(0.02, Math.min(n.length, length - n.at)) })),
  ...(standout ? { standout } : {}),
});

/** Rule Britannia's opening (chip3.ts BRITANNIA), in F. */
const BRITANNIA = [60, 65, 65, 65, 67, 69, 70, 72];
/** Blackthorn's theme (chip3.ts BLACKTHORN), an octave down. */
const BLACKTHORN = [55, 55, 57, 55, 58, 57];
/** A spell of `circle`'s length (chip3.ts spell). */
const spellLength = (circle: number): number => 0.55 * Math.pow(1.5 / 0.55, (circle - 1) / 7);

/** A spell: a soft bloom on D, the circle's notes climbing through D minor, and D major at the top. */
function spell(circle: number, variant: number): Score {
  const length = spellLength(circle);
  const climb = [50, 53, 57, 60, 62, 65, 69, 74].slice(8 - Math.min(8, circle + 1));
  const lead = [P.harp, P.pizz, P.celesta][variant % 3];
  const step = Math.min(0.09, (length * 0.55) / climb.length);
  const top = 0.05 + climb.length * step;
  return score(length, [
    chord(0, [38, 45], length, P.slow, 60),
    note(0, 38, 0.4, P.timp, 50 + variant * 6),
    run(0.05, climb, step, lead, 80),
    chord(top, [50, 54, 57, 62], length - top, P.strings, 75),
    spread(top, [62, 66, 69], 0.03, length, P.harp, 70),
  ]);
}

/** The apparition's arrival: the castle's tune (MONARCH, F minor), its opening at 0.72 of its time, ending on F major. */
function apparition(): Score {
  const t = (s: number): number => s * 0.72;
  const melody: [number, number, number][] = [
    [60, 0.01, 0.4],
    [65, 0.38, 0.8],
    [65, 1.18, 0.8],
    [65, 1.98, 0.2],
    [67, 2.18, 0.2],
    [68, 2.38, 0.2],
    [70, 2.58, 0.2],
    [72, 2.78, 0.4],
    [65, 3.18, 0.4],
    [67, 3.58, 0.28],
  ];
  const end = t(3.86);
  const length = 3.4;
  return score(
    length,
    [
      melody.map(([n, at, len]) => note(t(at), n, t(len) * 1.1, P.strings, 100)),
      note(end, 65, length - end, P.strings, 100),
      // A timpani roll into the first beat, F.
      [0, 0.05, 0.1, 0.15, 0.2].map((at, i) => note(at, 41, 0.1, P.timp, 50 + i * 10)),
      note(t(0.38), 41, 0.6, P.timp, 100),
      // The harp's chords: F minor, B-flat minor, F minor, C, F major.
      spread(t(0.38), [53, 56, 60, 65], 0.05, t(1.18)),
      spread(t(1.18), [53, 58, 61, 65], 0.05, t(1.98)),
      spread(t(1.98), [53, 56, 60, 65], 0.05, t(3.58)),
      spread(t(3.58), [48, 52, 55, 60], 0.04, end),
      spread(end, [53, 57, 60, 65, 69], 0.05, length, P.harp, 85),
      // The bass under them, and the strings' F major held at the end.
      [
        note(t(0.38), 41, t(0.8), P.cello, 80),
        note(t(1.18), 46, t(0.8), P.cello, 80),
        note(t(1.98), 41, t(1.6), P.cello, 80),
        note(t(3.58), 36, t(0.28), P.cello, 80),
        note(end, 41, length - end, P.cello, 85),
      ],
      chord(end, [53, 57, 60], length - end, P.slow, 75),
    ],
    true,
  );
}

/** Each effect's score, by its key (sfxKeys.ts); `variant` for the ones rendered several ways (VARIANTS). */
export const SCORES: Record<string, (variant: number) => Score> = {
  // --- Every turn ---
  tickhigh: (v) => score(0.15, [[note(0, 72, 0.12, P.marimba, [60, 70, 65][v % 3])]]),
  ticklow: (v) => score(0.15, [[note(0, 67, 0.12, P.marimba, [60, 70, 65][v % 3])]]),
  denyhi: (v) => score(0.17, [run(0, [69, 64], 0.06, P.pizz, [80, 90, 85][v % 3], 0.11)]),
  denylo: (v) => score(0.19, [run(0, [64, 59], 0.06, P.pizz, [80, 90, 85][v % 3], 0.13)]),
  // --- Combat ---
  victory1: () =>
    score(
      0.9,
      [run(0, [55, 59, 62, 67, 71], 0.1, P.horn, 95, 0.5), chord(0.4, [43, 50, 55], 0.5, P.strings, 85), [note(0.4, 43, 0.4, P.timp, 90)]],
      true,
    ),
  vanish: () => score(0.18, [run(0, [67, 71, 74], 0.035, P.harp, 70, 0.11)]),
  failure: () => score(0.25, [[note(0, 58, 0.09, P.bassoon, 85)], run(0.09, [57, 52, 48, 45], 0.04, P.pizz, 80, 0.06)]),
  // --- Magic ---
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`spell${i + 1}`, (v: number) => spell(i + 1, v)])),
  summon: () =>
    score(0.96, [[note(0, 36, 0.5, P.timp, 95)], chord(0.06, [48, 52, 55, 60], 0.9, P.slow, 85), spread(0.06, [60, 64, 67], 0.06, 0.96)]),
  gatein: () =>
    score(0.96, [[note(0, 33, 0.5, P.timp, 95)], chord(0.06, [45, 48, 52, 57], 0.9, P.slow, 85), spread(0.06, [57, 60, 64], 0.06, 0.96)]),
  possess: () => score(0.8, [chord(0, [45, 46], 0.8, P.slow, 80), [note(0, 33, 0.8, P.bass, 75)]]),
  absorb: () => score(0.75, [run(0, [43, 42, 40, 38, 36], 0.12, P.bass, 85, 0.27), [note(0, 31, 0.4, P.timp, 70)]]),
  air: () =>
    score(1.24, [
      run(0, [48, 53, 55, 56, 58, 55], 0.14, P.clarinet, 85),
      chord(0.84, [52, 40], 0.4, P.bassoon, 85),
      chord(0.84, [40], 0.4, P.cello, 70),
    ]),
  moongate: () =>
    score(1.1, [chord(0, [57, 64], 1.1, P.slow, 75), spread(0.15, [57, 60, 64, 69, 72], 0.12, 1.1), [note(0, 33, 1.1, P.bass, 55)]]),
  // --- The story's set pieces ---
  spiritin: () => apparition(),
  raise: () => score(0.86, [run(0, [62, 66, 69, 74], 0.12, P.horn, 90, 0.5), chord(0.36, [50, 57, 62], 0.5, P.strings, 80)], true),
  revive: () =>
    score(
      0.98,
      [run(0, [60, 64, 67, 72], 0.045, P.harp, 80), run(0.18, BRITANNIA, 0.1, P.strings, 90), chord(0.18, [41, 53], 0.8, P.cello, 70)],
      true,
    ),
  endmoon: () =>
    score(
      1.86,
      [
        run(0, BRITANNIA, 0.16, P.horn, 95, 0.58),
        chord(0, [41, 53, 57, 60], 0.32, P.slow, 75),
        chord(0.32, [46, 50, 53, 58], 0.48, P.slow, 75),
        chord(0.8, [48, 52, 55, 60], 0.48, P.slow, 75),
        chord(1.28, [41, 53, 57, 60], 0.58, P.slow, 80),
        spread(1.28, [53, 57, 60, 65], 0.05, 1.86),
      ],
      true,
    ),
  sceptre: () =>
    score(0.72, [run(0, [72, 69, 70, 67], 0.1, P.flute, 90), [note(0.4, 65, 0.32, P.flute, 90)], spread(0.4, [53, 57, 60], 0.04, 0.72)]),
  sceptuse: () => score(0.86, [run(0, BRITANNIA, 0.07, P.horn, 90, 0.37), run(0, [41, 48, 53], 0.18, P.cello, 80, 0.5)]),
  artifact: () =>
    score(
      1.6,
      [
        chord(0, [53, 57, 60, 65], 0.45, P.slow, 80),
        chord(0.45, [58, 62, 65, 70], 0.45, P.slow, 80),
        chord(0.9, [53, 57, 60, 65, 69], 0.7, P.slow, 85),
        spread(0, [53, 57, 60, 65], 0.05, 0.45),
        spread(0.45, [58, 62, 65, 70], 0.05, 0.9),
        spread(0.9, [53, 57, 60, 65, 69], 0.05, 1.6),
      ],
      true,
    ),
  blackapp: () =>
    score(1.02, [
      run(0, BLACKTHORN.slice(0, 3), 0.14, P.clarinet, 90),
      chord(0.42, [43, 46, 50, 55], 0.6, P.slow, 85),
      [note(0.42, 31, 0.6, P.bass, 75)],
    ]),
  shadowin: () =>
    score(0.85, [
      run(
        0,
        BLACKTHORN.map((n) => n - 5),
        0.14,
        P.cello,
        90,
      ),
      [note(0, 31, 0.85, P.bass, 70)],
    ]),
  ...Object.fromEntries(
    BLACKTHORN.map((n, i) => [`blackthorn${i}`, () => score(0.22, [[note(0, n, 0.2, P.clarinet, 95), note(0, n - 12, 0.2, P.cello, 75)]])]),
  ),
  gemshard: () =>
    score(
      0.85,
      [
        run(0, [59, 66, 66, 67], 0.12, P.clarinet, 85),
        [note(0.48, 66, 0.37, P.clarinet, 85)],
        chord(0, [47, 54], 0.85, P.slow, 65),
        [note(0.1, 71, 0.7, P.vibes, 40)],
      ],
      true,
    ),
  shrine1: () => score(1.2, [chord(0, [45, 57, 60, 64], 1.2, P.slow, 80), spread(0.1, [57, 60, 64, 69], 0.1, 1.2)], true),
  shrine2: () => score(1.0, [chord(0, [43, 55, 59, 62], 1.0, P.slow, 80), spread(0.1, [55, 59, 62, 67], 0.1, 1.0)], true),
  status: () =>
    score(1.69, [
      (
        [
          [67, 0.16, 70],
          [64, 0.16, 66],
          [65, 0.18, 60],
          [62, 0.2, 54],
          [64, 0.22, 46],
          [60, 0.28, 38],
          [55, 0.49, 30],
        ] as const
      ).reduce<{ at: number; notes: SfxNote[] }>(
        (acc, [n, d, v]) => ({ at: acc.at + d, notes: [...acc.notes, note(acc.at, n, d * 1.3, P.harp, v)] }),
        { at: 0, notes: [] },
      ).notes,
      chord(0, [48, 55], 1.69, P.slow, 45),
    ]),
  // --- Shops ---
  shop0: () => score(0.5, [spread(0, [60, 64, 67], 0.07, 0.5, P.harp, 80), chord(0, [48], 0.5, P.slow, 60)]),
  shop1: () => score(0.5, [spread(0, [65, 69, 72], 0.07, 0.5, P.harp, 80), chord(0, [53], 0.5, P.slow, 60)]),
  shop2: () => score(0.31, [[note(0, 74, 0.12, P.harp, 75), note(0.09, 67, 0.22, P.harp, 80)]]),
  chime: () => score(0.55, [[note(0, 64, 0.55, P.bells, 80), note(0, 52, 0.55, P.bells, 45)]]),
  // --- Moving about ---
  whirl: () =>
    score(1.3, [
      run(0, [76, 74, 72, 69, 67, 64, 62, 60, 57, 55, 52, 50, 48, 45], 0.085, P.harp, 80, 0.2),
      chord(0, [45, 52], 1.3, P.slow, 65),
    ]),
  fall: () =>
    score(1.2, [run(0, [64, 62, 60, 57, 55, 52, 50, 48, 45, 43, 40, 38, 36], 0.08, P.strings, 85, 0.24), [note(1.0, 33, 0.2, P.timp, 80)]]),
  trapfall: () =>
    score(1.02, [
      [note(0, 45, 0.12, P.timp, 85), note(0, 57, 0.08, P.pizz, 75)],
      run(0.12, [69, 66, 64, 61, 59, 57, 54, 52, 49, 47, 45], 0.07, P.strings, 85, 0.2),
    ]),
  // --- The port's own cues ---
  'cue:Upwards': () => score(0.48, [run(0, [55, 57, 59, 62, 64], 0.085, P.marimba, 80, 0.14)]),
  'cue:Downwards': () => score(0.48, [run(0, [64, 62, 59, 57, 55], 0.085, P.marimba, 80, 0.14)]),
  'cue:MountHorse': () => score(0.24, [run(0, [55, 62], 0.12, P.pizz, 85)]),
  'cue:CombatStart': () =>
    score(0.63, [run(0, [45, 45, 48, 52], 0.11, P.horn, 85, 0.3), chord(0, [33, 45], 0.63, P.cello, 75), [note(0, 33, 0.4, P.timp, 95)]]),
  'cue:MonsterSpell': () => score(0.55, [run(0, [57, 54, 51, 48, 45], 0.07, P.bassoon, 85, 0.27), [note(0, 33, 0.55, P.bass, 70)]]),
  'cue:Invocation': () => score(1.1, [chord(0, [48, 55, 60, 64], 1.1, P.choir, 85), chord(0, [48, 55], 1.1, P.slow, 60)]),
  'cue:Dissolve': () => score(0.78, [run(0, [72, 69, 64, 60, 57], 0.1, P.harp, 70, 0.38), chord(0, [57, 64], 0.78, P.slow, 50)]),
  'cue:Absorbed': () => score(1.0, [run(0, [72, 69, 64, 60, 57, 52], 0.12, P.harp, 70, 0.4), chord(0, [52, 57, 64], 1.0, P.slow, 50)]),
  'cue:DeathMale': () => score(1.05, [run(0, [57, 55, 53, 52], 0.15, P.cello, 90), [note(0.6, 45, 0.45, P.cello, 90)]]),
  'cue:DeathFemale': () => score(1.05, [run(0, [69, 67, 65, 64], 0.15, P.flute, 85), [note(0.6, 57, 0.45, P.flute, 85)]]),
  'cue:BigDeath': () =>
    score(2.44, [
      run(0, [62, 60, 58, 57, 58, 57, 55], 0.22, P.strings, 90),
      [note(1.54, 50, 0.9, P.strings, 90)],
      chord(0, [38, 50, 53, 57], 0.66, P.slow, 70),
      chord(0.66, [43, 50, 55, 58], 0.66, P.slow, 70),
      chord(1.32, [45, 49, 52, 57], 0.44, P.slow, 70),
      chord(1.76, [38, 50, 53, 57], 0.68, P.slow, 65),
      [0, 0.06, 0.12, 0.18].map((at, i) => note(at, 38, 0.1, P.timp, 50 + i * 8)),
    ]),
};

/** How many ways an effect is rendered, one picked at each play: the ones a turn repeats, and the spells. */
export const VARIANTS: Record<string, number> = {
  tickhigh: 3,
  ticklow: 3,
  denyhi: 3,
  denylo: 3,
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`spell${i + 1}`, 3])),
};

/** The instrument each bank's family plays on. */
export const BANK_PROGRAMS: Record<(typeof BANKED)[number], number> = { harpsichord: P.harpsichord, lute: P.nylon, chant: P.choir };

/** One note of a bank: `family`'s instrument on `midi`, struck and let ring. */
export function bankScore(family: (typeof BANKED)[number], midi: number): Score {
  return score(0.7, [[note(0, midi, 0.6, BANK_PROGRAMS[family], 90)]]);
}
