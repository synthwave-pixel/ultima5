export interface FoundCopy {
  where: string;
  files: { path: string; data: Uint8Array }[];
}
export function gameFolderName(name: string): boolean;
export function roots(where: { platform: string; home: string; env: Record<string, string | undefined>; appDir: string; drives: string[]; list?: (dir: string) => string[] }): string[];
export function findCopies(roots: string[], wanted: string[], where?: { platform?: string; home?: string }): FoundCopy[];
export function scanForGameFiles(wanted: string[]): FoundCopy[];
