/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the spells' higher circles, to choose by ear (the sound test page's
 * Audition section). The first circle stays as it is (magic.ts); from the fourth the spell gains layers, after the
 * user's bought pack (the Danger Hit's double blow, the power-ups' sub drop and charge, a sparkle's tail made dark):
 * a blow at the fourth, the air drawn in first at the fifth, a sub drop at the sixth, a second blow and a rumble at the
 * seventh, and at the eighth the air sweeping across and embers crackling in the tail. Then the eighth leaning several
 * ways. Rendered to web/public/sfx/audition.<hash>.ogg, its slices in web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { charge, embers, impact, layer, room, rumble, seeded, subDrop, whoomph } from './design.ts';
import { spell, spellLength } from './magic.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** How a spell is built: which layers it has, and how heavily. */
interface Layers {
  /** A charge before it all (seconds), or none. */
  charge: number;
  drawIn: boolean;
  subDrop: boolean;
  second: boolean;
  rumble: boolean;
  /** The air sweeping across on the way in and out. */
  pass: boolean;
  /** Embers crackling in the tail: how many. */
  embers: number;
  /** The blows' and the drop's weight (1 as designed). */
  heavy: number;
}

/** The layers a circle has on the ladder: each circle from the fourth adding one. */
const ladder = (circle: number): Layers => ({
  charge: 0,
  drawIn: circle >= 5,
  subDrop: circle >= 6,
  second: circle >= 7,
  rumble: circle >= 7,
  pass: circle >= 8,
  embers: circle >= 8 ? 30 : 0,
  heavy: 1,
});

/** A spell of `circle`, its layers `o`: what charges and is drawn in, then released - the blows, the drop, the tail. */
function rich(circle: number, r: () => number, o: Layers = ladder(circle)): Stereo {
  const s = spellLength(circle);
  const k = (circle - 1) / 7;
  const draw = o.drawIn ? 0.3 * s : 0;
  const at = o.charge + draw; // the release
  const parts: [Stereo, number, number][] = [];
  if (o.charge) parts.push([charge({ seconds: o.charge + draw * 0.5, from: 180, to: 2400 }, r), 0, 0.7]);
  if (o.drawIn)
    parts.push([
      whoomph(
        {
          seconds: draw,
          peak: draw - 0.02,
          fall: 0.05,
          open: 2500,
          sub: 60,
          reverse: true,
          ...(o.pass ? { pan: [-0.85, 0] as [number, number] } : {}),
        },
        r,
      ),
      o.charge,
      0.8,
    ]);
  parts.push([
    whoomph(
      {
        seconds: s,
        peak: 0.12 * s,
        fall: 0.85 * s,
        open: 2800 + 1500 * k,
        sub: 70 - 15 * k,
        ...(o.pass ? { pan: [0, 0.7] as [number, number] } : {}),
      },
      r,
    ),
    at,
    1,
  ]);
  if (circle >= 4) parts.push([impact({ hz: 60 - 8 * k, seconds: 0.9 * s }, r), at + 0.02, (0.4 + 0.5 * k) * o.heavy]);
  if (o.subDrop) parts.push([subDrop({ seconds: 0.5, from: 110 + 30 * (o.heavy - 1), to: 30 - 5 * (o.heavy - 1) }), at, 0.7 * o.heavy]);
  if (o.second) parts.push([impact({ hz: 48, seconds: 0.8 }, r), at + 0.45, 0.6 * o.heavy]);
  if (o.rumble) parts.push([rumble(s + 0.6, r), at + 0.05, 0.5 * o.heavy]);
  if (o.embers) parts.push([embers({ seconds: s + 0.8, count: o.embers }, r), at + 0.05, 0.5]);
  return room(layer(...parts), 1 + s, 0.22 + 0.08 * k + (o.pass ? 0.05 : 0));
}

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  ['now1', 'As built: first circle (for reference)', (r) => spell(1, r)],
  ['now8', 'As built: eighth circle (for reference)', (r) => spell(8, r)],
  // --- The ladder: a layer more each circle from the fourth ---
  ['l4', 'Ladder, fourth circle (a blow joins the whoomph)', (r) => rich(4, r)],
  ['l5', 'Ladder, fifth circle (+ the air drawn in first)', (r) => rich(5, r)],
  ['l6', 'Ladder, sixth circle (+ a sub drop under the release)', (r) => rich(6, r)],
  ['l7', 'Ladder, seventh circle (+ a second blow, a rumble)', (r) => rich(7, r)],
  ['l8', 'Ladder, eighth circle (+ the air sweeping across, embers in the tail)', (r) => rich(8, r)],
  // --- The eighth, leaning different ways ---
  ['h8', 'Eighth, heavy (the blows and the drop half again as strong, deeper)', (r) => rich(8, r, { ...ladder(8), heavy: 1.5 })],
  ['c8', 'Eighth, long charge (tension building for half a second before the release)', (r) => rich(8, r, { ...ladder(8), charge: 0.5 })],
  [
    'm8',
    'Eighth, motion (swept across in and out, embers scattered wide, no rumble)',
    (r) => rich(8, r, { ...ladder(8), rumble: false, embers: 45 }),
  ],
  ['e8', 'Eighth, embers (a long crackling tail of energy spending itself)', (r) => rich(8, r, { ...ladder(8), embers: 90 })],
  [
    'a8',
    'Eighth, everything (a charge, heavier blows, the sweep, embers)',
    (r) => rich(8, r, { ...ladder(8), charge: 0.35, heavy: 1.25, embers: 50 }),
  ],
];

function main(): void {
  const done = CANDIDATES.map(([id, , make], i) => {
    // As built, with the seed the game's file is rendered with (render.ts: 4099); the rest their own.
    const pcm = make(seeded(id.startsWith('now') ? 4099 : 101 + i * 7919));
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
