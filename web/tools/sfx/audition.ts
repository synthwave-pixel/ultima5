/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the magic's sound, to choose by ear (the sound test page's Audition
 * section). Sound design, not music (design.ts), after the layering of a bought pack's spell effects the user likes,
 * each neutral, neither good nor ill. Round three: the user picked the whoomph, the impact and the collapse - air and
 * weight, nothing bright - so these vary those three, and try the magic as a family in that language: the spells by
 * circle, a failure, the moongate, the healer's light, sleep. Rendered to web/public/sfx/audition.<hash>.ogg, its slices in
 * web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { impact, layer, room, rumble, seeded, subDrop, whoomph } from './design.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** The three the user picked (round two), as they were: for reference. */
const W1 = (r: () => number): Stereo => room(whoomph({ seconds: 1.1, peak: 0.2, fall: 0.8, open: 4000, sub: 65 }, r), 1.4, 0.25);
const I1 = (r: () => number): Stereo =>
  room(
    layer(
      [impact({ hz: 55, seconds: 1.2 }, r), 0, 1],
      [whoomph({ seconds: 1.2, peak: 0.05, fall: 1.1, open: 2500, sub: 50 }, r), 0.02, 0.6],
    ),
    1.8,
    0.3,
  );
const U3 = (r: () => number): Stereo =>
  room(
    layer(
      [whoomph({ seconds: 0.7, peak: 0.6, fall: 0.2, open: 2500, sub: 60, reverse: true }, r), 0, 1],
      [impact({ hz: 50, seconds: 0.8 }, r), 0.68, 0.8],
    ),
    1.4,
    0.25,
  );

