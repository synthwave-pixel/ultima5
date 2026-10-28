/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the eighth circle, to choose by ear (the sound test page's Audition
 * section). The user found the eighth as built had what the others lost - one clear rise and one impact - where a
 * second blow, or a draw-in ending before the release, made an echo of a second impact. So here the eighth as built is
 * the baseline, its whoomph, its one blow and its rumble just as they are (and from the same random draws), and each
 * addition is timed to lead into that one blow, never to start anything after it: the air swept across, the air drawn
 * in and peaking on the blow, a charge ending on it, a sub drop starting on it, the blow heavier; then some together.
 * Rendered to web/public/sfx/audition.<hash>.ogg, its slices in web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { charge, impact, layer, room, rumble, seeded, subDrop, whoomph } from './design.ts';
import { spell, spellLength } from './magic.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** What is added to the eighth as built. */
interface Additions {
  /** The whoomph swept across, side to side. */
  sweep?: boolean;
  /** The air drawn in, peaking on the blow (seconds of it). */
  draw?: number;
  /** A charge ending on the blow (seconds of it). */
  charge?: number;
  /** A sub drop starting on the blow. */
  drop?: boolean;
  /** The blow's weight (1 as built). */
  heavy?: number;
}

/**
 * The eighth circle as built (magic.ts spell(8): a whoomph, one blow at 0.18 of its length, a rumble, a room), with
 * `add` timed into its one blow. The baseline's layers are drawn first, in the order the game's are, so they sound the
 * same; whatever leads in comes before, and everything shifts later by as much.
 */
function eighth(r: () => number, add: Additions = {}): Stereo {
  const s = spellLength(8);
  const hit = s * 0.18; // the blow, as built
  const lead = Math.max(add.draw ?? 0, add.charge ?? 0);
  const pre = Math.max(0, lead - hit); // what leads in needs this much before the as-built start
  const at = pre + hit; // the blow, now
  const air = whoomph(
    { seconds: s, peak: s * 0.22, fall: s * 0.8, open: 4300, sub: 55, ...(add.sweep ? { pan: [-0.7, 0.7] as [number, number] } : {}) },
    r,
  );
  const blow = impact({ hz: 52, seconds: s * 0.9 }, r);
  const roll = rumble(s, r);
  const parts: [Stereo, number, number][] = [
    [air, pre, 1],
    [blow, at, 0.9 * (add.heavy ?? 1)],
    [roll, pre + s * 0.2, 0.5],
  ];
  if (add.draw)
    parts.push([
      whoomph(
        {
          seconds: add.draw,
          peak: add.draw - 0.01,
          fall: 0.06,
          open: 2600,
          sub: 60,
          reverse: true,
          ...(add.sweep ? { pan: [-0.9, -0.3] as [number, number] } : {}),
        },
        r,
      ),
      at - add.draw,
      0.75,
    ]);
  if (add.charge) parts.push([charge({ seconds: add.charge, from: 180, to: 2400 }, r), at - add.charge, 0.6]);
  if (add.drop) parts.push([subDrop({ seconds: 0.55, from: 120, to: 30 }), at, 0.7 * (add.heavy ?? 1)]);
  return room(layer(...parts), 2.5, 0.3);
}

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  ['now8', 'As built: eighth circle (the baseline)', (r) => spell(8, r)],
  ['base', 'Baseline, rebuilt here (should sound the same as the one above)', (r) => eighth(r)],
  // --- One addition each ---
  ['sw', '+ sweep (the whoomph travelling across)', (r) => eighth(r, { sweep: true })],
  ['dr', '+ air draw (drawn in, peaking on the blow)', (r) => eighth(r, { draw: 0.4 })],
  ['ch', '+ charge (a build ending on the blow)', (r) => eighth(r, { charge: 0.45 })],
  ['sd', '+ sub drop (more weight in the one landing)', (r) => eighth(r, { drop: true })],
  ['hv', '+ heavier (the one blow stronger)', (r) => eighth(r, { heavy: 1.3 })],
  // --- Together ---
  ['sd2', 'Sweep + air draw', (r) => eighth(r, { sweep: true, draw: 0.4 })],
  ['sd3', 'Sweep + air draw + sub drop', (r) => eighth(r, { sweep: true, draw: 0.4, drop: true })],
  [
    'all',
    'Sweep + air draw + charge + sub drop + heavier',
    (r) => eighth(r, { sweep: true, draw: 0.4, charge: 0.45, drop: true, heavy: 1.2 }),
  ],
];

function main(): void {
  const done = CANDIDATES.map(([id, , make]) => {
    // Every one from the seed the game's file is rendered with (render.ts: 4099), so the baseline's air, blow and
    // rumble are the same in each.
    const pcm = make(seeded(4099));
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
