/**
 * magic.ts
 *
 * The magic, as sound design rather than music (design.ts), the same in all three suites (render.ts puts it in every
 * suite's file): neither good nor ill - a spell may heal or harm, so it sounds like power, not like a mood. Three
 * themes, chosen by ear in the audition, carry it:
 *
 *   the sub bloom   the basis of all magic: air rushing up into a deep swell of pressure - no beater, no falling pitch
 *   the chamber     power: the air ringing a stone hall's resonances (inharmonic, no chord), from the third circle,
 *                   stronger each circle
 *   the whispers    great power: breath through a voice's vowels, from the sixth circle
 *
 * and the eighth circle is everything at once: those three at their fullest, the bloom throbbing, the air swirling,
 * swept across and drawn in, its echo arriving backwards, and held after, as if time slowed.
 *
 *   spells        the whoomph and the bloom growing with the circle - the bloom's growl (its body) through the fifth,
 *                 half at the sixth, where the whispers come to be heard instead - the chamber from the third, the
 *                 whispers from the sixth, a rumble from the seventh, all at the eighth
 *   failed        the air drawn up and cut short, a small bloom dying
 *   magic undone  the air drawn in to a stop, a bloom, a chamber ringing out: power leaving
 *   absorbed      the air drawn in and sinking, landing on a bloom
 *   summoning     a bloom and the chamber
 *   the Sceptre, an artifact   a bloom, the chamber and the whispers
 *   moongate      a slow swirling air, a gentle bloom, a light chamber
 *   healer's light, sleep      soft air over a soft bloom
 */

import type { Stereo } from '../music/pcm.ts';
import { chamber, hover, layer, preverb, room, rumble, subBloom, subDrop, swirl, whispers, whoomph } from './design.ts';

/** A magic effect: how long its moment is (seconds, about the Standard set's), how many ways it is made, and its sound. */
export interface Magic {
  length: number;
  variants: number;
  make: (r: () => number) => Stereo;
}

/** A spell of `circle`'s length (the Standard set's: chip3.ts spell). */
export const spellLength = (circle: number): number => 0.55 * Math.pow(1.5 / 0.55, (circle - 1) / 7);
/** How much earlier the eighth circle begins than the others, for what leads into its bloom (its echo, its draw). */
const EIGHTH_LEAD = 0.6;

/** The whispers rising to `at` seconds and fading over `after`. */
const rising = (at: number, after: number, r: () => number): Stereo =>
  whispers({ seconds: at + after, swell: (t) => (t < at ? (t / at) ** 2 : Math.pow(0.001, (t - at) / after)) }, r);

/**
 * A spell of a circle: the air rushing up into the sub bloom, both growing with the circle; the chamber from the third,
 * stronger each circle; the whispers from the sixth; a rumble from the seventh; and at the eighth everything.
 */
export function spell(circle: number, r: () => number): Stereo {
  const s = spellLength(circle);
  const k = (circle - 1) / 7;
  const full = circle === 8;
  const hit = s * 0.18;
  const pre = full ? Math.max(0, EIGHTH_LEAD - hit) : 0;
  const at = pre + hit; // the bloom
  let air = whoomph(
    {
      seconds: s,
      peak: s * 0.22,
      fall: s * 0.8,
      open: 2800 + 1500 * k,
      sub: 70 - 15 * k,
      ...(full ? { pan: [-0.7, 0.7] as [number, number] } : {}),
    },
    r,
  );
  if (full) air = swirl(air, 1.5, 9, 0.55);
  const parts: [Stereo, number, number][] = [
    [air, pre, 1],
    [
      subBloom({
        hz: 50 - 5 * k,
        seconds: 0.6 + 0.6 * k,
        attack: 0.04,
        body: circle <= 5 ? 1 : circle === 6 ? 0.5 : 0,
        ...(full ? { beat: 1.4 } : {}),
      }),
      at,
      0.6 + 0.3 * k,
    ],
  ];
  if (circle >= 3) parts.push([chamber({ hz: 110, seconds: 0.8 + 0.8 * k }, r), at, 0.12 + 0.28 * ((circle - 3) / 5)]);
  if (circle >= 6) parts.push([rising(at, 0.6 + 0.25 * (circle - 6), r), 0, 0.8 + 0.3 * (circle - 6)]);
  if (circle >= 7) parts.push([rumble(s, r), pre + s * 0.2, 0.5]);
  if (full) {
    parts.push([
      whoomph({ seconds: 0.4, peak: 0.39, fall: 0.06, open: 2600, sub: 60, reverse: true, pan: [-0.9, -0.3] }, r),
      at - 0.4,
      0.75,
    ]);
    parts.push([preverb({ seconds: EIGHTH_LEAD }, r), at - EIGHTH_LEAD, 0.7]);
    parts.push([hover(air, { at: pre + s * 0.22, seconds: 1.1 }, r), at + 0.08, 1.2]);
  }
  return room(layer(...parts), 1 + s, 0.22 + 0.08 * k);
}

