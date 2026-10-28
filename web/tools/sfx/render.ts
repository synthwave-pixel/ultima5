/**
 * render.ts
 *
 * The three new effects suites (src/audio/sfxKeys.ts), rendered: every
 * score (scores.ts), in each of its variants, and every note of the banks
 * the harpsichord, the lute and the chants play from, through each suite's
 * own renderer - Classical through MuseScore General (tools/music/original.ts,
 * as the Classical styles are), Ambient through remaster.ts's voices,
 * Electronic through engine.ts's playSfx. Each sound is cut half a second
 * past its score's length (faded), set at its level (the loudest 100 ms:
 * a standout -20 dBFS, an effect a turn repeats -27, the rest -24), and laid
 * end to end into one Opus file a suite, web/public/sfx/<suite>.<hash>.ogg,
 * with web/src/audio/sfxManifest.json saying where each sound lies in it.
 * The effects no score voices (steps, blows, water...) are the chip's,
 * softened (sfxKeys.ts soften), and checked with the rest (check.ts): the
 * report goes to screenshots/sfx-check.md, and the run fails if anything
 * breaks the rules, its files written all the same.
 *
 *   npm run sfx                  every suite
 *   npm run sfx -- ambient       one suite
 *
 * Classical needs MuseScore General in tools/music/.cache (tools/music/README.md).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OfflineAudioContext } from 'node-web-audio-api';
import { REPEATED, standard } from '../../src/audio/chip.ts';
import { u3Effect } from '../../src/audio/chip3.ts';
import { RULES } from '../../src/audio/effects.ts';
import { playRemaster } from '../../src/audio/remaster.ts';
import { BANKED, cueKey, NOTE_BANK, noteKey, sfxKey, soften, SUITES, type Suite } from '../../src/audio/sfxKeys.ts';
import { arrangementsFor, type Soundtrack } from '../../src/audio/soundtracks.ts';
import type { XmiEvent, XmiSequence } from '../../src/audio/xmi.ts';
import { TUNE_FILES } from '../../src/game/music.ts';
import { CUES } from '../../src/dev/sfxCatalogue.ts';
import { renderOriginal } from '../music/original.ts';
import { encode, type Stereo } from '../music/pcm.ts';
import { playSfx } from '../music/styles/engine.ts';
import { type Bands, bandsAverage, checkSuite, type Checked, loudest } from './check.ts';
import { bankScore, type Score, SCORES, VARIANTS } from './scores.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..');
const OUT = join(WEB, 'public', 'sfx');
const MANIFEST = join(WEB, 'src', 'audio', 'sfxManifest.json');
const REPORT = join(WEB, '..', 'screenshots', 'sfx-check.md');
const FONT = join(HERE, '..', 'music', '.cache', 'MuseScore_General.sf3');
const RATE = 44100;
/** How long a sound may ring past its score's length, faded over that time (seconds). */
const RING = 0.5;
/** Each sound's level: its loudest 100 ms, dBFS. */
const LEVEL = { standout: -20, repeated: -27, other: -24 };
/** Opus at 48 kbps, in Ogg, as the music is. */
const CODEC = ['-c:a', 'libopus', '-b:a', '48k'];

/** Where each sound lies in a suite's file: its variants, each `[at, length]` in seconds. */
export type SfxManifest = Record<Suite, { file: string; slices: Record<string, [number, number][]> }>;

/** The soundtrack a suite sits on. */
export const SOUNDTRACK: Record<Suite, Soundtrack> = { classical: 'classical', electronic: 'electronic', ambient: 'remastered' };

/** A score as the renderers take it: a channel a program (its program first), each note's start and end. */
export function toSequence(score: Score): XmiSequence {
  const channels = [...new Set(score.notes.map((n) => n.program))];
  if (channels.length > 15) throw new Error('a score of more than 15 instruments');
  // Channel 9 is General MIDI's drums: skipped.
  const channel = (program: number): number => {
    const c = channels.indexOf(program);
    return c >= 9 ? c + 1 : c;
  };
  const events: XmiEvent[] = channels.map((program) => ({ time: 0, kind: 'program', channel: channel(program), program }));
  const notes: XmiEvent[] = [];
  for (const n of score.notes) {
    notes.push({ time: n.at, kind: 'on', channel: channel(n.program), note: n.note, velocity: n.velocity });
    notes.push({ time: n.at + n.length, kind: 'off', channel: channel(n.program), note: n.note });
  }
  // In time order, an end before a start at the same moment (xmi.ts).
  notes.sort((a, b) => a.time - b.time || (a.kind === 'off' ? -1 : 1) - (b.kind === 'off' ? -1 : 1));
  return { events: [...events, ...notes], length: score.length };
}

