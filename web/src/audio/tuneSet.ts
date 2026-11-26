/**
 * tuneSet.ts
 *
 * A game's own music, as its entry sets it (useTunes, as useLooks and useSaves are): its tunes by number, where each
 * one's notes are, which are heard once, the arrangements Electronic and Classical chose of each, the render's
 * manifest and the folder the files lie in. The player (ui/sound.ts) plays from it and the render
 * (tools/music/render.ts renderTunes) makes it. Ultima V's (game/music.ts ULTIMA5_TUNES) unless a game sets its own.
 */

import { ULTIMA5_TUNES } from '../game/music.ts';
import type { TuneFile } from '../ui/music.ts';
import type { Arrangement, Picks } from './soundtracks.ts';

/** Where a tune's notes are: a file in the set's folder, and which of its sequences (an XMI may hold several). */
export interface TuneSource {
  file: string;
  sequence: number;
}

/** The render's manifest: each tune's files by arrangement, and where each one's loop lies. */
export type MusicManifest = Readonly<Record<string, Partial<Record<Arrangement, TuneFile>>>>;

/** A game's music. */
export interface TuneSet {
  /** Each tune's name, tune 1 first (Sound.music's number, less one): its key in `picks` and `manifest`, its files' stem. */
  names: readonly string[];
  /** Where each tune's notes are, by name; a name not here is the file of that name, its first sequence. */
  sources?: Readonly<Record<string, TuneSource>>;
  /** Tunes another game rendered, their files copied into `folder`: played, but with no notes here, never rendered. */
  copied?: readonly string[];
  /** The tunes heard once: played through, then a rest before they come round; not eased as a tune heard for hours. */
  heardOnce: readonly string[];
  /** Electronic's and Classical's arrangements of each tune. */
  picks: Picks;
  /** Where each tune's renders are, and their loops (what the render wrote to `manifestFile`). */
  manifest: MusicManifest;
  /** The folder under web/public/ the sources and renders lie in, and the game fetches the renders from. */
  folder: string;
  /** Where the render writes the manifest, from web/. */
  manifestFile: string;
}

/** The set a game's entry gave; null for Ultima V's. */
let current: TuneSet | null = null;

/** The music this game plays (its entry's): null, Ultima V's. */
export function useTunes(set: TuneSet | null): void {
  current = set;
}

/** The music in use: the game's, else Ultima V's (read when asked, not as the modules load, so their order cannot matter). */
export function tuneSet(): TuneSet {
  return current ?? ULTIMA5_TUNES;
}

/** Where tune `name` of `set` is read from. */
export function tuneSource(set: TuneSet, name: string): TuneSource {
  return set.sources?.[name] ?? { file: name, sequence: 0 };
}

/** Whether tune `name` of the music in use is heard once (tools/music: rested before it comes round, not eased). */
export function heardOnce(name: string): boolean {
  return tuneSet().heardOnce.includes(name);
}
