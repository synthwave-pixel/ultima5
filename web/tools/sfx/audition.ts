/**
 * audition.ts
 *
 * A listening aid, not the game's: one magic gesture played on each of MuseScore General's candidate presets, alone
 * and in three blends, to choose the magic's sound by ear (the sound test page's Audition section). The gesture is
 * neutral - neither good nor ill: a stack of fourths (no major or minor), drawn up and let settle, glints strewn
 * through, a fourth circle's length; the blends also play it sinking (magic undone). Rendered through the SoundFont
 * to web/public/sfx/audition.<hash>.ogg, its slices in web/src/dev/audition.json.
 *
 *   node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { createHash } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderOriginal } from '../music/original.ts';
import { encode } from '../music/pcm.ts';
import { finish, layOutAtlas, levelSlice, toSequence } from './render.ts';
import type { Score, SfxNote } from './scores.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const FONT = join(HERE, '..', 'music', '.cache', 'MuseScore_General.sf3');
const RATE = 44100;
const SECONDS = 0.85;

/** The presets heard, by General MIDI program. */
const PRESETS: [number, string, 'bed' | 'glints' | 'swell'][] = [
  [92, 'Bowed Glass', 'bed'],
  [94, 'Halo Pad', 'bed'],
  [91, 'Space Voice', 'bed'],
  [88, 'Fantasia', 'bed'],
  [99, 'Atmosphere', 'bed'],
  [97, 'Soundtrack', 'bed'],
  [95, 'Sweep Pad', 'bed'],
  [89, 'Warm Pad', 'bed'],
  [53, 'Voice Oohs', 'bed'],
  [44, 'Strings Tremolo', 'bed'],
  [98, 'Crystal', 'glints'],
  [96, 'Ice Rain', 'glints'],
  [102, 'Echo Drops', 'glints'],
  [103, 'Star Theme', 'glints'],
  [112, 'Tinker Bell', 'glints'],
  [8, 'Celesta', 'glints'],
  [11, 'Vibraphone', 'glints'],
  [46, 'Harp', 'glints'],
  [119, 'Reverse Cymbal', 'swell'],
];

/** The fourths the gesture is built of: D, G, C, F, B-flat, E-flat - no third, so no major or minor. */
const FOURTHS = [50, 55, 60, 65, 70, 75];

const note = (at: number, n: number, length: number, program: number, velocity: number): SfxNote => ({
  at,
  note: n,
  length,
  velocity,
  program,
});

/** A held cluster of fourths on `program`, low to middle, entering one by one as the spell is drawn up. */
const bed = (program: number, sinking = false): SfxNote[] =>
  (sinking ? [65, 60, 55, 50] : [50, 55, 60, 65]).map((n, i) => note(i * 0.06, n, SECONDS - i * 0.06, program, 70 - i * 6));

/** Glints: the fourths struck here and there, unmetered, on `program`; falling where the gesture sinks. */
function glints(program: number, sinking = false): SfxNote[] {
  const times = [0.05, 0.17, 0.26, 0.38, 0.47, 0.6];
  const notes = sinking ? [...FOURTHS].reverse() : [FOURTHS[2], FOURTHS[4], FOURTHS[3], FOURTHS[5], FOURTHS[1], FOURTHS[4]];
  return times.map((at, i) => note(at, notes[i] + (program === 46 ? 0 : 12) - 12, 0.35, program, 55 - (i % 3) * 8));
}

/** A swell rushing in (the Reverse Cymbal): one note, held through. */
const swell = (program: number): SfxNote[] => [note(0, 60, SECONDS, program, 70)];

const score = (notes: SfxNote[]): Score => ({ length: SECONDS, notes });

/** The blends proposed for each suite: [label, notes]. */
const BLENDS: [string, (sinking: boolean) => SfxNote[]][] = [
  [
    'Blend: Classical (Voice Oohs, Strings Tremolo, Harp, Tinker Bell, Reverse Cymbal)',
    (s) => [
      ...bed(53, s),
      ...bed(44, s).map((n) => ({ ...n, velocity: n.velocity - 20 })),
      ...glints(46, s),
      ...glints(112, s).slice(0, 3),
      ...(s ? [] : swell(119)),
    ],
  ],
  [
    'Blend: Electronic (Crystal, Echo Drops, Ice Rain, Sweep Pad)',
    (s) => [...bed(95, s), ...glints(98, s), ...glints(102, s).slice(0, 3), ...glints(96, s).slice(3)],
  ],
  [
    'Blend: Ambient (Halo Pad, Bowed Glass, Space Voice, Atmosphere)',
    (s) => [
      ...bed(94, s),
      ...bed(92, s).map((n) => ({ ...n, velocity: n.velocity - 15 })),
      ...bed(91, s).slice(0, 2),
      ...glints(99, s).slice(0, 4),
    ],
  ],
];

async function main(): Promise<void> {
  const items: { id: string; label: string; score: Score }[] = [];
  for (const [program, name, kind] of PRESETS)
    items.push({
      id: `p${program}`,
      label: `${name} (${program})`,
      score: score(kind === 'bed' ? bed(program) : kind === 'glints' ? glints(program) : swell(program)),
    });
  BLENDS.forEach(([label, notes], i) => {
    items.push({ id: `b${i}`, label: `${label}: cast`, score: score(notes(false)) });
    items.push({ id: `b${i}u`, label: `${label}: undone`, score: score(notes(true)) });
  });
  const done = [];
  for (const it of items) {
    const pcm = finish(await renderOriginal(toSequence(it.score), SECONDS + 2, RATE, FONT), SECONDS);
    levelSlice(pcm, -24);
    done.push({ key: it.id, pcm });
    process.stdout.write('.');
  }
  const { pcm, slices } = layOutAtlas(done);
  const bytes = encode(pcm, RATE, 'ogg', ['-c:a', 'libopus', '-b:a', '64k']);
  const dir = join(WEB, 'public', 'sfx');
  const name = `audition.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.ogg`;
  writeFileSync(join(dir, name), bytes);
  for (const old of readdirSync(dir)) if (old.startsWith('audition.') && old !== name) rmSync(join(dir, old));
  const out = { file: `sfx/${name}`, items: items.map((it) => ({ id: it.id, label: it.label, slice: slices[it.id][0] })) };
  writeFileSync(join(WEB, 'src', 'dev', 'audition.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(` ${name}, ${items.length} sounds`);
}

await main();
