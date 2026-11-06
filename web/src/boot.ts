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
import { steamFound, steamLaunch, steamNative } from './install/sources.ts';
import { isSteamKey, kept, steamStore, useStore } from './game/keyStore.ts';

/** Whether the page has said its note already: it is said once a launch. */
let told = false;
/** The note, once worked out (null: none to say this launch), as the title looks for it at every tick. */
let settled: { text: string; seen: () => void } | null | undefined;
const NOTED_KEY = 'ultima5.steamNoted';
const FOUND_KEY = 'ultima5.steamFoundNoted';
const FOUND = 'Found Ultima V in your Steam library.';
/** Whether this launch took Steam's copy and has yet to say so. */
let foundPending = false;
const NO_ACCOUNT = 'Steam launched the game, but which Steam account did is unknown, so nothing can be saved.';
const FIRST_LAUNCH =
  'Playing through Steam: your saves here are kept with Steam, apart from any made outside it. Export and Import carry a game across.';

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
 * Where the saves are kept, chosen before anything reads one. A Steam launch always keeps them with Steam: from the
 * files there, or, with no folder or no account to keep them in, in a store that refuses every write - never the
 * browser's, which would mix this game's saves with the other launches'. Any other launch keeps the browser's.
 */
export function chooseStore(): void {
  const launch = steamLaunch();
  const steam = steamNative();
  if (!launch.steam || !steam) return;
  const initial = (launch.account && steam.saves.all()) || null;
  useStore(steamStore(initial ?? {}, initial ? steam.saves : { set: () => false, remove: () => false }));
}

/**
 * What the title says once, in the news box: that the game was found in Steam's library and kept, or, about a
 * Steam launch, that no Steam account is known (each launch, as
 * nothing is saved), or, the first time on this machine with no saves yet, how the saves are kept. Null otherwise.
 */
export function steamNote(): { text: string; seen: () => void } | null {
  if (told) return null;
  if (settled === undefined) settled = noteFor();
  return settled;
}

/** steamNote's note, worked out from the launch and what is kept. Finding the game goes first; the rest wait a launch. */
function noteFor(): { text: string; seen: () => void } | null {
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
  const launch = steamLaunch();
  if (told || !launch.steam || launch.game !== 'ok') return null;
  if (!launch.account) return { text: NO_ACCOUNT, seen: () => void (told = true) };
  try {
    if (localStorage.getItem(NOTED_KEY) !== null) return null;
  } catch {
    return null;
  }
  const store = kept();
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key !== null && isSteamKey(key)) return null;
  }
  return {
    text: FIRST_LAUNCH,
    seen: () => {
      told = true;
      try {
        localStorage.setItem(NOTED_KEY, '1');
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
