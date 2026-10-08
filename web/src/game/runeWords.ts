/**
 * runeWords.ts
 *
 * What a word spoken in runes is, for the colour the Standard look reads it into English in (talk.ts flushWord): the
 * good - the eight mantras, and the answer to the Codex's quest - blue; the evil - the eight dungeons' Words of Power
 * (one spoken backwards) and their names, and the Shadowlords' - the red the dungeons' signs are cut in; anything else
 * - a spell's syllables, a password, an insult - grey.
 */

import { RUNE_RED } from '../ui/colours.ts';
import { TONED } from '../ui/originals.ts';
import { RUNE_ENGLISH } from '../ui/framebuffer.ts';

export type RuneKind = 'good' | 'evil' | 'neutral';

const GOOD = new Set(['AHM', 'MU', 'RA', 'BEH', 'SUMM', 'OM', 'LUM', 'CAH', 'INFINITY']);

const EVIL = new Set([
  // The Words of Power, each opening its dungeon (AIPONI, Destard's INOPIA as Goeth says it, backwards).
  'FALLAX',
  'VILIS',
  'INOPIA',
  'AIPONI',
  'MALUM',
  'AVIDUS',
  'INFAMA',
  'IGNAVUS',
  'VERAMOCOR',
  // The dungeons.
  'DECEIT',
  'DESPISE',
  'DESTARD',
  'WRONG',
  'COVETOUS',
  'SHAME',
  'HYTHLOTH',
  'DOOM',
  // The Shadowlords' true names.
  'FAULINEI',
  'ASTAROTH',
  'NOSFENTOR',
]);

/** The kind of a word as it reads in English (its letters alone count, in any case). */
export function runeKind(word: string): RuneKind {
  const w = word.toUpperCase().replace(/[^A-Z]/g, '');
  return GOOD.has(w) ? 'good' : EVIL.has(w) ? 'evil' : 'neutral';
}

/** Each kind's colour (0xRRGGBB): Modern PC's blue, the runes' red (the dungeons' signs'), and its light grey. */
export const RUNE_INK: Record<RuneKind, number> = {
  good: TONED[9],
  evil: RUNE_RED,
  neutral: TONED[7],
};

/** A word as the talk scripts hold it - English with bit 7 set, runes without - read: its runes as English. */
export function runesRead(bytes: readonly number[]): string {
  return bytes
    .filter((b) => (b & 0x80) === 0 && b >= 0x41 && b <= 0x5f)
    .map((b) => RUNE_ENGLISH[b - 0x41])
    .join('');
}
