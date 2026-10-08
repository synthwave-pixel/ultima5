/**
 * render.ts
 *
 * The music, rendered: each of the Upgrade's sixteen tunes in every
 * arrangement a soundtrack plays (src/audio/soundtracks.ts) - the
 * Original's, the Remastered's, and the styles' (styles/arrange.ts) that
 * Electronic and Classical chose - made a seamless loop, set at one loudness
 * and written as Opus under web/public/music/<arrangement>/, with a manifest
 * of where each file's loop lies. A tune heard once (game/music.ts
 * HEARD_ONCE) rests five seconds before it comes round. Each file is named
 * for what it holds (BRITLAND.3fa9c01d.ogg: a hash of its bytes), so a tune
 * rendered again is a new file to every player, however long they keep the
 * old one; the folder holds only the latest of each. Run by hand when an
 * arrangement's sound changes:
 *
 *   npm run music                          every tune, every arrangement
 *   npm run music -- original              one arrangement
 *   npm run music -- strings piano BRITLAND.XMI STONES.XMI
 *
 * Original and the sampled styles need MuseScore General in tools/music/.cache (tools/music/README.md).
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARRANGEMENTS, arrangementsOf, type Arrangement } from '../../src/audio/soundtracks.ts';
import { readXmiEvents } from '../../src/audio/xmi.ts';
import { HEARD_ONCE, TUNE_FILES } from '../../src/game/music.ts';
import { renderOriginal } from './original.ts';
import { assertBounded, encode, foldTail, layOut, level, scale, type Stereo } from './pcm.ts';
import { renderRemastered } from './remastered.ts';
import { rewritten } from './rewrites.ts';
import { renderInStyle } from './styles/arrange.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const MUSIC = join(WEB, 'public', 'music');
const FONT = join(HERE, '.cache', 'MuseScore_General.sf3');
const RATE = 44100;
/** How long the last notes are let ring past the loop's end, to be folded onto its start. */
const TAIL = 4;
/** Half a second of the loop either side of its marked span in the file (pcm.ts layOut). */
const PAD = RATE / 2;
/** The silence after a tune heard once, before it comes round (seconds). */
const REST = 5;
/** The files' format: Opus at 48 kbps, in Ogg - every browser the game runs in decodes it (#120). */
const CODEC = ['-c:a', 'libopus', '-b:a', '48k'];
const EXT = 'ogg';

/** Where each file's loop lies, in seconds, by tune and arrangement. */
export type Manifest = Record<string, Partial<Record<Arrangement, { file: string; loopStart: number; loopEnd: number }>>>;
/** The manifest the game imports (ui/music.ts). */
const MANIFEST = join(WEB, 'src', 'audio', 'musicManifest.json');

/** The files of tune `stem` in `dir`, hashed or not, of any format. */
function filesOf(dir: string, stem: string): string[] {
  const own = new RegExp(`^${stem}(\\.[0-9a-f]{8})?\\.(mp3|ogg)$`);
  return readdirSync(dir).filter((f) => own.test(f));
}

/** The manifest as it is now: read afresh before each entry is written, as several renders may run at once. */
function manifestNow(): Manifest {
  const read = existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>) : {};
  // A manifest from before the soundtracks (by version, then tune) is begun again.
  return 'original' in read || 'remastered' in read ? {} : (read as Manifest);
}

/** Tune `tune` in arrangement `arrangement`: the render, `ring` seconds rung past its end, and its length as played. */
async function render(tune: string, arrangement: Arrangement, ring: number): Promise<{ pcm: Stereo; length: number; note: string }> {
  const upgrade = readXmiEvents(new Uint8Array(readFileSync(join(MUSIC, tune))));
  if (arrangement === 'original')
    return { pcm: await renderOriginal(upgrade, upgrade.length + ring, RATE, FONT), length: upgrade.length, note: '' };
  if (arrangement === 'remastered') {
    const seq = rewritten(tune, upgrade);
    return { pcm: await renderRemastered(seq, tune, seq.length + ring, RATE), length: seq.length, note: '' };
  }
  const { pcm, length, dip, over } = await renderInStyle(tune, upgrade, arrangement, ring, RATE, FONT);
  return { pcm, length, note: dip ? `, eased ${dip} dB${over ? ' - still over the target' : ''}` : '' };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const unknown = args.filter((a) => !(ARRANGEMENTS as readonly string[]).includes(a) && !TUNE_FILES.includes(a));
  if (unknown.length)
    throw new Error(
      `Not an arrangement or a tune: ${unknown.join(', ')}. Arrangements: ${ARRANGEMENTS.join(', ')}. Tunes: ${TUNE_FILES.join(', ')}.`,
    );
  const asked = ARRANGEMENTS.filter((a) => args.includes(a));
  const tunes = TUNE_FILES.filter((t) => args.includes(t));
  if (!existsSync(FONT)) throw new Error(`MuseScore General is not in ${FONT}: see tools/music/README.md`);
  for (const tune of tunes.length ? tunes : TUNE_FILES) {
    for (const arrangement of arrangementsOf(tune).filter((a) => !asked.length || asked.includes(a))) {
      const started = Date.now();
      // A tune heard once rests before it comes round: its loop that much longer, its last notes ringing into the rest.
      const rest = HEARD_ONCE.includes(tune) ? REST : 0;
      const { pcm: rendered, length, note } = await render(tune, arrangement, rest + TAIL);
      assertBounded(rendered, `${arrangement} ${tune}`);
      const loop = Math.round((length + rest) * RATE);
      scale(rendered, level(foldTail(rendered, loop)));
      const { pcm, start, end } = layOut(rendered, loop, TAIL * RATE, PAD);
      const bytes = encode(pcm, RATE, EXT, CODEC);
      const stem = tune.replace(/\.XMI$/, '');
      const name = `${stem}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.${EXT}`;
      const dir = join(MUSIC, arrangement);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), bytes);
      for (const old of filesOf(dir, stem)) if (old !== name) rmSync(join(dir, old));
      const manifest = manifestNow();
      manifest[tune] = {
        ...manifest[tune],
        [arrangement]: { file: `${arrangement}/${name}`, loopStart: start / RATE, loopEnd: end / RATE },
      };
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(
        `${arrangement} ${tune}: ${(length + rest).toFixed(1)} s, ${((Date.now() - started) / 1000).toFixed(1)} s to render${note}`,
      );
    }
  }
}

await main();
