/**
 * pcm.ts
 *
 * The music render's last steps, the same for both versions (render.ts): a
 * tune rendered for one turn of its loop and a tail, made a loop that
 * comes round without a seam, set at the level every tune is heard at, and
 * written as a file the player loops (ui/music.ts).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Stereo PCM: the left channel and the right, the same length. */
export type Stereo = [Float32Array, Float32Array];

/**
 * One turn of a loop `loop` samples long, from a render of it and the tail
 * after it (the last notes ringing on): the tail added onto the loop's
 * start, as it rings into the next turn when the loop comes round.
 */
export function foldTail(pcm: Stereo, loop: number): Stereo {
  return pcm.map((ch) => {
    const out = ch.slice(0, loop);
    for (let i = loop; i < ch.length; i++) out[(i - loop) % loop] += ch[i];
    return out;
  }) as Stereo;
}

/**
 * A tune as its file holds it, played from the file's start and looped between `start` and `end`. `rendered` is the
 * render (the loop and the `tail` of its last notes ringing on) and `loop` the loop's length, all in samples. The file
 * is the render's first `tail` samples as they sounded the first time through, the notes not yet ringing in from the
 * end of the loop - then the loop folded (foldTail), on round and round for as far as the file goes. The loop is
 * marked `pad` samples inside that, so that a window one loop long from `pad` before it to `pad` after is the loop
 * itself, begun a little early or late: a decoder that adds or trims a few hundred samples at a file's start (an
 * MP3's priming) shifts the loop but leaves no seam, the head, where the render and the loop differ, being kept
 * clear of every such window. Returns the samples, and where the loop lies in them.
 */
export function layOut(rendered: Stereo, loop: number, tail: number, pad: number): { pcm: Stereo; start: number; end: number } {
  const folded = foldTail(rendered, loop);
  const total = loop + tail + 2 * pad;
  const pcm = folded.map((f, c) => {
    const out = new Float32Array(total);
    for (let i = 0; i < total; i++) out[i] = i < tail ? rendered[c][i] : f[i % loop];
    return out;
  }) as Stereo;
  return { pcm, start: tail + pad, end: tail + pad + loop };
}

/** `pcm` made `gain` times as loud. */
export function scale(pcm: Stereo, gain: number): void {
  for (const ch of pcm) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}

/**
 * Refuses a render that ran away: no sound the voices make comes near this far past full scale, so a sample out here
 * is an unstable filter or envelope in the renderer, which levelling would hide as a near-silent file.
 */
export function assertBounded(pcm: Stereo, what: string, limit = 8): void {
  for (const ch of pcm)
    for (let i = 0; i < ch.length; i++)
      if (!(Math.abs(ch[i]) <= limit)) throw new Error(`${what} ran away at ${(i / 44100).toFixed(2)} s (${ch[i]})`);
}

/**
 * `pcm` set at one level, the same for every tune and both versions: an RMS
 * of `rmsDb` (dBFS), unless that would take a peak over `peakDb`, when the
 * peak decides. Returns the gain it took.
 */
export function level(pcm: Stereo, rmsDb = -20, peakDb = -1): number {
  let sum = 0;
  let peak = 0;
  for (const ch of pcm)
    for (const v of ch) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
  const rms = Math.sqrt(sum / (pcm[0].length * 2));
  if (rms === 0) return 1;
  const gain = Math.min(10 ** (rmsDb / 20) / rms, 10 ** (peakDb / 20) / peak);
  scale(pcm, gain);
  return gain;
}

/** `pcm` at `rate` encoded by ffmpeg with `codec` (its arguments) into a file of type `ext`: its bytes. */
export function encode(pcm: Stereo, rate: number, ext: string, codec: string[]): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'u5music-'));
  try {
    const raw = join(dir, 'pcm.f32');
    const out = join(dir, `out.${ext}`);
    const both = new Float32Array(pcm[0].length * 2);
    for (let i = 0; i < pcm[0].length; i++) {
      both[2 * i] = pcm[0][i];
      both[2 * i + 1] = pcm[1][i];
    }
    writeFileSync(raw, Buffer.from(both.buffer));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(rate), '-ac', '2', '-i', raw, ...codec, out]);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `pcm` at `rate` as an MP3 at `kbps` (ffmpeg's LAME): its bytes. */
export function encodeMp3(pcm: Stereo, rate: number, kbps = 96): Buffer {
  return encode(pcm, rate, 'mp3', ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`]);
}
