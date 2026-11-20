/**
 * render.ts
 *
 * The music, rendered: each of a game's tunes (src/audio/tuneSet.ts; Ultima
 * V's, the Upgrade's sixteen, unless a game's own render passes its set to
 * renderTunes) in every arrangement a soundtrack plays (its picks,
 * src/audio/soundtracks.ts) - the Original's, the Remastered's, and the
 * styles' (styles/arrange.ts) that Electronic and Classical chose - made a
 * seamless loop, set at one loudness and written as Opus under
 * web/public/<its folder>/<arrangement>/, with a manifest of where each
 * file's loop lies (the set's manifestFile). A tune heard once (the set's
 * heardOnce) rests five seconds before it comes round. Each file is named
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
import { tuneSource, useTunes, type TuneSet, type TuneSource } from '../../src/audio/tuneSet.ts';
import { readXmiEvents } from '../../src/audio/xmi.ts';
import { ULTIMA5_TUNES } from '../../src/game/music.ts';
import { renderOriginal } from './original.ts';
import { assertBounded, encode, foldTail, layOut, level, scale, type Stereo } from './pcm.ts';
import { renderRemastered } from './remastered.ts';
import { rewritten } from './rewrites.ts';
import { renderInStyle } from './styles/arrange.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
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

/** The files of tune `stem` in `dir`, hashed or not, of any format. */
function filesOf(dir: string, stem: string): string[] {
  const own = new RegExp(`^${stem}(\\.[0-9a-f]{8})?\\.(mp3|ogg)$`);
  return readdirSync(dir).filter((f) => own.test(f));
}

/** The manifest at `path` as it is now: read afresh before each entry is written, as several renders may run at once. */
function manifestNow(path: string): Manifest {
  const read = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
  // A manifest from before the soundtracks (by version, then tune) is begun again.
  return 'original' in read || 'remastered' in read ? {} : (read as Manifest);
}

/**
 * Tune `tune` (its notes from `source` in `folder`) in arrangement `arrangement`: the render, `ring` seconds rung past
 * its end, and its length as played.
 */
async function render(
  tune: string,
  folder: string,
  source: TuneSource,
  arrangement: Arrangement,
  ring: number,
): Promise<{ pcm: Stereo; length: number; note: string }> {
  const upgrade = readXmiEvents(new Uint8Array(readFileSync(join(folder, source.file))), source.sequence);
  if (arrangement === 'original')
    return { pcm: await renderOriginal(upgrade, upgrade.length + ring, RATE, FONT), length: upgrade.length, note: '' };
  if (arrangement === 'remastered') {
    const seq = rewritten(tune, upgrade);
    return { pcm: await renderRemastered(seq, tune, seq.length + ring, RATE), length: seq.length, note: '' };
  }
  const { pcm, length, dip, over } = await renderInStyle(tune, upgrade, arrangement, ring, RATE, FONT);
  return { pcm, length, note: dip ? `, eased ${dip} dB${over ? ' - still over the target' : ''}` : '' };
}

/** One file to render: a tune in an arrangement, where its notes are, and its rest after (seconds; a tune heard once). */
export interface RenderJob {
  tune: string;
  arrangement: Arrangement;
  source: TuneSource;
  rest: number;
}

/**
 * What `args` ask of `set`'s render - arrangements and tunes by name, each list all where none is named: every tune
 * asked in every arrangement asked that a soundtrack plays of it. Throws on a word that is neither.
 */
export function renderJobs(set: TuneSet, args: string[]): RenderJob[] {
  const words = args.filter((a) => a !== '--');
  const unknown = words.filter((a) => !(ARRANGEMENTS as readonly string[]).includes(a) && !set.names.includes(a));
  if (unknown.length)
    throw new Error(
      `Not an arrangement or a tune: ${unknown.join(', ')}. Arrangements: ${ARRANGEMENTS.join(', ')}. Tunes: ${set.names.join(', ')}.`,
    );
  const asked = ARRANGEMENTS.filter((a) => words.includes(a));
  const tunes = set.names.filter((t) => words.includes(t));
  return (tunes.length ? tunes : set.names).flatMap((tune) =>
    arrangementsOf(tune, set.picks)
      .filter((a) => !asked.length || asked.includes(a))
      .map((arrangement) => ({
        tune,
        arrangement,
        source: tuneSource(set, tune),
        // A tune heard once rests before it comes round: its loop that much longer, its last notes ringing into the rest.
        rest: set.heardOnce.includes(tune) ? REST : 0,
      })),
  );
}

/** Render what `args` ask of `set` (renderJobs) into its folder, and its manifest. */
export async function renderTunes(set: TuneSet, args: string[]): Promise<void> {
  const jobs = renderJobs(set, args);
  // The styles ask whether a tune is heard once of the set in use (tuneSet.ts heardOnce).
  useTunes(set);
  if (!existsSync(FONT)) throw new Error(`MuseScore General is not in ${FONT}: see tools/music/README.md`);
  const folder = join(WEB, 'public', set.folder);
  const manifestFile = join(WEB, set.manifestFile);
  for (const { tune, arrangement, source, rest } of jobs) {
    const started = Date.now();
    const { pcm: rendered, length, note } = await render(tune, folder, source, arrangement, rest + TAIL);
    assertBounded(rendered, `${arrangement} ${tune}`);
    const loop = Math.round((length + rest) * RATE);
    scale(rendered, level(foldTail(rendered, loop)));
    const { pcm, start, end } = layOut(rendered, loop, TAIL * RATE, PAD);
    const bytes = encode(pcm, RATE, EXT, CODEC);
    const stem = tune.replace(/\.XMI$/, '');
    const name = `${stem}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.${EXT}`;
    const dir = join(folder, arrangement);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), bytes);
    for (const old of filesOf(dir, stem)) if (old !== name) rmSync(join(dir, old));
    const manifest = manifestNow(manifestFile);
    manifest[tune] = {
      ...manifest[tune],
      [arrangement]: { file: `${arrangement}/${name}`, loopStart: start / RATE, loopEnd: end / RATE },
    };
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `${arrangement} ${tune}: ${(length + rest).toFixed(1)} s, ${((Date.now() - started) / 1000).toFixed(1)} s to render${note}`,
    );
  }
}

// `npm run music`: Ultima V's. (Another game's render imports renderTunes and passes its own set.)
if (process.argv[1] === fileURLToPath(import.meta.url)) await renderTunes(ULTIMA5_TUNES, process.argv.slice(2));
