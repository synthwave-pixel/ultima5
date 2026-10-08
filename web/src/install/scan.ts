/**
 * scan.ts
 *
 * What a scan for game files comes to (the installer's Scan for game files...): the copies its source found - a
 * folder on the disk, the site's own gamedata/ - each checked as a dropped folder is (gameFiles.ts identify), and the
 * first that is verified, every file one of the known copies', installed. A modified or incomplete copy is never
 * installed by a scan: it is said, and the player may drop or choose it to install it on purpose.
 */

import { complete, identify, listed, type Candidate, type Identified } from './gameFiles.ts';

/** A copy a source found: where it is (as the player would know the place), and its files. */
export interface FoundCopy {
  where: string;
  files: Candidate[];
}

/** Whether a copy is whole and every file in it one of the known copies': fit to install with no question. */
export function verified(id: Identified): boolean {
  return complete(id) && id.changed.length === 0 && id.damaged.length === 0;
}

export type ScanOutcome = { kind: 'install'; where: string; found: Identified } | { kind: 'report'; text: string };

/** The first verified copy to install; else what was found, or `nothing` where nothing was. */
export function scanOutcome(copies: FoundCopy[], nothing: string): ScanOutcome {
  const lines: string[] = [];
  for (const copy of copies) {
    const found = identify(copy.files);
    if (verified(found)) return { kind: 'install', where: copy.where, found };
    if (!complete(found)) {
      const gone = [...found.missing, ...found.wrong];
      lines.push(`A copy in ${copy.where} is incomplete (${listed(gone, 4)}).`);
    } else {
      const off = [...found.changed, ...found.damaged];
      lines.push(
        `A copy in ${copy.where} is modified (${off.length} ${off.length === 1 ? 'file' : 'files'}): drop it or choose it to install it anyway.`,
      );
    }
  }
  return { kind: 'report', text: lines.length ? lines.join('\n') : nothing };
}
