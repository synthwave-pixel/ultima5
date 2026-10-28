/**
 * sfxKeys.ts
 *
 * The three effects suites that match the soundtracks (Classical, Electronic,
 * Ambient), and the name each of the game's calls has in them: the key of its
 * slice in a suite's rendered file (tools/sfx/render.ts, sfxManifest.json).
 * A family played note by note at the pitch the game's data gives it (the
 * harpsichord, the lute, the chants) is a note of a rendered bank, played at
 * the call's own pitch; a call folded into another's sound is silent; a call
 * with no name is left to the shared voice (the chip's, softened).
 */

import { pulseShape } from './chip.ts';
import type { Effect, Kind } from './effects.ts';

export const SUITES = ['classical', 'electronic', 'ambient'] as const;
export type Suite = (typeof SUITES)[number];

/** The notes a bank is rendered over (MIDI). */
export const NOTE_BANK = { low: 36, high: 96 };
/** The families played from a bank of notes. */
export const BANKED = ['harpsichord', 'lute', 'chant'] as const;
/**
 * How far below the game's pitch a bank's family plays: two octaves. The data puts the harpsichord, the lute and the
 * chants at 1.1 to 2.8 kHz (MIDI 85-101), where the ear is most sensitive; two octaves down they are the same tunes,
 * the same notes, in an instrument's middle register.
 */
export const BANK_TRANSPOSE = 1 / 4;

/** A call's sound in a suite: its key (and a bank note's pitch), silent where folded, or null for the shared voice. */
export type SfxKey = { key: string; hz?: number } | 'silent' | null;

/** Folded into another's sound: the victory tune's last note, a spell's hums, the apparition's notes (in its arrival). */
const FOLDED = new Set(['victory2', 'cast', 'apparition']);

export const cueKey = (name: string): string => `cue:${name}`;
export const noteKey = (family: string, midi: number): string => `${family}:${midi}`;

/** The MIDI note nearest `hz`, within the bank. */
export const nearestNote = (hz: number): number =>
  Math.min(NOTE_BANK.high, Math.max(NOTE_BANK.low, Math.round(12 * Math.log2(hz / 440) + 69)));

/** The sound call `kind`(`args`), named `effect`, has in a suite. */
export function sfxKey(effect: Effect | null, kind: Kind, args: number[]): SfxKey {
  if (!effect) return null;
  if (effect.continued || FOLDED.has(effect.name)) return 'silent';
  if ((BANKED as readonly string[]).includes(effect.name) && kind === 'pulse') {
    const hz = pulseShape(args).hz * BANK_TRANSPOSE;
    return { key: noteKey(effect.name, nearestNote(hz)), hz };
  }
  if (effect.name === 'blackthorn') return { key: `blackthorn${effect.note ?? 0}` };
  return { key: effect.name };
}
