/**
 * sources.ts
 *
 * Where a scan for game files looks (scan.ts): on the web, the site's own gamedata/ - the repo's files on the dev
 * server (vite.config.ts devGameData), a self-hoster's copy anywhere else; in the desktop app, the disk, through the
 * app's one bridge (desktop/scan.cjs); on Android, a folder the player picks (the app's GameFolder plugin).
 */

import { REQUIRED } from './gameFiles.ts';
import type { FoundCopy } from './scan.ts';
import type { LineCheck, SteamStatus, SteamSwitched } from '../game/game.ts';

/** The site's gamedata/: its index.json, then each file named in it. None where there is no index (or its page). */
export async function webCopy(fetcher: typeof fetch, base: string): Promise<FoundCopy[]> {
  try {
    const index = await fetcher(`${base}gamedata/index.json`);
    if (!index.ok) return [];
    const names = (await index.json()) as unknown;
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) return [];
    const files = await Promise.all(
      names.map(async (path: string) => {
        const r = await fetcher(`${base}gamedata/${encodeURIComponent(path)}`);
        return { path, data: new Uint8Array(await r.arrayBuffer()) };
      }),
    );
    return [{ where: 'this site', files }];
  } catch {
    // An HTML page where the index should be (a host's fallback), or no network: nothing here.
    return [];
  }
}

/** Whether the page asks the installer to scan as it opens (?autoscan=true): for development's clear-and-reinstall. */
export function autoscanAsked(search: string): boolean {
  return new URLSearchParams(search).get('autoscan') === 'true';
}

/** The desktop app's bridge (desktop/preload.cjs), where the page has one. */
interface Native {
  scanForGameFiles(names: string[]): Promise<FoundCopy[]>;
}

/** The desktop app's scan of the disk (desktop/scan.cjs), asked for the game's files; null outside the app. */
export function desktopScan(): (() => Promise<FoundCopy[]>) | null {
  const native = (globalThis as { u5native?: Native }).u5native;
  return native ? () => native.scanForGameFiles([...REQUIRED]) : null;
}

/** The Android app's GameFolder plugin (mobile/.../GameFolderPlugin.java), where the page has it. */
interface GameFolder {
  pick(o: { names: string[] }): Promise<{ where: string; files: { path: string; data: string }[] } | { cancelled: true }>;
}

/** A folder the player picks with Android's own picker, its game files read; null outside the Android app. */
export function androidFolder(): (() => Promise<FoundCopy | null>) | null {
  const cap = (globalThis as { Capacitor?: { getPlatform?: () => string; Plugins?: { GameFolder?: GameFolder } } }).Capacitor;
  const plugin = cap?.getPlatform?.() === 'android' ? cap.Plugins?.GameFolder : undefined;
  if (!plugin) return null;
  return async () => {
    const got = await plugin.pick({ names: [...REQUIRED] });
    if ('cancelled' in got) return null;
    const bytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { where: got.where, files: got.files.map((f) => ({ path: f.path, data: bytes(f.data) })) };
  };
}

/** What the desktop app found when Steam launched the game (desktop/main.cjs steamLaunch). */
export type SteamLaunch = { steam: false } | { steam: true; game: 'ok' | 'missing' | 'none'; where: string; account: boolean };

/** What the desktop app found of Steam and Ultima V in it, launched by Steam or not (desktop/main.cjs steamFind). */
export interface SteamFind {
  steam: boolean;
  game: 'ok' | 'missing' | 'none';
  where: string;
}

/** The Steam options kept on this machine (desktop/steamOptions.cjs): all off until turned on; Cloud saves per account id. */
export interface SteamOptions {
  playLine: boolean;
  compatTool: boolean;
  macPlay: boolean;
  cloud: Record<string, boolean>;
  results: Record<string, string>;
  lineOnAt: number;
}

/** The options, with this launch's Steam account, if one is known. */
export type SteamOptionsHere = SteamOptions & { account: string | null };

/** The desktop app's Steam bridge (desktop/preload.cjs u5native.steam), where the page has one. */
export interface SteamNative {
  launch(): SteamLaunch;
  find(): SteamFind;
  gameFiles(names: string[]): Promise<FoundCopy | null>;
  saves: { all(): Record<string, string> | null; set(key: string, value: string): true | string | false; remove(key: string): boolean };
  /** The Steam (beta) menu's (game.ts SteamHook): what was found, and the launch line, null where this copy has none. */
  status(): Promise<SteamStatus>;
  launchLine(): Promise<string | null>;
  lineState(): Promise<LineCheck | null>;
  options(): SteamOptionsHere;
  /**
   * Turns an option on or off with what it does here, and keeps how it went; null where refused. Cloud saves (for
   * this launch's account only) is only recorded, its copy being the page's: `failed` says why it failed.
   */
  setOption(name: 'playLine' | 'compatTool' | 'macPlay' | 'cloud', on: boolean, failed?: string): Promise<SteamSwitched | null>;
  /** The tester report (desktop/steamReport.cjs), given what only the page knows; null where refused. */
  report(page: ReportArgs): Promise<string | null>;
}

/** Where the kept game files came from: recorded when they are kept, 'unknown' for a copy kept before it was. */
export type FilesFrom = 'steam' | 'installer' | 'unknown';
/** What the page tells the app for the tester report. */
export interface ReportArgs {
  filesFrom: FilesFrom;
  required: string[];
}

export const FILES_FROM_KEY = 'ultima5.filesFrom';

/** Records where the files just kept came from. Storage that will not take it leaves the copy 'unknown'. */
export function noteFilesFrom(from: 'steam' | 'installer'): void {
  try {
    localStorage.setItem(FILES_FROM_KEY, from);
  } catch {
    // Not recorded; the report says unknown.
  }
}

/** What the page gives for the tester report: where the kept files came from, and the names of a whole copy. */
export function reportArgs(): ReportArgs {
  let filesFrom: FilesFrom = 'unknown';
  try {
    const v = localStorage.getItem(FILES_FROM_KEY);
    if (v === 'steam' || v === 'installer') filesFrom = v;
  } catch {
    // Unreadable: unknown.
  }
  return { filesFrom, required: [...REQUIRED] };
}

/** The desktop app's Steam bridge; null outside the app, and in an app of before it. */
export function steamNative(): SteamNative | null {
  return (globalThis as { u5native?: { steam?: SteamNative } }).u5native?.steam ?? null;
}

let launched: SteamLaunch | undefined;

/**
 * How this launch began: by Steam or not (not, outside the desktop app). Asked of the app once a page, as the answer
 * never changes and the asking is synchronous.
 */
export function steamLaunch(): SteamLaunch {
  launched ??= steamNative()?.launch() ?? { steam: false };
  return launched;
}

let found: SteamFind | undefined;

/** Steam's libraries and Ultima V in them, whether or not Steam launched the app; asked of the app once a page. */
export function steamFind(): SteamFind {
  found ??= steamNative()?.find() ?? { steam: false, game: 'none', where: '' };
  return found;
}

/** The game's files from Steam's folder, where Steam has the game; else null (always null outside the desktop app). */
export function steamFound(): (() => Promise<FoundCopy | null>) | null {
  const steam = steamNative();
  return steam && steamFind().game === 'ok' ? () => steam.gameFiles([...REQUIRED]) : null;
}