/** A spell of a circle in this language: a whoomph growing with the circle, a blow joining it from the fourth. */
function spell(circle: number, r: () => number): Stereo {
  const seconds = 0.55 * Math.pow(1.5 / 0.55, (circle - 1) / 7);
  const k = (circle - 1) / 7;
  const parts: [Stereo, number, number][] = [
    [whoomph({ seconds, peak: seconds * 0.22, fall: seconds * 0.8, open: 2800 + 1500 * k, sub: 70 - 15 * k }, r), 0, 1],
  ];
  if (circle >= 4) parts.push([impact({ hz: 60 - 8 * k, seconds: seconds * 0.9 }, r), seconds * 0.18, 0.4 + 0.5 * k]);
  if (circle >= 7) parts.push([rumble(seconds, r), seconds * 0.2, 0.5]);
  return room(layer(...parts), 1 + seconds, 0.22 + 0.08 * k);
}

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  ['w1', 'Picked: Whoomph (a cast: air rushing in and away over a sub body)', W1],
  ['i1', 'Picked: Impact cast (a deep blow, the air rolling away after it)', I1],
  ['u3', 'Picked: Undone, collapse (the air drawn in to a stop, a dull blow)', U3],
  // --- The impact, varied ---
  [
    'i2',
    'Impact, double (a blow and a second, softer, a beat later, a rumble after)',
    (r) =>
      room(
        layer([impact({ hz: 55, seconds: 0.9 }, r), 0, 1], [impact({ hz: 48, seconds: 1 }, r), 0.42, 0.65], [rumble(1.6, r), 0.05, 0.45]),
        2,
        0.3,
      ),
  ],
  [
    'i3',
    'Impact, drawn up (the air swelling into the blow)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.45, peak: 0.42, fall: 0.1, open: 3000, sub: 70, reverse: true }, r), 0, 0.8],
          [impact({ hz: 55, seconds: 1.1 }, r), 0.44, 1],
          [whoomph({ seconds: 1, peak: 0.04, fall: 0.9, open: 2200, sub: 50 }, r), 0.46, 0.5],
        ),
        1.8,
        0.3,
      ),
  ],
  [
    'i4',
    'Impact, far off (softer, darker, more of the room)',
    (r) =>
      room(
        layer(
          [impact({ hz: 50, seconds: 1 }, r), 0, 0.8],
          [whoomph({ seconds: 1, peak: 0.06, fall: 0.9, open: 1500, sub: 45 }, r), 0.02, 0.5],
        ),
        2.4,
        0.5,
      ),
  ],
  [
    'i5',
    'Impact, long rumble (the ground rolling on after)',
    (r) => room(layer([impact({ hz: 55, seconds: 1 }, r), 0, 1], [rumble(2.2, r), 0.03, 0.8]), 1.6, 0.25),
  ],
  // --- The whoomph, varied ---
  [
    'w2',
    'Whoomph, quick (snappier, shorter)',
    (r) => room(whoomph({ seconds: 0.6, peak: 0.08, fall: 0.45, open: 4000, sub: 70 }, r), 1, 0.22),
  ],
  [
    'w3',
    'Whoomph, passing (swept from one side to the other)',
    (r) => room(whoomph({ seconds: 1.1, peak: 0.35, fall: 0.6, open: 3800, sub: 60, pan: [-0.9, 0.9] }, r), 1.4, 0.25),
  ],
  [
    'w4',
    'Whoomph, breath in and out (the air drawn in, then let go)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.35, peak: 0.33, fall: 0.05, open: 2000, sub: 60, reverse: true }, r), 0, 0.6],
          [whoomph({ seconds: 1, peak: 0.12, fall: 0.8, open: 4000, sub: 65 }, r), 0.34, 1],
        ),
        1.4,
        0.25,
      ),
  ],
  [
    'w5',
    'Whoomph, deep (slower, lower, darker)',
    (r) => room(whoomph({ seconds: 1.5, peak: 0.35, fall: 1.1, open: 2200, sub: 45 }, r), 1.8, 0.28),
  ],
  // --- The collapse, varied ---
  [
    'u4',
    'Undone, collapse, long (drawn in slower, a rumble after the blow)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 1, peak: 0.95, fall: 0.2, open: 2500, sub: 55, reverse: true }, r), 0, 1],
          [impact({ hz: 48, seconds: 0.8 }, r), 0.97, 0.8],
          [rumble(1.4, r), 1, 0.5],
        ),
        1.6,
        0.25,
      ),
  ],
  [
    'u5',
    'Undone, implosion (drawn in, sinking, then a dull blow and nothing)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.6, peak: 0.57, fall: 0.1, open: 3000, sub: 70, reverse: true }, r), 0, 1],
          [subDrop({ seconds: 0.5, from: 120, to: 30 }), 0.1, 0.7],
          [impact({ hz: 45, seconds: 0.5 }, r), 0.58, 0.7],
        ),
        0.9,
        0.15,
      ),
  ],
  // --- The magic as a family ---
  ['c1', 'Spell, first circle (a whoomph)', (r) => spell(1, r)],
  ['c4', 'Spell, fourth circle (a blow joins it)', (r) => spell(4, r)],
  ['c8', 'Spell, eighth circle (deeper, the ground rumbling)', (r) => spell(8, r)],
  [
    'f1',
    'Failed spell (a fizzle: the air drawn up and cut short, a small dull knock)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.22, peak: 0.18, fall: 0.06, open: 1800, sub: 80, reverse: true }, r), 0, 0.8],
          [impact({ hz: 80, seconds: 0.25 }, r), 0.2, 0.4],
        ),
        0.6,
        0.15,
      ),
  ],
  [
    'm1',
    'Moongate (a slow swirling air, wavering side to side)',
    (r) => room(whoomph({ seconds: 1.4, peak: 0.6, fall: 0.8, open: 3000, sub: 55, wobble: [0.45, 1.3], pan: [-0.5, 0.5] }, r), 1.6, 0.35),
  ],
  [
    'h1',
    "Healer's light (soft and open, no blow)",
    (r) => room(whoomph({ seconds: 0.9, peak: 0.35, fall: 0.6, open: 2600, sub: 75 }, r), 2, 0.45),
  ],
  [
    's1',
    'Put to sleep (a long breath sinking and slowing)',
    (r) => room(whoomph({ seconds: 1.7, peak: 0.25, fall: 1.5, open: 1600, sub: 50, wobble: [0.25, 0.7] }, r), 2, 0.35),
  ],
];

function main(): void {
  // The picks keep the seeds they were heard with (their places in round two's list), so they sound as they did.
  const WAS: Record<string, number> = { w1: 0, i1: 6, u3: 9 };
  const done = CANDIDATES.map(([id, , make], i) => {
    const pcm = make(seeded(101 + (WAS[id] ?? 100 + i) * 7919));
    levelSlice(pcm, -24);
    return { key: id, pcm };
  });
  const { pcm, slices } = layOutAtlas(done);
  const bytes = encode(pcm, RATE, 'ogg', ['-c:a', 'libopus', '-b:a', '96k']);
  const dir = join(WEB, 'public', 'sfx');
  const name = `audition.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.ogg`;
  writeFileSync(join(dir, name), bytes);
  for (const old of readdirSync(dir)) if (old.startsWith('audition.') && old !== name) rmSync(join(dir, old));
  const out = { file: `sfx/${name}`, items: CANDIDATES.map(([id, label]) => ({ id, label, slice: slices[id][0] })) };
  writeFileSync(join(WEB, 'src', 'dev', 'audition.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${name}, ${CANDIDATES.length} sounds`);
}

main();
