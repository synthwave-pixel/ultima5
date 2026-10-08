/**
 * known.ts
 *
 * Writes src/install/known.ts: the fingerprint (size and CRC-32) of each
 * file the engine reads, as MS-DOS Ultima V v1.16 has it - GOG's copy and
 * the Internet Archive's are the same, byte for byte - and the Upgrade's
 * own DATA.OVL beside it. Fingerprints, not the files: nothing of the game
 * is in them. Run, with a copy in ../gamedata/ultima5 (gamedata/README.md):
 *
 *   npm run known
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint, REQUIRED } from '../../src/install/gameFiles.ts';

const GAME = fileURLToPath(new URL('../../../gamedata/ultima5', import.meta.url));
const OUT = fileURLToPath(new URL('../../src/install/known.ts', import.meta.url));

const lines = REQUIRED.map((name) => {
  const prints = [fingerprint(new Uint8Array(readFileSync(join(GAME, name))))];
  const upgrade = join(GAME, 'upgrade', name);
  if (existsSync(upgrade)) {
    const other = fingerprint(new Uint8Array(readFileSync(upgrade)));
    if (!prints.includes(other)) prints.push(other);
  }
  return `  '${name}': [${prints.map((p) => `'${p}'`).join(', ')}],`;
});

writeFileSync(
  OUT,
  `/**
 * known.ts - written by tools/install/known.ts (npm run known); not edited by hand.
 *
 * Each file the engine reads, as the known copies have it: its size and CRC-32 (gameFiles.ts fingerprint). A file
 * that is none of these is told of when it is installed - edited, or damaged - and installed all the same if the
 * player says so.
 */

export const KNOWN: Record<string, string[]> = {
${lines.join('\n')}
};
`,
);
console.log(`${REQUIRED.length} files written to ${OUT}`);
