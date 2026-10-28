/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the magic's sound, to choose by ear (the sound test page's Audition
 * section). Sound design, not music (design.ts), after the layering of a bought pack's spell effects the user likes -
 * a whoomph of air over a sub body, a power riser's digital glitter, an air shimmer, a sub drop and impact, a room -
 * each neutral, neither good nor ill. The bright ones come twice, as designed and tamed under 3.5 kHz, to hear whether
 * magic may be brighter than the rest of the effects. Rendered to web/public/sfx/audition.<hash>.ogg, its slices in
 * web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { impact, layer, riser, room, seeded, sparkle, subDrop, whoomph } from './design.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** A whoomph, a soft riser and a soft shimmer together, `seconds` long: the spell of a circle. */
const blend = (seconds: number, r: () => number): Stereo =>
  room(
    layer(
      [whoomph({ seconds, peak: seconds * 0.25, fall: seconds * 0.8, open: 3500, sub: 65 }, r), 0, 1],
      [riser({ seconds: seconds * 0.7, from: 300, to: 900 + seconds * 400, steps: 5, flicker: 24, bright: false }, r), 0.03, 0.35],
      [sparkle({ seconds, count: Math.round(10 + seconds * 20), lo: 1500, hi: 3800 }, r), seconds * 0.1, 0.25],
    ),
    1.3,
    0.22,
  );

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  [
    'w1',
    'Whoomph (a cast: air rushing in and away over a sub body)',
    (r) => room(whoomph({ seconds: 1.1, peak: 0.2, fall: 0.8, open: 4000, sub: 65 }, r), 1.4, 0.25),
  ],
  [
    'w2',
    'Whoomph, long (a high circle), a soft shimmer through it',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 1.6, peak: 0.3, fall: 1.2, open: 5000, sub: 55 }, r), 0, 1],
          [sparkle({ seconds: 1.2, count: 30, lo: 1500, hi: 3500 }, r), 0.2, 0.3],
        ),
        1.8,
        0.25,
      ),
  ],
  [
    'p1',
    'Power riser, bright (digital glitter climbing, a sub drop under its end)',
    (r) =>
      room(
        layer(
          [riser({ seconds: 0.7, from: 400, to: 1600, steps: 6, flicker: 28, bright: true }, r), 0, 0.8],
          [whoomph({ seconds: 0.8, peak: 0.4, fall: 0.4, open: 3000, sub: 70 }, r), 0, 0.6],
          [subDrop({ seconds: 0.45, from: 110, to: 35 }), 0.45, 0.8],
        ),
        1,
        0.2,
      ),
  ],
  [
    'p2',
    'Power riser, tamed (the same, soft above 3.5 kHz)',
    (r) =>
      room(
        layer(
          [riser({ seconds: 0.7, from: 400, to: 1600, steps: 6, flicker: 28, bright: false }, r), 0, 0.8],
          [whoomph({ seconds: 0.8, peak: 0.4, fall: 0.4, open: 3000, sub: 70 }, r), 0, 0.6],
          [subDrop({ seconds: 0.45, from: 110, to: 35 }), 0.45, 0.8],
        ),
        1,
        0.2,
      ),
  ],
  [
    's1',
    'Air shimmer, bright (a soft thump, then high sparkles hanging in the air)',
    (r) =>
      room(
        layer(
          [impact({ hz: 60, seconds: 0.5 }, r), 0, 0.5],
          [sparkle({ seconds: 1, count: 45, lo: 5000, hi: 12000 }, r), 0.02, 1],
          [whoomph({ seconds: 0.9, peak: 0.12, fall: 0.7, open: 6000, sub: 60 }, r), 0, 0.4],
        ),
        1.6,
        0.3,
      ),
  ],
  [
    's2',
    'Air shimmer, tamed (the sparkles lower, 1.5-4 kHz)',
    (r) =>
      room(
        layer(
          [impact({ hz: 60, seconds: 0.5 }, r), 0, 0.5],
          [sparkle({ seconds: 1, count: 45, lo: 1500, hi: 4000 }, r), 0.02, 1],
          [whoomph({ seconds: 0.9, peak: 0.12, fall: 0.7, open: 3500, sub: 60 }, r), 0, 0.4],
        ),
        1.6,
        0.3,
      ),
  ],
  [
    'i1',
    'Impact cast (a deep blow, the air rolling away after it)',
    (r) =>
      room(
        layer(
          [impact({ hz: 55, seconds: 1.2 }, r), 0, 1],
          [whoomph({ seconds: 1.2, peak: 0.05, fall: 1.1, open: 2500, sub: 50 }, r), 0.02, 0.6],
        ),
        1.8,
        0.3,
      ),
  ],
  [
    'u1',
    'Undone: power draining (the riser falling, the air drawn in, a sub drop), tamed',
    (r) =>
      room(
        layer(
          [riser({ seconds: 0.7, from: 1600, to: 300, steps: 6, flicker: 22, bright: false }, r), 0, 0.8],
          [whoomph({ seconds: 0.7, peak: 0.6, fall: 0.2, open: 3000, sub: 70, reverse: true }, r), 0, 0.6],
          [subDrop({ seconds: 0.4, from: 90, to: 30 }), 0.6, 0.9],
        ),
        1,
        0.2,
      ),
  ],
  [
    'u2',
    'Undone: power draining, bright',
    (r) =>
      room(
        layer(
          [riser({ seconds: 0.7, from: 1600, to: 300, steps: 6, flicker: 22, bright: true }, r), 0, 0.8],
          [whoomph({ seconds: 0.7, peak: 0.6, fall: 0.2, open: 3000, sub: 70, reverse: true }, r), 0, 0.6],
          [subDrop({ seconds: 0.4, from: 90, to: 30 }), 0.6, 0.9],
        ),
        1,
        0.2,
      ),
  ],
  [
    'u3',
    'Undone: collapse (the air drawn in to a stop, a dull blow)',
    (r) =>
      room(
        layer(
          [whoomph({ seconds: 0.7, peak: 0.6, fall: 0.2, open: 2500, sub: 60, reverse: true }, r), 0, 1],
          [impact({ hz: 50, seconds: 0.8 }, r), 0.68, 0.8],
        ),
        1.4,
        0.25,
      ),
  ],
  ['c1', 'Blend, first circle (whoomph, a soft riser, a soft shimmer)', (r) => blend(0.55, r)],
  ['c4', 'Blend, fourth circle', (r) => blend(0.85, r)],
  ['c8', 'Blend, eighth circle', (r) => blend(1.5, r)],
];

function main(): void {
  const done = CANDIDATES.map(([id, , make], i) => {
    const pcm = make(seeded(101 + i * 7919));
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
