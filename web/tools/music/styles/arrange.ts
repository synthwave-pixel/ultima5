/**
 * arrange.ts
 *
 * A tune rendered in one of the styles: arranged (orchestrate.ts, engine.ts),
 * played as its treatment asks - Blackthorn's ominous and slower, Britannia's
 * mellow, the Fanfare serene - and, where it is heard over and over, eased
 * for the ear (ease.ts). For the game's music (tools/music/render.ts) and the
 * styles' listening renders (render.ts) alike.
 */

import { OfflineAudioContext } from 'node-web-audio-api';
import type { XmiSequence } from '../../../src/audio/xmi.ts';
import { HEARD_ONCE } from '../../../src/game/music.ts';
import { easeToTarget } from '../ease.ts';
import { renderOriginal } from '../original.ts';
import { assertBounded, type Stereo } from '../pcm.ts';
import { rewritten } from '../rewrites.ts';
import { KEYBOARDS, playKeyboard, playStyle, prepare, STYLES, type Keyboard, type Style } from './engine.ts';
import { orchestrate, SAMPLED, type Sampled } from './orchestrate.ts';

/** Every style a tune can be rendered in. */
export const ALL_STYLES = [...STYLES, ...SAMPLED, ...KEYBOARDS];
export type AnyStyle = (typeof ALL_STYLES)[number];

/** The tunes played dark (orchestrate.ts, engine.ts), and how much slower: Blackthorn's, the tyrant's. */
const OMINOUS = ['BLCKTHRN.XMI'];
const SLOWER = 1 / 0.85;
/** The tunes played mellow in the synthesized styles (engine.ts): Britannia's, heard for hours on end, and the Fanfare. */
const MELLOW = ['BRITLAND.XMI', 'FANFARE.XMI'];
/** Of those, the ones serene in Upside Down (engine.ts), and how much slower they are played: the Fanfare. */
const SERENE = ['FANFARE.XMI'];
const CALMER = 1 / 0.75;

/** `seq` played `factor` times as long. */
const slowed = (seq: XmiSequence, factor: number): XmiSequence => ({
  events: seq.events.map((e) => ({ ...e, time: e.time * factor })),
  length: seq.length * factor,
});

/** A fresh offline context `seconds` long, played into by `play`: its samples. */
async function offline(seconds: number, rate: number, play: (ctx: BaseAudioContext) => void): Promise<Stereo> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  play(ctx);
  const buf = await ctx.startRendering();
  return [Float32Array.from(buf.getChannelData(0)), Float32Array.from(buf.getChannelData(1))];
}

/**
 * Tune `tune` (the Upgrade's notes, `upgrade`) rendered in `style`, `ring` seconds let ring past its end: the samples,
 * how long the tune itself is as played (seconds), and how deep it was eased (dB; `over` where even that was not
 * enough). `font` is MuseScore General, for the sampled styles.
 */
export async function renderInStyle(
  tune: string,
  upgrade: XmiSequence,
  style: AnyStyle,
  ring: number,
  rate: number,
  font: string,
): Promise<{ pcm: Stereo; length: number; dip: number; over: boolean }> {
  const ominous = OMINOUS.includes(tune);
  const source = ominous ? slowed(rewritten(tune, upgrade), SLOWER) : rewritten(tune, upgrade);
  let pcm: Stereo;
  let seq: XmiSequence;
  if ((KEYBOARDS as readonly string[]).includes(style)) {
    // The Classical piano's arrangement, played on an electronic keyboard.
    seq = orchestrate(source, tune, 'piano', ominous);
    pcm = await offline(seq.length + ring, rate, (ctx) => playKeyboard(ctx, ctx.destination, seq, style as Keyboard));
  } else if ((SAMPLED as readonly string[]).includes(style)) {
    seq = orchestrate(source, tune, style as Sampled, ominous);
    pcm = await renderOriginal(seq, seq.length + ring, rate, font);
  } else {
    seq = prepare(SERENE.includes(tune) ? slowed(source, CALMER) : source, style as Style);
    pcm = await offline(seq.length + ring, rate, (ctx) =>
      playStyle(ctx, ctx.destination, seq, style as Style, {
        gentle: !HEARD_ONCE.includes(tune),
        ominous,
        mellow: MELLOW.includes(tune),
        serene: SERENE.includes(tune),
      }),
    );
  }
  assertBounded(pcm, `${style} ${tune}`);
  if (HEARD_ONCE.includes(tune)) return { pcm, length: seq.length, dip: 0, over: false };
  const eased = easeToTarget(pcm, rate);
  return { pcm: eased.pcm, length: seq.length, dip: eased.dip, over: eased.over };
}
