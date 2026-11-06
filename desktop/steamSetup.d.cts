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
  appImage: string | null;
  flatpak: boolean;
  portable: boolean;
}): string | null;
export function installCompatTool(fs: Fs, roots: string[], launcher: { flatpak: boolean; appImage: string | null }): string[];
export function hasCompatTool(fs: Fs, roots: string[]): boolean;
export function removeCompatTool(fs: Fs, roots: string[]): void;
/** The app's executable, and whether it is a built app (Electron's app.isPackaged): Play is aimed only at such a copy. */
interface AppPlace {
  appExe: string;
  packaged: boolean;
}
export function macSetup(
  where: MacWhere & AppPlace & { quitSteam(): Promise<void> },
): Promise<'done' | 'steam-running' | 'not-owned' | 'app-not-in-place'>;
export function macReapply(where: MacWhere & AppPlace): 'ready' | 'not-set-up' | 'steam-running' | 'not-owned';
/** Whether Ultima V's cache entry has our launch now; null where there is no entry. Only reads. */
export function macPatched(where: Pick<MacWhere, 'fs' | 'steamRoot'>): boolean | null;
export function macStatus(where: MacWhere & AppPlace): {
  state: 'ready' | 'not-set-up' | 'steam-running' | 'not-owned';
  steamRunning: boolean;
};
export function macRestore(where: MacWhere & { quitSteam(): Promise<void> }): Promise<'done' | 'steam-running' | 'kept-unusable'>;
