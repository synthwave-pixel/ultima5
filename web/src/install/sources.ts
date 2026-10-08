/**
 * sources.ts
 *
 * Where a scan for game files looks (scan.ts): on the web, the site's own gamedata/ - the repo's files on the dev
 * server (vite.config.ts devGameData), a self-hoster's copy anywhere else; in the desktop app, the disk, through the
 * app's one bridge (desktop/scan.cjs); on Android, a folder the player picks (the app's GameFolder plugin).
 */

import { REQUIRED } from './gameFiles.ts';
import type { FoundCopy } from './scan.ts';

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
