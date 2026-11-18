/**
 * gameFiles.ts
 *
 * Which of the player's files the engine needs, and picking them out of
 * whatever was given: a folder, loose files or archives, with the game in
 * any subfolder. Names match case-insensitively; when a name appears more
 * than once (the Upgrade keeps a second copy of the game in upgrade/) the
 * shallowest copy wins. The Upgrade's MIDI music (*.XMI) is kept too.
 *
 * Each file is then checked against the known copies (known.ts): one that
 * differs - edited by a modder, or damaged - is named, and the player
 * decides. Only a DATA.OVL of the wrong size is refused outright.
 */

import { GameFiles } from '../data/files.ts';
import { crc32 } from './crc32.ts';
import { KNOWN } from './known.ts';

/**
 * The data files the engine reads, all from MS-DOS Ultima V. (Not BRIT.OOL
 * or UNDER.OOL: the 1988 game's working copies of the world's creatures,
 * rewritten as it is played; a new game starts from INIT.OOL.)
 */
export const REQUIRED = [
  'DATA.OVL',
  'BRIT.DAT',
  'UNDER.DAT',
  'TOWNE.DAT',
  'DWELLING.DAT',
  'CASTLE.DAT',
  'KEEP.DAT',
  'TOWNE.NPC',
  'DWELLING.NPC',
  'CASTLE.NPC',
  'KEEP.NPC',
  'TOWNE.TLK',
  'DWELLING.TLK',
  'CASTLE.TLK',
  'KEEP.TLK',
  'DUNGEON.DAT',
  'DUNGEON.CBT',
  'BRIT.CBT',
  'MISCMAPS.DAT',
  'SIGNS.DAT',
  'LOOK2.DAT',
  'SHOPPE.DAT',
  'KARMA.DAT',
  'QUESTION.DAT',
  'STORY.DAT',
  'END.DAT',
  'ENDMSG.DAT',
  'MISCMSG.DAT',
  'INIT.GAM',
  'INIT.OOL',
  'TILES.16',
  'IBM.CH',
  'RUNES.CH',
  'ITEMS.16',
  'TEXT.16',
  'CREATE.16',
  'STARTSC.16',
  'ULTIMA.16',
  'STORY1.16',
  'STORY2.16',
  'STORY3.16',
  'STORY4.16',
  'STORY5.16',
  'STORY6.16',
  'END1.16',
  'END2.16',
  'ENDSC.16',
  'DNG1.16',
  'DNG2.16',
  'DNG3.16',
  'MON0.16',
  'MON1.16',
  'MON2.16',
  'MON3.16',
  'MON4.16',
  'MON5.16',
  'MON6.16',
  'MON7.16',
  'TITLE.BIT',
  'BRITISH.BIT',
  'WD.BIT',
  'BRITISH.PTH',
  'PROPORT.PCS',
];

/**
 * Files whose layout the engine depends on byte for byte: DATA.OVL's
 * tables are read at fixed offsets, so only the v1.16 file will do.
 */
const EXACT_SIZE: Record<string, number> = { 'DATA.OVL': 48464 };

/**
 * A game the installer can pick out of what it is given: the files it needs, those that must be one exact size, the
 * known copies' fingerprints, and which other files to keep and under what name (`keep` gets the path as given and
 * the upper-case base name, and answers the name to keep it as, or null). The one in use is set by the game
 * (useGameSpec); Ultima V's unless another is.
 */
export interface GameSpec {
  required: readonly string[];
  exactSize: Record<string, number>;
  known: Record<string, string[]>;
  /** Files read at fixed offsets: one that is none of the known copies is the wrong version, not merely changed. */
  mustBeKnown?: readonly string[];
  keep(path: string, base: string): string | null;
}

/** Ultima V: its data files, DATA.OVL's one size, and the Upgrade's MIDI music (*.XMI) kept by name. */
export const ULTIMA5: GameSpec = {
  required: REQUIRED,
  exactSize: EXACT_SIZE,
  known: KNOWN,
  keep: (_path, base) => (base.endsWith('.XMI') ? base : null),
};

let inUse: GameSpec = ULTIMA5;

/** The game whose files the installer, the scan and the start-up look for, from now on (Ultima V's unless set). */
export function useGameSpec(s: GameSpec): void {
  inUse = s;
}

/** The game whose files are looked for. */
export function gameSpec(): GameSpec {
  return inUse;
}

export interface Candidate {
  /** Path as given, folders included, any separator. */
  path: string;
  data: Uint8Array;
  /** Out of a zip whose check for it failed: damaged in the archive. */
  damaged?: boolean;
}

export interface Identified {
  files: GameFiles;
  missing: string[];
  /** Files present but not the version the engine reads. */
  wrong: string[];
  /** Files that are none of the known copies: edited, or damaged. */
  changed: string[];
  /** Files a zip's own check says were damaged in it. */
  damaged: string[];
}

/** A file's size and CRC-32, as known.ts keeps them. */
export function fingerprint(data: Uint8Array): string {
  return `${data.length}:${crc32(data).toString(16).padStart(8, '0')}`;
}

/** The files, of those given, that are none of the known copies. */
export function unknownFiles(files: GameFiles, s: GameSpec = gameSpec()): string[] {
  return s.required.filter((n) => files.has(n) && !s.known[n]?.includes(fingerprint(files.get(n))));
}

const baseName = (path: string): string => path.split(/[\\/]/).pop()!.toUpperCase();
const depth = (path: string): number => path.split(/[\\/]/).length;

export function identify(candidates: Candidate[], spec: GameSpec = gameSpec()): Identified {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const base = baseName(c.path);
    const kept = spec.keep(c.path, base);
    // A required file under its own name; a kept one under the name `keep` gives (both, where they differ).
    const names = new Set([...(spec.required.includes(base) ? [base] : []), ...(kept ? [kept] : [])]);
    for (const name of names) {
      const prev = best.get(name);
      if (!prev || depth(c.path) < depth(prev.path)) best.set(name, c);
    }
  }
  const files = new GameFiles();
  const wrong: string[] = [];
  const damaged: string[] = [];
  for (const [name, c] of best) {
    if (spec.exactSize[name] !== undefined && c.data.length !== spec.exactSize[name]) wrong.push(name);
    else if (spec.mustBeKnown?.includes(name) && !spec.known[name]?.includes(fingerprint(c.data))) wrong.push(name);
    else files.set(name, c.data);
    if (c.damaged) damaged.push(name);
  }
  const missing = spec.required.filter((n) => !files.has(n) && !wrong.includes(n));
  // A file damaged in its zip is said to be that, and not said again as merely changed.
  const changed = unknownFiles(files, spec).filter((n) => !damaged.includes(n));
  return { files, missing, wrong, changed, damaged };
}

/** Named, a few at most: the rest counted. */
export const listed = (names: string[], most = 8): string =>
  names.slice(0, most).join(', ') + (names.length > most ? `, and ${names.length - most} more` : '');

export function complete(id: Identified): boolean {
  return id.missing.length === 0 && id.wrong.length === 0;
}
