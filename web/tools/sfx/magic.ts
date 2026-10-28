/**
 * magic.ts
 *
 * The magic, as sound design rather than music (design.ts), the same in all three suites (render.ts puts it in every
 * suite's file): air and weight, nothing bright, neither good nor ill - a spell may heal or harm, so it sounds like
 * power, not like a mood. Built from what the user picked by ear in an audition of candidates: the whoomph, the
 * impact, the collapse and the implosion, the fizzle, the swirl, the soft open air, the sinking breath.
 *
 *   spells        a whoomph growing with the circle; a blow joins it from the fourth, the ground rumbles from the seventh
 *   failed        a fizzle: the air drawn up and cut short, a small dull knock
 *   magic undone  the collapse: the air drawn in to a stop, a dull blow
 *   absorbed      the implosion: drawn in, sinking, a dull blow and nothing
 *   summoning, the Sceptre   the impact: a deep blow, the air rolling away after it
 *   an artifact   the air drawn in slowly, then let go in a long whoomph over a rumble
 *   moongate      a slow swirling air, wavering side to side
 *   healer's light   soft and open, no blow: rising, turning (drifting across), settling (a short breath sinking)
 *   sleep         a long breath sinking and slowing
 */

import type { Stereo } from '../music/pcm.ts';
import { impact, layer, room, rumble, subDrop, whoomph } from './design.ts';

/** A magic effect: how long its moment is (seconds, about the Standard set's), how many ways it is made, and its sound. */
export interface Magic {
  length: number;
  variants: number;
  make: (r: () => number) => Stereo;
}

/** A spell of `circle`'s length (the Standard set's: chip3.ts spell). */
export const spellLength = (circle: number): number => 0.55 * Math.pow(1.5 / 0.55, (circle - 1) / 7);

/** A spell of a circle: a whoomph growing with it, a blow joining it from the fourth, the ground rumbling from the seventh. */
export function spell(circle: number, r: () => number): Stereo {
  const seconds = spellLength(circle);
  const k = (circle - 1) / 7;
  const parts: [Stereo, number, number][] = [
    [whoomph({ seconds, peak: seconds * 0.22, fall: seconds * 0.8, open: 2800 + 1500 * k, sub: 70 - 15 * k }, r), 0, 1],
  ];
  if (circle >= 4) parts.push([impact({ hz: 60 - 8 * k, seconds: seconds * 0.9 }, r), seconds * 0.18, 0.4 + 0.5 * k]);
  if (circle >= 7) parts.push([rumble(seconds, r), seconds * 0.2, 0.5]);
  return room(layer(...parts), 1 + seconds, 0.22 + 0.08 * k);
}

/** The impact: a deep blow, the air rolling away after it, `seconds` long. */
const blow = (seconds: number, r: () => number): Stereo =>
  room(
    layer(
      [impact({ hz: 55, seconds }, r), 0, 1],
      [whoomph({ seconds, peak: 0.05, fall: seconds * 0.9, open: 2500, sub: 50 }, r), 0.02, 0.6],
    ),
    1.8,
    0.3,
  );

/** The soft open air of the healer's light, `seconds` long, swept across where `pan` is given. */
const light = (seconds: number, r: () => number, pan?: [number, number]): Stereo =>
  room(whoomph({ seconds, peak: seconds * 0.4, fall: seconds * 0.65, open: 2600, sub: 75, ...(pan ? { pan } : {}) }, r), 2, 0.45);

/** The magic, by effect key (sfxKeys.ts). */
export const MAGIC: Record<string, Magic> = {
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, i): [string, Magic] => [
      `spell${i + 1}`,
      { length: spellLength(i + 1), variants: 3, make: (r) => spell(i + 1, r) },
    ]),
  ),
  failure: {
    length: 0.3,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.22, peak: 0.18, fall: 0.06, open: 1800, sub: 80, reverse: true }, r), 0, 0.8],
          [impact({ hz: 80, seconds: 0.25 }, r), 0.2, 0.4],
        ),
        0.6,
        0.15,
      ),
  },
  'cue:Dissolve': {
    length: 0.8,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.55, peak: 0.53, fall: 0.15, open: 2500, sub: 60, reverse: true }, r), 0, 1],
          [impact({ hz: 50, seconds: 0.6 }, r), 0.53, 0.8],
        ),
        1.2,
        0.25,
      ),
  },
  absorb: {
    length: 0.8,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.5, peak: 0.47, fall: 0.1, open: 3000, sub: 70, reverse: true }, r), 0, 1],
          [subDrop({ seconds: 0.45, from: 120, to: 30 }), 0.08, 0.7],
          [impact({ hz: 45, seconds: 0.5 }, r), 0.48, 0.7],
        ),
        0.9,
        0.15,
      ),
  },
  summon: { length: 1, variants: 1, make: (r) => blow(1, r) },
  sceptuse: { length: 0.86, variants: 1, make: (r) => blow(0.86, r) },
  artifact: {
    length: 1.6,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.5, peak: 0.48, fall: 0.1, open: 2200, sub: 55, reverse: true }, r), 0, 0.7],
          [whoomph({ seconds: 1.1, peak: 0.1, fall: 1, open: 3800, sub: 55 }, r), 0.48, 1],
          [rumble(1.1, r), 0.5, 0.45],
        ),
        1.8,
        0.28,
      ),
  },
  moongate: {
    length: 1.2,
    variants: 1,
    make: (r) =>
      room(whoomph({ seconds: 1.2, peak: 0.5, fall: 0.7, open: 3000, sub: 55, wobble: [0.45, 1.3], pan: [-0.5, 0.5] }, r), 1.6, 0.35),
  },
  shop0: { length: 0.55, variants: 1, make: (r) => light(0.55, r) },
  shop1: { length: 0.55, variants: 1, make: (r) => light(0.55, r, [-0.4, 0.4]) },
  shop2: {
    length: 0.35,
    variants: 1,
    make: (r) => room(whoomph({ seconds: 0.35, peak: 0.06, fall: 0.3, open: 1600, sub: 65 }, r), 1.6, 0.45),
  },
  status: {
    length: 1.7,
    variants: 1,
    make: (r) => room(whoomph({ seconds: 1.7, peak: 0.25, fall: 1.5, open: 1600, sub: 50, wobble: [0.25, 0.7] }, r), 2, 0.35),
  },
};
