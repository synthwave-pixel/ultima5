/**
 * music.ts
 *
 * The music: the Upgrade's sixteen songs, rendered once to files in many
 * arrangements (tools/music/render.ts) - Original, its General MIDI
 * arrangements on sampled instruments; Remastered, the same notes in soft
 * synthesized voices; and the styles Electronic and Classical chose from
 * (audio/soundtracks.ts) - and played here: each tune decoded, looped
 * without a seam between the points its render recorded (musicManifest.json),
 * a change of tune crossfaded.
 */

import manifest from '../audio/musicManifest.json';
import type { Arrangement } from '../audio/soundtracks.ts';

/** Where an arrangement's file of a tune is, and where its loop lies in it (seconds). */
export interface TuneFile {
  file: string;
  loopStart: number;
  loopEnd: number;
}

/** The render's manifest: each tune's files (game/music.ts TUNE_FILES), by arrangement. */
export const MUSIC = manifest as unknown as Record<string, Partial<Record<Arrangement, TuneFile>>>;

/** How long a change of tune takes, one fading out as the next fades in (seconds). */
export const CROSSFADE = 0.5;

/** Plays one tune at a time, looping, at a volume that can be changed as it plays. */
export class MusicPlayer {
  /** The music's own level (the mixer's, lowered under a long effect), into the speakers. */
  private out: GainNode | null = null;
  /**
   * The tune playing: its source, its fade, and when (audio-clock seconds) it began to fade in - with what it was
   * started from, so where it has got to can be told (heldAt).
   */
  private current: {
    name: string;
    src: AudioBufferSourceNode;
    fade: GainNode;
    began: number;
    tune: HeldTune;
  } | null = null;
  /** The tune paused (hold): where it was, to go on from there when let go. Null while not held, or held with none. */
  private paused: HeldTune | null = null;
  private held = false;

  constructor(
    private readonly context: () => AudioContext | null,
    private volume = 0.12,
  ) {}

  /** The tune playing, by name ('' for none) - a tune paused still counts, as it will go on. */
  get playing(): string {
    return this.held ? (this.paused?.name ?? '') : (this.current?.name ?? '');
  }

  /**
   * Pause the music, faded out, where it has got to, or go on with it from there, faded in (a menu over the game). A
   * tune asked for while held is the one that plays when let go, from its start; stopped, none does.
   */
  hold(on: boolean): void {
    if (on === this.held) return;
    if (on) {
      const ctx = this.context();
      const was = this.current;
      const at = was && ctx ? { ...was.tune, startAt: heldAt(was.tune, ctx.currentTime - was.began) } : null;
      this.stop(); // (which forgets any tune paused)
      this.paused = at;
      this.held = true;
      return;
    }
    this.held = false;
    const tune = this.paused;
    this.paused = null;
    if (tune) this.play(tune.name, tune.buffer, tune.loopStart, tune.loopEnd, tune.startAt);
  }

  /** The music's level, made once there is an audio context. */
  private level(ctx: AudioContext): GainNode {
    if (!this.out || this.out.context !== ctx) {
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(ctx.destination);
    }
    return this.out;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (!this.out) return;
    // From now, and no duck still pending: its end would bring the music back to the level it had.
    const g = this.out.gain;
    const t = this.out.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(v, t);
  }

  /** Lower the music under an effect from `start` to `end` (audio-clock seconds), and bring it back. */
  duck(start: number, end: number, depth = 0.3): void {
    const g = this.out?.gain;
    if (!g) return;
    g.cancelScheduledValues(start);
    g.setTargetAtTime(this.volume * depth, start, 0.02);
    g.setTargetAtTime(this.volume, end, 0.12);
  }

  /** The tune playing faded away. */
  stop(): void {
    this.paused = null;
    const ctx = this.context();
    const was = this.current;
    this.current = null;
    if (!was || !ctx) return;
    const t = ctx.currentTime;
    // Down from where its fade-in has got to: the gain's value is not told mid-ramp by every engine.
    const now = Math.min(1, (t - was.began) / CROSSFADE);
    was.fade.gain.cancelScheduledValues(t);
    was.fade.gain.setValueAtTime(now, t);
    was.fade.gain.linearRampToValueAtTime(0, t + CROSSFADE);
    was.src.onended = () => was.fade.disconnect();
    was.src.stop(t + CROSSFADE + 0.05);
  }

  /**
   * `buffer` (tune `name`) played from `startAt` (seconds into it) and looped between `loopStart` and `loopEnd`, the
   * tune before fading out as it fades in. The same tune already playing goes on.
   */
  play(name: string, buffer: AudioBuffer, loopStart: number, loopEnd: number, startAt = 0): void {
    if (this.held) {
      if (name !== this.paused?.name) this.paused = { name, buffer, loopStart, loopEnd, startAt };
      return;
    }
    if (name === this.current?.name) return;
    const ctx = this.context();
    if (!ctx) return;
    this.stop();
    const t = ctx.currentTime;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, t);
    fade.gain.linearRampToValueAtTime(1, t + CROSSFADE);
    fade.connect(this.level(ctx));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = loopStart;
    src.loopEnd = Math.min(loopEnd, buffer.duration);
    src.connect(fade);
    src.start(t, startAt);
    this.current = { name, src, fade, began: t, tune: { name, buffer, loopStart, loopEnd: src.loopEnd, startAt } };
  }
}

/** A tune as it was started: enough to start it again elsewhere in it. */
interface HeldTune {
  name: string;
  buffer: AudioBuffer;
  loopStart: number;
  loopEnd: number;
  startAt: number;
}

/** Where in its file a tune started at `tune.startAt` has got to, `elapsed` seconds on, its loop taken round. */
export function heldAt(tune: Pick<HeldTune, 'loopStart' | 'loopEnd' | 'startAt'>, elapsed: number): number {
  const at = tune.startAt + Math.max(0, elapsed);
  const loop = tune.loopEnd - tune.loopStart;
  if (at < tune.loopEnd || loop <= 0) return at;
  return tune.loopStart + ((at - tune.loopStart) % loop);
}
