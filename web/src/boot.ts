/**
 * boot.ts
 *
 * Where the game files come from: the copy installed in this browser, or the installer until one is installed (Scan for game files..., a drop,
 * a choice).
 */

import { GameFiles } from './data/files.ts';
import { runInstaller } from './install/installer.ts';
import { loadInstalled, saveInstalled } from './install/store.ts';
import { complete, identify, listed } from './install/gameFiles.ts';
import { scanOutcome } from './install/scan.ts';
import { noteFilesFrom, steamFound, steamLaunch, steamNative } from './install/sources.ts';
import { STEAM_NOTED_KEY, steamStore, useStore } from './game/keyStore.ts';

/** Whether the page has said its note already: it is said once a launch. */
let told = false;
/** The note, once worked out (null: none to say this launch), as the title looks for it at every tick. */
let settled: { text: string; seen: () => void } | null | undefined;
const FOUND_KEY = 'ultima5.steamFoundNoted';
const FOUND = 'Found Ultima V in your Steam library.';
/** Whether this launch took Steam's copy and has yet to say so. */
let foundPending = false;
/** Whether Cloud saves is on but Steam's saves could not be reached this launch. */
let unreachable = false;
/** The Steam account whose saves this launch keeps with Steam, else null. */
let cloudAccount: string | null = null;
const UNREACHABLE = "Steam's saves can't be reached; using this computer's saves.";
const FIRST_LAUNCH = 'Saves made while playing from Steam stay with Steam. Turning Steam Cloud saves off copies them back.';

/** The copy installed in this browser, if it is whole and as it was installed; else why not (or nothing, never installed). */
async function installedCopy(): Promise<{ files: GameFiles | null; notice?: string }> {
  const installed = await loadInstalled();
  if (!installed) return { files: null };
  const { files, damaged } = installed;
  if (!complete(identify(files.names().map((n) => ({ path: n, data: files.get(n) })))))
    return { files: null, notice: 'Some of the game files kept in this browser are gone. Give the game its files again.' };
  if (damaged.length)
    return {
      files: null,
      notice: `Some of the game files kept in this browser are not as they were installed (${listed(damaged)}): damaged in keeping. Give the game its files again.`,
    };
  return { files };
}

/** The game files already to hand - the copy installed in this game's storage - else null. */
export async function filesAtHand(): Promise<GameFiles | null> {
  return (await installedCopy()).files;
}

/**
 * Where the saves are kept, chosen before anything reads one. Steam's folder only where the player has turned Cloud
 * saves on for this launch's Steam account and the folder can be read; every other launch, and a Steam launch with
 * Cloud saves off (the default, in which nothing is written to Steam's folders), keeps the browser's. Cloud saves on
 * but out of reach (no account known, or the folder will not load) falls back to the browser's too, and says so.
 */
export function chooseStore(): void {
  unreachable = false;
  cloudAccount = null;
  const launch = steamLaunch();
  const steam = steamNative();
  if (!launch.steam || !steam) return;
  const { cloud, account } = steam.options();
  if (account === null) {
    // Cloud saves is kept per account, so with none known it is on only if it is on for some account: whose saves these are is lost.
    unreachable = Object.values(cloud).some((on) => on);
    return;
  }
  if (cloud[account] !== true) return;
  const initial = steam.saves.all();
  if (!initial) {
    unreachable = true;
    return;
  }
  cloudAccount = account;
  useStore(steamStore(initial, steam.saves));
}

/**
 * What the title says once, in the news box: that the game was found in Steam's library and kept, or, when Cloud
 * saves is on but Steam's saves cannot be reached, that this computer's are in use (each launch it applies), or, the
 * first time on this machine that Cloud saves is on for the account, how the saves are kept. Null otherwise.
 */
export function steamNote(): { text: string; seen: () => void } | null {
  if (told) return null;
  if (settled === undefined) settled = noteFor();
  return settled;
}

/** steamNote's note, worked out from the launch and the options. What explains the saves in play goes first. */
function noteFor(): { text: string; seen: () => void } | null {
  if (unreachable) return { text: UNREACHABLE, seen: () => void (told = true) };
  if (foundPending) {
    return {
      text: FOUND,
      seen: () => {
        told = true;
        try {
          localStorage.setItem(FOUND_KEY, '1');
        } catch {
          // Nowhere to keep it: said again if the game is found again.
        }
      },
    };
  }
  if (cloudAccount === null) return null;
  const key = `${STEAM_NOTED_KEY}.${cloudAccount}`;
  try {
    if (localStorage.getItem(key) !== null) return null;
  } catch {
    return null;
  }
  return {
    text: FIRST_LAUNCH,
    seen: () => {
      told = true;
      try {
        localStorage.setItem(key, '1');
      } catch {
        // Nowhere to keep it: said again next time.
      }
    },
  };
}

/** What a Steam launch that cannot play Steam's copy tells the installer: what was wrong with it. */
function steamNotice(launch: Extract<ReturnType<typeof steamLaunch>, { steam: true }>): string {
  if (launch.game === 'missing')
    return `Steam lists Ultima V in ${launch.where}, but its folder is not there. Install it in Steam, then press Play again.`;
  return 'Steam launched the game, but no Steam library holds Ultima V.';
}

/**
 * The installed copy; else Steam's, where it is found and whole, kept as the installer keeps one (so Steam may move or
 * lose the folder after); else the installer, with what a Steam launch should say of Steam when it found nothing.
 */
export async function gameFiles(): Promise<GameFiles> {
  const { files, notice } = await installedCopy();
  if (files) return files;
  const launch = steamLaunch();
  const copy = steamFound();
  let why = notice;
  if (copy) {
    const found = await copy().catch(() => null);
    const got = scanOutcome(found ? [found] : [], 'No game files could be read from the folder Steam gave.');
    if (got.kind === 'install') {
      let kept = true;
      try {
        await saveInstalled(got.found.files);
        noteFilesFrom('steam');
      } catch {
        kept = false;
      }
      // Said once, and only when it was kept: otherwise the next start finds it again.
      if (kept && !seenFound()) {
        foundPending = true;
        settled = undefined;
      }
      return got.found.files;
    }
    // A Steam launch was expecting the game, so it is told what was wrong with Steam's copy.
    if (launch.steam) why = got.text;
  } else if (launch.steam) why = steamNotice(launch);
  return runInstaller(why);
}

/** Whether the found note has been seen on this machine. */
function seenFound(): boolean {
  try {
    return localStorage.getItem(FOUND_KEY) !== null;
  } catch {
    return false;
  }
}
