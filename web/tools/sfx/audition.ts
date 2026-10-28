/**
 * audition.ts
 *
 * The sound test page's Audition section: the magic (magic.ts), every effect of it in one place, played from the
 * Classical suite's own file - the very sounds the game plays (the magic is the same in every suite) - each spell in
 * its three variants. Written from the render's manifest, so run it after the render:
 *
 *   npm run sfx && node --import ./tools/node-ts.mjs tools/sfx/audition.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SfxManifest } from '../../src/audio/sfxKeys.ts';
import { ABOUT, CUES } from '../../src/dev/sfxCatalogue.ts';
import { MAGIC } from './magic.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');

/** What the catalogue calls effect `key`. */
const named = (key: string): string => (key.startsWith('cue:') ? CUES[key.slice(4)]?.what : ABOUT[key]?.what) ?? key;

function main(): void {
  const manifest = JSON.parse(readFileSync(join(WEB, 'src', 'audio', 'sfxManifest.json'), 'utf8')) as SfxManifest;
  const { file, slices } = manifest.classical;
  const items = Object.keys(MAGIC).flatMap((key) =>
    (slices[key] ?? []).map((slice, v, all) => ({
      id: `${key}.${v}`,
      label: all.length > 1 ? `${named(key)} (${v + 1} of ${all.length})` : named(key),
      slice,
    })),
  );
  writeFileSync(join(WEB, 'src', 'dev', 'audition.json'), `${JSON.stringify({ file, items }, null, 2)}\n`);
  console.log(`${items.length} sounds of the magic, from ${file}`);
}

main();
