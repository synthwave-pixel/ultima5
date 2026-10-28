/**
 * sfxBank.ts
 *
 * A suite's effects as the page plays them: the suite's one rendered file
 * (tools/sfx/render.ts) fetched and decoded when the suite is chosen, kept
 * while it is the suite, and each effect a slice of it (sfxManifest.json).
 * Only the suite last asked for is kept: a file that comes after another
 * suite was chosen is let go. Until it has come, its effects are silent.
 */

import sfxManifest from '../audio/sfxManifest.json';
import { NOTE_BANK, type SfxManifest, type Suite } from '../audio/sfxKeys.ts';

/** The render's manifest (tools/sfx/render.ts): where each suite's sounds lie in its file. */
export const SFX_MANIFEST = sfxManifest as unknown as SfxManifest;

/** A slice of a suite's file: where it starts and how long it is (seconds). */
export interface Slice {
  buffer: AudioBuffer;
  at: number;
  length: number;
  /** How long the sound itself is, without its ring: what lowers the music and keeps it from starting again. */
  nominal: number;
}

/** The playback rate that puts bank note `key` (`family:midi`) at `hz`: within an octave either way. */
export function bankRate(hz: number, key: string): number {
  const midi = Math.min(NOTE_BANK.high, Math.max(NOTE_BANK.low, Number(key.slice(key.lastIndexOf(':') + 1))));
  const rate = hz / (440 * Math.pow(2, (midi - 69) / 12));
  return Math.min(2, Math.max(0.5, rate));
}

/** A file that would not load is not tried again for this long (ms), as the music's (sound.ts RETRY_AFTER). */
const RETRY_AFTER = 60_000;

export class SfxBank {
  /** The suite last asked for, and its file once decoded: one suite's at most, a decoded file being some 80 MB. */
  private wanted: Suite | null = null;
  private loaded: { suite: Suite; buffer: AudioBuffer } | null = null;
  /** The files on their way, by suite: one fetch a suite, however often it is asked for meanwhile. */
  private readonly loading = new Map<Suite, Promise<AudioBuffer | null>>();
  /** When each suite's file last would not load (by `now`), so it is tried again - but not at once. */
  private readonly failedAt = new Map<Suite, number>();
  /** The context the file is decoded on, kept to try it again from an effect asked for. */
  private ctx: BaseAudioContext | null = null;

  constructor(
    private readonly manifest: SfxManifest,
    private readonly fetchFile: (file: string) => Promise<ArrayBuffer>,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * Suite `suite`'s file, fetched and decoded (once); null where it has none or it would not load - and then it is
   * tried again when asked for after a minute, not before.
   */
  load(ctx: BaseAudioContext, suite: Suite): Promise<AudioBuffer | null> {
    this.ctx = ctx;
    this.wanted = suite;
    if (this.loaded?.suite === suite) return Promise.resolve(this.loaded.buffer);
    const inFlight = this.loading.get(suite);
    if (inFlight) return inFlight;
    const file = this.manifest[suite]?.file;
    if (!file) return Promise.resolve(null);
    if (this.now() - (this.failedAt.get(suite) ?? -Infinity) < RETRY_AFTER) return Promise.resolve(null);
    const done = this.fetchFile(file)
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        this.failedAt.delete(suite);
        // Another suite chosen meanwhile: this one is not kept.
        if (this.wanted === suite) this.loaded = { suite, buffer };
        return buffer;
      })
      .catch(() => {
        this.failedAt.set(suite, this.now());
        return null;
      })
      .finally(() => this.loading.delete(suite));
    this.loading.set(suite, done);
    return done;
  }

  /** No suite wanted (Upgrade (2001)'s speaker chosen): the decoded file let go. */
  forget(): void {
    this.wanted = null;
    this.loaded = null;
  }

  /** Whether suite `suite` has a sound for `key`, loaded or not. */
  has(suite: Suite, key: string): boolean {
    return !!this.manifest[suite]?.slices[key]?.length;
  }

  /**
   * Suite `suite`'s sound for `key`, one of its variants picked by `r`; null until the suite has loaded - and where its
   * file would not load, asking is what tries it again (load: not within a minute).
   */
  slice(suite: Suite, key: string, r: () => number): Slice | null {
    if (this.loaded?.suite !== suite) {
      if (this.ctx && this.wanted === suite && !this.loading.has(suite)) void this.load(this.ctx, suite);
      return null;
    }
    const variants = this.manifest[suite].slices[key];
    if (!variants?.length) return null;
    const [at, length, nominal] = variants[Math.min(variants.length - 1, Math.floor(r() * variants.length))];
    return { buffer: this.loaded.buffer, at, length, nominal: nominal ?? length };
  }
}