/** Scale `pcm` so its loudest 100 ms is `targetDb`, less if its peak would pass `peakDb`. */
export function levelSlice(pcm: Stereo, targetDb: number, peakDb = -1): void {
  const now = loudest(pcm, RATE);
  let peak = 0;
  for (const c of pcm) for (const v of c) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return;
  const gain = Math.min(Math.pow(10, (targetDb - now) / 20), Math.pow(10, peakDb / 20) / peak);
  for (const c of pcm) for (let i = 0; i < c.length; i++) c[i] *= gain;
}

/** `pcm` cut `RING` past `length` where it runs on, faded over that last stretch; its last 10 ms faded in any case. */
export function finish(pcm: Stereo, length: number): Stereo {
  const keep = Math.min(pcm[0].length, Math.round((length + RING) * RATE));
  const cut = keep < pcm[0].length;
  const fade = cut ? Math.round(RING * RATE) : Math.min(keep, Math.round(0.01 * RATE));
  return pcm.map((c) => {
    const out = c.slice(0, keep);
    for (let i = 0; i < fade; i++) out[keep - 1 - i] *= Math.pow(i / fade, 2);
    return out;
  }) as Stereo;
}

/** Sounds laid end to end, `gap` seconds of silence after each, and where each lies. */
export function layOutAtlas(slices: { key: string; pcm: Stereo }[], gap = 0.1): { pcm: Stereo; slices: SfxManifest[Suite]['slices'] } {
  const pad = Math.round(gap * RATE);
  const total = slices.reduce((n, s) => n + s.pcm[0].length + pad, 0);
  const pcm: Stereo = [new Float32Array(total), new Float32Array(total)];
  const where: SfxManifest[Suite]['slices'] = {};
  let at = 0;
  for (const s of slices) {
    pcm[0].set(s.pcm[0], at);
    pcm[1].set(s.pcm[1], at);
    (where[s.key] ??= []).push([at / RATE, s.pcm[0].length / RATE]);
    at += s.pcm[0].length + pad;
  }
  return { pcm, slices: where };
}

/** `score` rendered in `suite`'s sound, with time for its room to ring. */
async function renderScore(suite: Suite, score: Score): Promise<Stereo> {
  const seq = toSequence(score);
  const seconds = score.length + RING + 1;
  if (suite === 'classical') return renderOriginal(seq, seconds, RATE, FONT);
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
  const base = ctx as unknown as BaseAudioContext;
  if (suite === 'ambient') playRemaster(base, base.destination, seq, 'sfx', 0);
  else playSfx(base, base.destination, seq);
  const buf = await ctx.startRendering();
  return [Float32Array.from(buf.getChannelData(0)), Float32Array.from(buf.getChannelData(1))];
}

/** Every sound a suite renders: its key, its score, and its level. */
function sounds(): { key: string; score: Score; level: number }[] {
  const out: { key: string; score: Score; level: number }[] = [];
  for (const [key, make] of Object.entries(SCORES))
    for (let v = 0; v < (VARIANTS[key] ?? 1); v++) {
      const score = make(v);
      const level = score.standout ? LEVEL.standout : REPEATED.has(key) || VARIANTS[key] ? LEVEL.repeated : LEVEL.other;
      out.push({ key, score, level });
    }
  for (const family of BANKED)
    for (let m = NOTE_BANK.low; m <= NOTE_BANK.high; m++)
      out.push({ key: noteKey(family, m), score: bankScore(family, m), level: LEVEL.other });
  return out;
}

/** The effects no score voices, as the suites play them: the chip's voice, softened. */
function shared(): Checked[] {
  const out: Checked[] = [];
  const seen = new Set<string>();
  for (const [kind, args, name] of RULES) {
    if (seen.has(name)) continue;
    seen.add(name);
    const key = sfxKey({ name }, kind, args);
    if (key === 'silent' || (key && SCORES[key.key])) continue;
    const pcm = soften(standard({ name }, kind, args, () => 0.5));
    if (pcm.length > 1) out.push({ key: name, pcm: [pcm, pcm], standout: false });
  }
  for (const name of Object.keys(CUES)) {
    if (SCORES[cueKey(name)]) continue;
    const voice = u3Effect(name);
    if (!voice) continue;
    const pcm = soften(voice);
    out.push({ key: cueKey(name), pcm: [pcm, pcm], standout: false });
  }
  return out;
}