/** A bloom with the chamber (and the whispers, where `great`): power used, `seconds` long. */
function power(seconds: number, great: boolean, r: () => number): Stereo {
  const hit = 0.12;
  const parts: [Stereo, number, number][] = [
    [whoomph({ seconds, peak: hit * 1.2, fall: seconds * 0.8, open: 3500, sub: 55 }, r), 0, 1],
    [subBloom({ hz: 45, seconds: seconds * 0.9, attack: 0.04 }), hit, 0.85],
    [chamber({ hz: 110, seconds: seconds * 1.1 }, r), hit, great ? 0.4 : 0.3],
  ];
  if (great) parts.push([rising(hit, seconds * 0.7, r), 0, 1.2]);
  return room(layer(...parts), 1.6, 0.28);
}

/** Soft air over a soft bloom, `seconds` long, swept across where `pan` is given: the healer's light. */
const light = (seconds: number, r: () => number, pan?: [number, number]): Stereo =>
  room(
    layer(
      [whoomph({ seconds, peak: seconds * 0.4, fall: seconds * 0.65, open: 2600, sub: 75, ...(pan ? { pan } : {}) }, r), 0, 1],
      [subBloom({ hz: 55, seconds: seconds * 1.1, attack: 0.08 }), seconds * 0.3, 0.35],
    ),
    2,
    0.45,
  );

/** The magic, by effect key (sfxKeys.ts). */
export const MAGIC: Record<string, Magic> = {
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, i): [string, Magic] => [
      `spell${i + 1}`,
      { length: spellLength(i + 1) + (i === 7 ? EIGHTH_LEAD - spellLength(8) * 0.18 : 0), variants: 3, make: (r) => spell(i + 1, r) },
    ]),
  ),
  failure: {
    length: 0.3,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.22, peak: 0.18, fall: 0.06, open: 1800, sub: 80, reverse: true }, r), 0, 0.8],
          [subBloom({ hz: 60, seconds: 0.25, attack: 0.02 }), 0.19, 0.5],
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
          [subBloom({ hz: 48, seconds: 0.6, attack: 0.03 }), 0.53, 0.8],
          [chamber({ hz: 110, seconds: 0.9 }, r), 0.53, 0.25],
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
          [subDrop({ seconds: 0.45, from: 120, to: 30 }), 0.08, 0.6],
          [subBloom({ hz: 42, seconds: 0.5, attack: 0.03 }), 0.48, 0.8],
        ),
        0.9,
        0.15,
      ),
  },
  summon: { length: 1, variants: 1, make: (r) => power(1, false, r) },
  sceptuse: { length: 0.86, variants: 1, make: (r) => power(0.86, true, r) },
  artifact: {
    length: 1.6,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.5, peak: 0.48, fall: 0.1, open: 2200, sub: 55, reverse: true }, r), 0, 0.7],
          [power(1.1, true, r), 0.4, 1],
        ),
        1.8,
        0.28,
      ),
  },
  moongate: {
    length: 1.2,
    variants: 1,
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 1.2, peak: 0.5, fall: 0.7, open: 3000, sub: 55, wobble: [0.45, 1.3], pan: [-0.5, 0.5] }, r), 0, 1],
          [subBloom({ hz: 50, seconds: 1, attack: 0.15 }), 0.35, 0.5],
          [chamber({ hz: 110, seconds: 1.2 }, r), 0.4, 0.15],
        ),
        1.6,
        0.35,
      ),
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
    make: (r) =>
      room(
        layer(
          [whoomph({ seconds: 1.7, peak: 0.25, fall: 1.5, open: 1600, sub: 50, wobble: [0.25, 0.7] }, r), 0, 1],
          [subBloom({ hz: 45, seconds: 1.4, attack: 0.2 }), 0.15, 0.35],
        ),
        2,
        0.35,
      ),
  },
};
