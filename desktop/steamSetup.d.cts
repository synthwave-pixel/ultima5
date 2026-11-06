type Fs = typeof import('node:fs');
interface MacWhere {
  fs: Fs;
  /** Steam's own folder, ~/Library/Application Support/Steam. */
  steamRoot: string;
  /** Where the untouched cache entry is kept, in the app's data. */
  keptOriginal: string;
  /** What setup wrote (the launcher, and the manifest if it was ours), in the app's data. */
  noteFile: string;
  steamRunning(): boolean;
}
export const FLATPAK_ID: string;
export const OVERRIDE: string;
export function launchLine(build: {
  platform: string;
  exe: string;
  appImageLink: string | null;
  flatpak: boolean;
  portable: boolean;
}): string | null;
export function appImageLink(home: string): string;
export function relinkAppImage(fs: Fs, link: string, current: string): void;
export function installCompatTool(fs: Fs, roots: string[], launcher: { flatpak: boolean; appImageLink: string }): string[];
export function hasCompatTool(fs: Fs, roots: string[]): boolean;
export function removeCompatTool(fs: Fs, roots: string[]): void;
export function macSetup(
  where: MacWhere & { appExe: string; quitSteam(): Promise<void> },
): Promise<'done' | 'steam-running' | 'not-owned'>;
export function macReapply(where: MacWhere & { appExe: string }): 'ready' | 'not-set-up' | 'steam-running' | 'not-owned';
export function macRestore(where: MacWhere & { quitSteam(): Promise<void> }): Promise<'done' | 'steam-running'>;
