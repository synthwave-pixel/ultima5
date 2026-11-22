export interface FoundCopy {
  where: string;
  files: { path: string; data: Uint8Array }[];
}
export function gameFolderName(name: string): boolean;
export function roots(where: { platform: string; home: string; env: Record<string, string | undefined>; appDir: string; drives: string[]; list?: (dir: string) => string[]; steamLibraries?: string[] }): string[];
export function findCopies(roots: string[], wanted: string[], where?: { platform?: string; home?: string; extra?: string }): FoundCopy[];
/** How many of `required` the folder lacks (names matched as readCopy does). */
export function missingNames(dir: string, required: string[]): number;
/** `extra`: a pattern (a RegExp's source, ignoring case) for the path of other files to read; none, or none that parses, reads the names alone. */
export function readCopy(dir: string, wanted: string[], extra?: string): { path: string; data: Uint8Array }[];
export function scanForGameFiles(wanted: string[], steamLibraries?: string[], extra?: string): FoundCopy[];
