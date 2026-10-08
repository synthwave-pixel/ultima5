/**
 * remastered.ts
 *
 * The Remastered version of a tune, rendered: src/audio/remaster.ts's
 * voices on an offline Web Audio context in Node (node-web-audio-api); the
 * same code could be played live on any context.
 */

import { OfflineAudioContext } from 'node-web-audio-api';
import { playRemaster } from '../../src/audio/remaster.ts';
import type { XmiSequence } from '../../src/audio/xmi.ts';
import type { Stereo } from './pcm.ts';

/** `seq` (`tune`) rendered for `seconds` at `rate`. */
export async function renderRemastered(seq: XmiSequence, tune: string, seconds: number, rate: number): Promise<Stereo> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const context = ctx as unknown as BaseAudioContext;
  playRemaster(context, context.destination, seq, tune, 0);
  const buf = await ctx.startRendering();
  return [Float32Array.from(buf.getChannelData(0)), Float32Array.from(buf.getChannelData(1))];
}
