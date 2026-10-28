/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the spells' higher circles, to choose by ear (the sound test page's
 * Audition section). The user's pick so far is the eighth circle as built - one rise, one blow - its blow a sub bloom
 * (pressure without a beater). The higher circles want more, mystical but not musical, and still one rise and one
 * bloom: whispers (breath through a voice's vowels), a pre-verb (the air's echo backwards into the bloom), a swirl (a
 * sweeping comb), a throb (the bloom beating), a chamber (inharmonic resonances of a stone hall), a hover (the air held
 * and smeared after); then some together. Rendered to web/public/sfx/audition.<hash>.ogg, its slices in
 * web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { chamber, hover, impact, layer, preverb, room, rumble, seeded, subBloom, swirl, whispers, whoomph } from './design.ts';
import { spellLength } from './magic.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** What the higher circles may add to the eighth as picked. */
interface Mystic {
  whispers?: boolean;
  preverb?: boolean;
  swirl?: boolean;
  throb?: boolean;
  chamber?: boolean;
  hover?: boolean;
  /** The sweep across and the air drawn in to the bloom (from an earlier round). */
  sweep?: boolean;
}

/**
 * The eighth circle as the user picked it - the as-built whoomph and rumble with a sub bloom for its blow (pressure
 * without a beater) - with `add`. The base is drawn from `r` as the pick was (the whoomph, the kick drawn but unused,
 * the rumble), so it sounds the same; whatever leads into the bloom comes before, and the rest shifts later by as much.
 */
function eighth(r: () => number, add: Mystic = {}): Stereo {
  const s = spellLength(8);
  const hit = s * 0.18;
  const lead = Math.max(add.preverb ? 0.6 : 0, add.sweep ? 0.4 : 0);
  const pre = Math.max(0, lead - hit);
  const at = pre + hit; // the bloom
  let air = whoomph(
    { seconds: s, peak: s * 0.22, fall: s * 0.8, open: 4300, sub: 55, ...(add.sweep ? { pan: [-0.7, 0.7] as [number, number] } : {}) },
    r,
  );
  impact({ hz: 52, seconds: s * 0.9 }, r); // drawn as the pick's was, so the rumble's draws match
  const roll = rumble(s, r);
  if (add.swirl) air = swirl(air, 1.5, 9, 0.55);
  const parts: [Stereo, number, number][] = [
    [air, pre, 1],
    [roll, pre + s * 0.2, 0.5],
    [subBloom({ hz: 45, seconds: 1.2, attack: 0.04, ...(add.throb ? { beat: 1.4 } : {}) }), at, 0.9],
  ];
  if (add.sweep)
    parts.push([
      whoomph({ seconds: 0.4, peak: 0.39, fall: 0.06, open: 2600, sub: 60, reverse: true, pan: [-0.9, -0.3] }, r),
      at - 0.4,
      0.75,
    ]);
  if (add.whispers) {
    const span = at + 1.1;
    parts.push([whispers({ seconds: span, swell: (t) => (t < at ? (t / at) ** 2 : Math.pow(0.001, (t - at) / (span - at))) }, r), 0, 1.4]);
  }
  if (add.preverb) parts.push([preverb({ seconds: 0.6 }, r), at - 0.6, 0.7]);
  if (add.chamber) parts.push([chamber({ hz: 110, seconds: 1.6 }, r), at, 0.35]);
  if (add.hover) parts.push([hover(air, { at: s * 0.22, seconds: 1.1 }, r), at + 0.08, 1.2]);
  return room(layer(...parts), 2.5, 0.3);
}

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  ['base', 'Your pick: the eighth with the sub bloom (the base for all below)', (r) => eighth(r)],
  // --- One mystical layer each ---
  ['wh', "+ whispers (breath through a voice's vowels, ah to oo: ghostly voices, no pitch)", (r) => eighth(r, { whispers: true })],
  ['pv', "+ pre-verb (the air's own echo played backwards, arriving out of nothing into the bloom)", (r) => eighth(r, { preverb: true })],
  ['sw', '+ swirl (the air through a slowly sweeping comb: an otherworldly phasing)', (r) => eighth(r, { swirl: true })],
  ['th', '+ throb (the bloom two tones a hair apart, beating: the pressure pulsing as it fades)', (r) => eighth(r, { throb: true })],
  ['ch', "+ chamber (the air ringing a stone hall's resonances, inharmonic, no chord)", (r) => eighth(r, { chamber: true })],
  ['hv', '+ hover (the air held and smeared after the bloom, as if time slowed)', (r) => eighth(r, { hover: true })],
  ['sd', '+ sweep and draw (from an earlier round: across, and drawn in to the bloom)', (r) => eighth(r, { sweep: true })],
  // --- Together ---
  ['c1', 'Whispers + throb + sweep and draw', (r) => eighth(r, { whispers: true, throb: true, sweep: true })],
  ['c2', 'Pre-verb + chamber + hover', (r) => eighth(r, { preverb: true, chamber: true, hover: true })],
  ['c3', 'Swirl + throb + hover', (r) => eighth(r, { swirl: true, throb: true, hover: true })],
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
