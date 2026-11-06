/**
 * boot.ts
 *
 * Where the game files come from: the copy installed in this browser, or the installer until one is installed (Scan for game files..., a drop,
 * a choice).
 */

import { GameFiles } from './data/files.ts';
import { runInstaller } from './install/installer.ts';
import { loadInstalled } from './install/store.ts';
import { complete, identify, listed } from './install/gameFiles.ts';
import { scanOutcome } from './install/scan.ts';
import { steamCopy, steamLaunch, steamNative } from './install/sources.ts';
import { isSteamKey, kept, steamStore, useStore } from './game/keyStore.ts';

/** Whether the page has said its note already: it is said once a launch. */
let told = false;
/** The note, once worked out (null: none to say this launch), as the title looks for it at every tick. */
let settled: { text: string; seen: () => void } | null | undefined;
const NOTED_KEY = 'ultima5.steamNoted';
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
 * What the title says once, in the news box, about a Steam launch: that no Steam account is known (each launch, as
 * nothing is saved), or, the first time on this machine with no saves yet, how the saves are kept. Null otherwise.
 */
export function steamNote(): { text: string; seen: () => void } | null {
  if (told) return null;
  if (settled === undefined) settled = noteFor();
  return settled;
}

/** steamNote's note, worked out from the launch and what is kept. */
function noteFor(): { text: string; seen: () => void } | null {
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
 * The installed copy, or the installer until one is installed (Scan for game files..., a drop, a choice). In a Steam
 * launch, Steam's own copy: its files are played from its folder and not kept in the browser's store.
 */
export async function gameFiles(): Promise<GameFiles> {
  const launch = steamLaunch();
  if (launch.steam) {
    const copy = steamCopy();
    if (!copy) return runInstaller(steamNotice(launch));
    const found = await copy().catch(() => null);
    const got = scanOutcome(found ? [found] : [], 'No game files could be read from the folder Steam gave.');
    return got.kind === 'install' ? got.found.files : runInstaller(got.text);
  }
  const { files, notice } = await installedCopy();
  return files ?? runInstaller(notice);
}
