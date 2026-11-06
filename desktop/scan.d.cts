export interface FoundCopy {
  where: string;
  files: { path: string; data: Uint8Array }[];
}
export function gameFolderName(name: string): boolean;
export function roots(where: { platform: string; home: string; env: Record<string, string | undefined>; appDir: string; drives: string[]; list?: (dir: string) => string[] }): string[];
export function findCopies(roots: string[], wanted: string[], where?: { platform?: string; home?: string }): FoundCopy[];
/** How many of `required` the folder lacks (names matched as readCopy does). */
export function missingNames(dir: string, required: string[]): number;
export function readCopy(dir: string, wanted: string[]): { path: string; data: Uint8Array }[];
export function scanForGameFiles(wanted: string[]): FoundCopy[];
