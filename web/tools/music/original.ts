/**
 * original.ts
 *
 * The Original version of a tune: the Upgrade's General MIDI arrangement
 * played by a SoundFont synthesizer (spessasynth_core) through MuseScore
 * General, as a wavetable card or Windows' MIDI synth would have played it.
 * The events are given to the synthesizer at their own times, a block of
 * samples at a time; nothing of it is shipped but what it renders.
 */

import { readFileSync } from 'node:fs';
import { type BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from 'spessasynth_core';
import type { XmiSequence } from '../../src/audio/xmi.ts';
import type { Stereo } from './pcm.ts';

/** The synthesizer's block: events land on its boundaries (under 3 ms at 44.1 kHz). */
const BLOCK = 128;

let bank: BasicSoundBank | null = null;

/** MuseScore General, read once (tools/music/.cache, fetched by curl: tools/music/README.md). */
function soundBank(path: string): BasicSoundBank {
  if (!bank) {
    const file = readFileSync(path);
    bank = SoundBankLoader.fromArrayBuffer(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  }
  return bank;
}

/** `seq` rendered for `seconds` at `rate`, through the SoundFont at `fontPath`. */
export async function renderOriginal(seq: XmiSequence, seconds: number, rate: number, fontPath: string): Promise<Stereo> {
  const synth = new SpessaSynthProcessor(rate, { maxBufferSize: BLOCK });
  synth.soundBankManager.addSoundBank(soundBank(fontPath), 'main');
  await synth.processorInitialized;
  const total = Math.ceil(seconds * rate);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  let next = 0;
  for (let at = 0; at < total; at += BLOCK) {
    const until = (at + BLOCK) / rate;
    for (; next < seq.events.length && seq.events[next].time < until; next++) {
      const e = seq.events[next];
      switch (e.kind) {
        case 'on':
          synth.noteOn(e.channel, e.note, e.velocity);
          break;
        case 'off':
          synth.noteOff(e.channel, e.note);
          break;
        case 'program':
          synth.programChange(e.channel, e.program);
          break;
        case 'controller':
          synth.controllerChange(e.channel, e.controller as Parameters<typeof synth.controllerChange>[1], e.value);
          break;
        case 'bend':
          synth.pitchWheel(e.channel, e.value);
          break;
      }
    }
    synth.process(left, right, at, Math.min(BLOCK, total - at));
  }
  return [left, right];
}
