/**
 * render.ts (tools/music/styles)
 *
 * The Upgrade's tunes (all sixteen, unless some are named) rendered in each style (arrange.ts) to listen to: once
 * through and a fade, levelled as the game's are, into screenshots/styles-v2/<style>/. The game's own are rendered by
 * tools/music/render.ts.
 *
 *   npx vite-node tools/music/styles/render.ts [style...] [TUNE.XMI...]
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXmiEvents } from '../../../src/audio/xmi.ts';
import { encodeMp3, level } from '../pcm.ts';
import { ALL_STYLES, renderInStyle } from './arrange.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..', '..');
const OUT = join(WEB, '..', 'screenshots', 'styles-v2');
const MUSIC = join(WEB, 'public', 'music');
const FONT = join(HERE, '..', '.cache', 'MuseScore_General.sf3');
const RATE = 44100;
const TAIL = 5;

const args = process.argv.slice(2).filter((a) => a !== '--');
const styles = ALL_STYLES.filter((s) => args.includes(s));
const tunes = args.filter((a) => a.endsWith('.XMI'));
for (const style of styles.length ? styles : ALL_STYLES) {
  mkdirSync(join(OUT, style), { recursive: true });
  for (const tune of tunes.length ? tunes : readdirSync(MUSIC).filter((f) => f.endsWith('.XMI'))) {
    const started = Date.now();
    const upgrade = readXmiEvents(new Uint8Array(readFileSync(join(MUSIC, tune))));
    const { pcm, length, dip, over } = await renderInStyle(tune, upgrade, style, TAIL, RATE, FONT);
    // Faded over the tail, as a track ends.
    const fadeFrom = Math.round(length * RATE);
    for (const ch of pcm) for (let i = fadeFrom; i < ch.length; i++) ch[i] *= 1 - (i - fadeFrom) / (ch.length - fadeFrom);
    level(pcm);
    writeFileSync(join(OUT, style, tune.replace(/\.XMI$/, '.mp3')), encodeMp3(pcm, RATE, 128));
    const note = dip ? `, eased ${dip} dB${over ? ' - still over the target' : ''}` : '';
    console.log(`${style} ${tune}: ${((Date.now() - started) / 1000).toFixed(1)} s${note}`);
  }
}