/** The music's manifest (src/audio/musicManifest.json): each tune's file, by arrangement. */
const MUSIC = JSON.parse(readFileSync(join(WEB, 'src', 'audio', 'musicManifest.json'), 'utf8')) as Record<
  string,
  Partial<Record<string, { file: string }>>
>;

/** A music file's samples, mono, as ffmpeg decodes them. */
function decode(file: string): Float32Array {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', `${RATE}`, '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** A soundtrack's music in the bands: the median of every file it plays. */
function reference(soundtrack: Soundtrack): Bands {
  const files = new Set<string>();
  for (const tune of TUNE_FILES)
    for (const occasion of [undefined, 'title', 'shrine', 'introduction', 'closing', 'night'] as const)
      for (const a of arrangementsFor(soundtrack, tune, occasion)) {
        const entry = MUSIC[tune]?.[a];
        if (entry) files.add(entry.file);
      }
  const measured = [...files].map((f) => bandsAverage(decode(join(WEB, 'public', 'music', f)), RATE));
  const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  return { presence: median(measured.map((m) => m.presence)), sibilance: median(measured.map((m) => m.sibilance)) };
}

async function main(): Promise<void> {
  const only = process.argv.slice(2).filter((a): a is Suite => (SUITES as readonly string[]).includes(a));
  const suites = only.length ? only : [...SUITES];
  if (suites.includes('classical') && !existsSync(FONT)) throw new Error(`MuseScore General is needed in ${FONT}`);
  mkdirSync(OUT, { recursive: true });
  const manifest = (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}) as Partial<SfxManifest>;
  const report: string[] = ['# The effects suites, checked', ''];
  const failures: string[] = [];
  const refs = new Map<Suite, Bands>();
  for (const suite of suites) {
    process.stdout.write(`${suite}: measuring its music`);
    const ref = reference(SOUNDTRACK[suite]);
    refs.set(suite, ref);
    process.stdout.write(', rendering');
    const done: { key: string; pcm: Stereo; standout: boolean }[] = [];
    for (const s of sounds()) {
      const pcm = finish(await renderScore(suite, s.score), s.score.length);
      levelSlice(pcm, s.level);
      done.push({ key: s.key, pcm, standout: !!s.score.standout });
      if (done.length % 20 === 0) process.stdout.write('.');
    }
    const { pcm, slices } = layOutAtlas(done);
    const bytes = encode(pcm, RATE, 'ogg', CODEC);
    const name = `${suite}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.ogg`;
    writeFileSync(join(OUT, name), bytes);
    for (const old of readdirSync(OUT)) if (old.startsWith(`${suite}.`) && old !== name) rmSync(join(OUT, old));
    manifest[suite] = { file: `sfx/${name}`, slices };
    const found = checkSuite(suite, done, ref);
    failures.push(...found);
    report.push(`## ${suite}`, '', `${name}: ${(bytes.length / 1e6).toFixed(2)} MB, ${done.length} sounds.`, '');
    report.push(...(found.length ? found.map((f) => `- ${f}`) : ['Nothing breaks the rules.']), '');
    console.log(` ${name} (${(bytes.length / 1e6).toFixed(2)} MB), ${found.length} over`);
  }
  // The shared effects, against the strictest of the soundtracks measured.
  const strictest: Bands = {
    presence: Math.min(...[...refs.values()].map((r) => r.presence)),
    sibilance: Math.min(...[...refs.values()].map((r) => r.sibilance)),
  };
  const sharedFound = checkSuite('shared', shared(), refs.size ? strictest : undefined);
  failures.push(...sharedFound);
  report.push(
    '## shared (the chip voices, softened)',
    '',
    ...(sharedFound.length ? sharedFound.map((f) => `- ${f}`) : ['Nothing breaks the rules.']),
    '',
  );
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${report.join('\n')}\n`);
  console.log(`${failures.length} over the rules: ${REPORT}`);
  if (failures.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
