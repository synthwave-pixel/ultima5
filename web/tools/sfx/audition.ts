/**
 * audition.ts
 *
 * A listening aid, not the game's: candidates for the eighth circle's blow, to choose by ear (the sound test page's
 * Audition section). The eighth as built has one rise and one blow - the shape the user wants - but its blow (a sine
 * swept down under a burst of noise, as a kick drum is made) sounds like a drum. So here the blow is swapped for ones
 * with no drumhead - an air blast, a softer bloom, a sub bloom at one pitch, a concussion, a shatter of air, the sub
 * drop alone, none at all, and a blast with a bloom - the whoomph and the rumble the same in each. Rendered to
 * web/public/sfx/audition.<hash>.ogg, its slices in web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode, type Stereo } from '../music/pcm.ts';
import { airBlast, concussion, impact, layer, room, rumble, seeded, shatter, subBloom, subDrop, whoomph } from './design.ts';
import { spell, spellLength } from './magic.ts';
import { layOutAtlas, levelSlice } from './render.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const RATE = 44100;

/** The blow's kinds: the as-built kick, and ones without a drumhead. */
type Blow = 'kick' | 'blast' | 'bloom' | 'sub' | 'concussion' | 'shatter' | 'drop' | 'none' | 'blast+sub';

/**
 * The eighth circle as built (magic.ts spell(8): a whoomph, one blow at 0.18 of its length, a rumble, a room), its blow
 * `blow`. The whoomph and the rumble are drawn first from `r`, as the game's are, so they sound the same in each; where
 * there is no blow the whoomph's peak is sharpened to be the moment instead.
 */
function eighth(r: () => number, blow: Blow): Stereo {
  const s = spellLength(8);
  const hit = s * 0.18;
  const air =
    blow === 'none'
      ? whoomph({ seconds: s, peak: hit, fall: s * 0.7, open: 5200, sub: 55 }, r)
      : whoomph({ seconds: s, peak: s * 0.22, fall: s * 0.8, open: 4300, sub: 55 }, r);
  const kick = impact({ hz: 52, seconds: s * 0.9 }, r); // drawn in every one, so the rumble's draws match the game's
  const roll = rumble(s, r);
  const parts: [Stereo, number, number][] = [
    [air, 0, 1],
    [roll, s * 0.2, 0.5],
  ];
  const at = (sound: Stereo, gain: number): void => void parts.push([sound, hit, gain]);
  if (blow === 'kick') at(kick, 0.9);
  if (blow === 'blast' || blow === 'blast+sub') at(airBlast({ seconds: 0.9, attack: 0.004 }, r), 0.8);
  if (blow === 'bloom') at(airBlast({ seconds: 1, attack: 0.025, open: 5000 }, r), 0.9);
  if (blow === 'sub' || blow === 'blast+sub') at(subBloom({ hz: 45, seconds: 1.2, attack: 0.04 }), blow === 'sub' ? 0.9 : 0.6);
  if (blow === 'concussion') at(concussion({ seconds: 1.1 }, r), 0.8);
  if (blow === 'shatter') at(shatter({ seconds: 0.9, count: 40, spread: 0.12 }, r), 0.8);
  if (blow === 'drop') at(subDrop({ seconds: 0.7, from: 120, to: 30 }), 0.9);
  return room(layer(...parts), 2.5, 0.3);
}

/** The candidates: id, label, sound. */
const CANDIDATES: [string, string, (r: () => number) => Stereo][] = [
  ['now8', 'As built: eighth circle (its blow the drum-like kick)', (r) => spell(8, r)],
  ['bl', 'Air blast (displaced air flaring open and closing - no pitch)', (r) => eighth(r, 'blast')],
  ['bm', 'Soft bloom (the blast with a slower attack: a surge, not a hit)', (r) => eighth(r, 'bloom')],
  ['sb', 'Sub bloom (pressure without a beater: a deep tone swelling in, no falling pitch)', (r) => eighth(r, 'sub')],
  ['co', 'Concussion (a dark, driven burst of low air, a muffled blast far off)', (r) => eighth(r, 'concussion')],
  ['sh', 'Shatter of air (soft fragments overlapping, no single attack)', (r) => eighth(r, 'shatter')],
  ['dp', 'Sub drop only (the falling weight, smooth, no noise on top)', (r) => eighth(r, 'drop')],
  ['no', 'No impact (the whoomph alone, its peak sharpened to be the moment)', (r) => eighth(r, 'none')],
  ['bs', 'Air blast + sub bloom (air and weight, still no beater)', (r) => eighth(r, 'blast+sub')],
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
