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
export const SFX_MANIFEST = sfxManifest as SfxManifest;

/** A slice of a suite's file: where it starts and how long it is (seconds). */
export interface Slice {
  buffer: AudioBuffer;
  at: number;
  length: number;
}

/** The playback rate that puts bank note `key` (`family:midi`) at `hz`: within an octave either way. */
export function bankRate(hz: number, key: string): number {
  const midi = Math.min(NOTE_BANK.high, Math.max(NOTE_BANK.low, Number(key.slice(key.lastIndexOf(':') + 1))));
  const rate = hz / (440 * Math.pow(2, (midi - 69) / 12));
  return Math.min(2, Math.max(0.5, rate));
}

export class SfxBank {
  /** The suite last asked for, and its file once decoded. */
  private wanted: Suite | null = null;
  private loaded: { suite: Suite; buffer: AudioBuffer } | null = null;
  private loading: { suite: Suite; done: Promise<AudioBuffer | null> } | null = null;

  constructor(
    private readonly manifest: SfxManifest,
    private readonly fetchFile: (file: string) => Promise<ArrayBuffer>,
  ) {}

  /** Suite `suite`'s file, fetched and decoded (once); null where it has none or it would not load. */
  load(ctx: BaseAudioContext, suite: Suite): Promise<AudioBuffer | null> {
    this.wanted = suite;
    if (this.loaded?.suite === suite) return Promise.resolve(this.loaded.buffer);
    if (this.loading?.suite === suite) return this.loading.done;
    const file = this.manifest[suite]?.file;
    if (!file) return Promise.resolve(null);
    const done = this.fetchFile(file)
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        // Another suite chosen meanwhile: this one is not kept.
        if (this.wanted === suite) this.loaded = { suite, buffer };
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        if (this.loading?.suite === suite) this.loading = null;
      });
    this.loading = { suite, done };
    return done;
  }

  /** Whether suite `suite` has a sound for `key`, loaded or not. */
  has(suite: Suite, key: string): boolean {
    return !!this.manifest[suite]?.slices[key]?.length;
  }

  /** Suite `suite`'s sound for `key`, one of its variants picked by `r`; null until the suite has loaded. */
  slice(suite: Suite, key: string, r: () => number): Slice | null {
    if (this.loaded?.suite !== suite) return null;
    const variants = this.manifest[suite].slices[key];
    if (!variants?.length) return null;
    const [at, length] = variants[Math.min(variants.length - 1, Math.floor(r() * variants.length))];
    return { buffer: this.loaded.buffer, at, length };
  }
}
