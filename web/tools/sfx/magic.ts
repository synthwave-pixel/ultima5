/**
 * magic.ts
 *
 * The magic, as sound design rather than music (design.ts), the same in all three suites (render.ts puts it in every
 * suite's file). Chosen by ear in the audition (sounds.html): zips - breath through a narrow band sweeping up or
 * down, repeated as echoes fading away - over the 1988 spell's hum, as breath (its pitch from DATA.OVL, two octaves
 * down, falling as the circle rises, as it did). Each sound is a gesture of those:
 *
 *   spells        rising zips echoing away over the hum; each circle a longer, lower sweep and more echoes
 *   failed        one zip falling and cut short, the hum choked
 *   magic undone  falling zips, each echo lower - power leaving
 *   absorbed      zips drawn in, louder and closer, to a stop
 *   summoning     zips climbing, each echo higher, over a low hum
 *   the Sceptre   a zip rising in one ear as one falls in the other, trading sides
 *   an artifact   rising zips with an octave-low twin, the echoes bouncing wide, a long hum
 *   moongate      a slow, warbling rise and fall, its echoes moving across
 *   healer's light   a soft, breathy zip rising, barely echoing; turning across; settling
 *   sleep         slow warbling zips sinking, each echo lower, over a low hum
 *
 * Two ways of each, for the audition: dark (most of the sound low, little where the ear tires - check.ts's
 * presence) and bright (the sweeps as high as they reach). MAGIC is the bright: the magic is rare enough to be let
 * shine.
 */

import type { Stereo } from '../music/pcm.ts';
import { breathHum, darker, echoes, layer, panned, room, zip } from './design.ts';

/**
 * A magic effect: how long its moment is (seconds, about the Standard set's), how many ways it is made, its level
 * (dBFS, render.ts's where not given), whether it is a moment meant to stand out (check.ts: allowed louder than an
 * everyday effect) and its sound.
 */
export interface Magic {
  length: number;
  variants: number;
  level?: number;
  standout?: boolean;
  make: (r: () => number) => Stereo;
}

/** A spell of `circle`'s length (the Standard set's: chip3.ts spell). */
export const spellLength = (circle: number): number => 0.55 * Math.pow(1.5 / 0.55, (circle - 1) / 7);

/** The 1988 spell's hum by circle (Hz): DATA.OVL 0x4af6's pulse, at the speaker's pace (speaker.ts pulseRuns). */
const HUM_HZ = [2779, 2505, 2324, 2111, 1977, 1838, 1710, 1590];

type Part = [Stereo, number, number];

/**
 * The magic, dark or bright. Dark: the sweeps reaching about half as high, and everything above 1.5 kHz eased away;
 * bright: as high as they go, eased only above 3.8 kHz (the low circles) or 5.5 kHz.
 */
