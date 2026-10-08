/**
 * fatigue.ts
 *
 * Every music render measured for what tires the ear (spectrum.ts): the
 * game's (public/music/<version>/) and the styles' (screenshots/styles-v2/),
 * reported, the harshest first, to screenshots/fatigue.md.
 *
 *   node --import ./tools/node-ts.mjs tools/music/fatigue.ts
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Fatigue, measure, OCTAVES } from './spectrum.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const SCREENSHOTS = join(WEB, '..', 'screenshots');
const RATE = 44100;

/** Each set of renders: its name and folder. */
const SETS: [string, string][] = [
  ['Original', join(WEB, 'public', 'music', 'original')],
  ['Remastered', join(WEB, 'public', 'music', 'remastered')],
  ...['grid', 'newwave', 'upsidedown'].map((s): [string, string] => [`Electronic ${s}`, join(SCREENSHOTS, 'styles-v2', s)]),
  ...['celtic', 'consort', 'orchestra', 'piano', 'strings'].map((s): [string, string] => [
    `Classical ${s}`,
    join(SCREENSHOTS, 'styles-v2', s),
  ]),
];

/** A file's samples, mono, as ffmpeg decodes them. */
function decode(file: string): Float32Array {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', `${RATE}`, '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

const rows: { set: string; tune: string; m: Fatigue }[] = [];
for (const [set, dir] of SETS) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => /\.(mp3|ogg)$/.test(f))) {
    rows.push({ set, tune: file.replace(/(\.[0-9a-f]{8})?\.(mp3|ogg)$/, ''), m: measure(decode(join(dir, file)), RATE) });
    process.stdout.write('.');
  }
}

const f1 = (x: number): string => x.toFixed(1);
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const out = [
  '# Listening fatigue, every render',
  '',
  'Presence: dB of the sound from 2-5 kHz (the ear most sensitive). Sibilance: 5-10 kHz. Tilt: dB an octave, 250 Hz-8 kHz.',
  'Harshest: presence of the harshest seconds.',
  'Range: how far the loudness moves, dB. Lower presence, sibilance and harshest are easier; a steeper (more',
  'negative) tilt warmer; more range less of a wall.',
  '',
  '## By set (medians)',
  '',
  '| Set | Presence | Sibilance | Tilt | Harshest | Range |',
  '|---|---|---|---|---|---|',
  ...SETS.map(([set]) => rows.filter((r) => r.set === set))
    .filter((rs) => rs.length)
    .map((rs) => {
      const m = (f: (x: Fatigue) => number): string => f1(median(rs.map((r) => f(r.m))));
      return `| ${rs[0].set} | ${m((x) => x.presence)} | ${m((x) => x.sibilance)} | ${m((x) => x.tilt)} | ${m((x) => x.harshest)} | ${m((x) => x.range)} |`;
    }),
  '',
  '## Every render, the harshest first',
  '',
  `| Set | Tune | Presence | Sibilance | Tilt | Harshest | Range | ${OCTAVES.map((o) => (o >= 1000 ? `${o / 1000}k` : `${o}`)).join(' | ')} |`,
  `|---|---|---|---|---|---|---|${OCTAVES.map(() => '---').join('|')}|`,
  ...[...rows]
    .sort((a, b) => b.m.harshest - a.m.harshest)
    .map(
      ({ set, tune, m }) =>
        `| ${set} | ${tune} | ${f1(m.presence)} | ${f1(m.sibilance)} | ${f1(m.tilt)} | ${f1(m.harshest)} | ${f1(m.range)} | ${m.octaves.map(f1).join(' | ')} |`,
    ),
  '',
];
writeFileSync(join(SCREENSHOTS, 'fatigue.md'), out.join('\n'));
console.log(`\n${rows.length} renders measured: screenshots/fatigue.md`);
