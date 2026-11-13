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
export function refreshCompatTool(fs: Fs, roots: string[], launcher: { flatpak: boolean; appImage: string | null }): string[];
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
/** Linux's Steam folders, and Steam's state: quit and started again by its own command (main.cjs). */
interface LinuxWhere {
  fs: Fs;
  roots: string[];
  steamRunning(): boolean;
}
/** How Steam's cloud rules for Ultima V stand here (macOS Sync): why where they would not read, and the rules as read. */
export function cloudCheck(
  fs: Fs,
  roots: string[],
): { state: 'needed' | 'ready' | 'unreadable' | 'not-owned'; why: string | null; rules: string[] };
/** How many of the account's Cloud saves Steam marked for Windows alone (a Mac: all such; elsewhere, those still as synced); null where unknown. */
export function stuckSaves(fs: Fs, roots: string[], account: string | null, mac: boolean): number | null;
/** The saves Steam last synced here marked for Windows alone, changed so that Steam uploads them again: how many. */
export function resendSaves(fs: Fs, roots: string[]): number;
/** 'needed' where a Steam folder's cache lacks MacOS in Ultima V's cloud rules, 'ready' where none does, null without the game. Only reads. */
export function linuxCloud(fs: Fs, roots: string[]): 'needed' | 'ready' | null;
export function linuxCloudSetup(
  where: LinuxWhere & { quitSteam(): Promise<void>; openSteam(): void },
): Promise<'done' | 'fixed' | 'restarted' | 'steam-running' | 'not-owned'>;
export function linuxCloudReapply(where: LinuxWhere): 'ready' | 'steam-running' | 'not-owned';