export function magicSet(dark: boolean): Record<string, Magic> {
  /** How high a sweep reaches. */
  const top = dark ? 0.55 : 1;
  /** Mixed, eased, in a room of `seconds` with `wet` of it. */
  const finished = (ease: number, seconds: number, wet: number, ...parts: Part[]): Stereo =>
    room(darker(layer(...parts), dark ? 1500 : ease), seconds, wet, 1);

  /** A circle's place in the eight (0 to 1). */
  const kOf = (circle: number): number => (circle - 1) / 7;
  /** A rising zip of a circle: longer and lower each, its band moved by `scale`. */
  const rise = (circle: number, r: () => number, scale = 1): Stereo => {
    const k = kOf(circle);
    return zip({ seconds: 0.16 + 0.08 * k, from: (500 - 150 * k) * scale, to: (2600 - 600 * k) * scale * top }, r);
  };
  /** A falling zip of a circle. */
  const fall = (circle: number, r: () => number, scale = 1): Stereo => {
    const k = kOf(circle);
    return zip({ seconds: 0.18 + 0.1 * k, from: (2600 - 600 * k) * scale * top, to: (400 - 120 * k) * scale }, r);
  };
  /** The 1988 hum of a circle, two octaves down (and `down` more), ringing `seconds`. */
  const hum = (circle: number, seconds: number, r: () => number, down = 1): Stereo =>
    breathHum({ hz: HUM_HZ[circle - 1] / 4 / down, seconds, attack: 0.12 }, r);
  /** Echoes trading sides, `spread` apart. */
  const bounce =
    (spread: number) =>
    (i: number): number =>
      i ? (i % 2 ? -spread : spread) : 0;

  /** A spell: rising zips echoing away over the hum. */
  const spell = (circle: number, r: () => number): Stereo => {
    const k = kOf(circle);
    const gap = 0.12 + 0.05 * k;
    return finished(
      circle <= 3 ? 3800 : 5500,
      0.5 + 0.6 * k,
      0.12 + 0.08 * k,
      [echoes({ count: 3 + Math.round(3 * k), make: () => rise(circle, r), when: (i) => i * gap, feedback: 0.6 }), 0, 1],
      [hum(circle, 0.8 + k, r), 0.1, 0.45],
    );
  };

  return {
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i): [string, Magic] => [
        `spell${i + 1}`,
        // The low circles, cast most, a little softer: 7 dB from the first to the eighth. The fourth circle and up,
        // cast seldom, are moments, not everyday effects (check.ts).
        { length: spellLength(i + 1), variants: 3, level: -28 + i, standout: i >= 3, make: (r) => spell(i + 1, r) },
      ]),
    ),
    failure: {
      length: 0.3,
      variants: 1,
      make: (r) => finished(3800, 0.4, 0.12, [zip({ seconds: 0.2, from: 1800 * top, to: 300 }, r), 0, 1], [hum(1, 0.22, r), 0.04, 0.35]),
    },
    'cue:Dissolve': {
      length: 0.8,
      variants: 1,
      make: (r) =>
        finished(
          4500,
          0.9,
          0.2,
          [echoes({ count: 4, make: (i) => fall(4, r, Math.pow(0.84, i)), when: (i) => i * 0.15, feedback: 0.7 }), 0, 1],
          [hum(4, 0.9, r), 0, 0.35],
        ),
    },
    absorb: {
      length: 0.8,
      variants: 1,
      // Drawn in: the zips coming quicker and louder, to a stop - echoes run backwards.
      make: (r) =>
        finished(4500, 0.5, 0.12, ...[0, 0.24, 0.42, 0.55, 0.64].map((at, i): Part => [rise(4, r, 0.8), at, 0.3 + 0.175 * i]), [
          hum(5, 0.3, r, 2),
          0.64,
          0.4,
        ]),
    },
    summon: {
      length: 1,
      variants: 1,
      make: (r) =>
        finished(
          5500,
          1.2,
          0.22,
          [echoes({ count: 5, make: (i) => rise(5, r, 0.8 * Math.pow(1.12, i)), when: (i) => i * 0.15, feedback: 0.7 }), 0, 1],
          [hum(5, 1.2, r, 2), 0.05, 0.5],
        ),
    },
    sceptuse: {
      length: 0.86,
      variants: 1,
      make: (r) =>
        finished(
          5500,
          1.2,
          0.22,
          [
            echoes({
              count: 4,
              make: (i) => layer([panned(rise(6, r), i % 2 ? 0.7 : -0.7), 0, 0.85], [panned(fall(6, r), i % 2 ? -0.7 : 0.7), 0, 0.85]),
              when: (i) => i * 0.16,
              feedback: 0.58,
            }),
            0,
            1,
          ],
          [hum(6, 1.1, r), 0.05, 0.45],
        ),
    },
    artifact: {
      length: 1.6,
      variants: 1,
      make: (r) =>
        finished(
          5500,
          1.6,
          0.28,
          [
            echoes({
              count: 8,
              make: () => layer([rise(8, r), 0, 1], [rise(8, r, 0.5), 0.01, 0.7]),
              when: (i) => i * 0.17,
              feedback: 0.66,
              pan: bounce(0.85),
            }),
            0,
            1,
          ],
          [hum(8, 2, r), 0.1, 0.5],
        ),
    },
    moongate: {
      length: 1.2,
      variants: 1,
      make: (r) =>
        finished(
          5500,
          1.6,
          0.3,
          [
            echoes({
              count: 4,
              make: () =>
                layer(
                  [zip({ seconds: 0.3, from: 350, to: 2000 * top, warble: [0.08, 6] }, r), 0, 1],
                  [zip({ seconds: 0.35, from: 2000 * top, to: 300, warble: [0.08, 6] }, r), 0.26, 0.8],
                ),
              when: (i) => i * 0.22,
              feedback: 0.55,
              pan: (i) => -0.6 + 0.3 * i,
            }),
            0,
            1,
          ],
          [hum(5, 1.4, r, 2), 0.1, 0.4],
        ),
    },
    shop0: {
      length: 0.55,
      variants: 1,
      level: -26,
      make: (r) =>
        finished(
          3800,
          1.4,
          0.4,
          [
            echoes({
              count: 2,
              make: () => zip({ seconds: 0.3, from: 450, to: 1900 * top, q: 2.2 }, r),
              when: (i) => i * 0.18,
              feedback: 0.45,
            }),
            0,
            1,
          ],
          [hum(2, 0.6, r), 0.05, 0.3],
        ),
    },
    shop1: {
      length: 0.55,
      variants: 1,
      level: -26,
      make: (r) =>
        finished(
          3800,
          1.4,
          0.4,
          [
            echoes({
              count: 2,
              make: () => zip({ seconds: 0.3, from: 500, to: 2100 * top, q: 2.2 }, r),
              when: (i) => i * 0.18,
              feedback: 0.45,
              pan: (i) => -0.4 + 0.4 * i,
            }),
            0,
            1,
          ],
          [hum(2, 0.6, r), 0.05, 0.3],
        ),
    },
    shop2: {
      length: 0.35,
      variants: 1,
      level: -26,
      make: (r) => finished(3800, 1.4, 0.4, [zip({ seconds: 0.3, from: 1600 * top, to: 350, q: 2.2 }, r), 0, 1], [hum(2, 0.4, r), 0, 0.3]),
    },
    status: {
      length: 1.7,
      variants: 1,
      make: (r) =>
        finished(
          4500,
          2,
          0.3,
          [
            echoes({
              count: 5,
              make: (i) => zip({ seconds: 0.4, from: 1800 * top * Math.pow(0.86, i), to: 250, warble: [0.06, 3] }, r),
              when: (i) => i * 0.26,
              feedback: 0.7,
            }),
            0,
            1,
          ],
          [hum(3, 1.8, r, 2), 0.1, 0.45],
        ),
    },
  };
}

/** The magic the suites play: the bright, chosen in the audition. */
export const MAGIC: Record<string, Magic> = magicSet(false);
