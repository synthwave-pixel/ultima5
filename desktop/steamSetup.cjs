// Setting Steam up to play its Ultima V with this engine, and taking that away again, on each system. The player
// turns it on and off in the title's Steam (beta) menu (steamOptions.cjs switchOption, main.cjs). On Windows there is
// only the launch line to paste, since Play from Steam edits none of Steam's files there (macOS Sync's fix alone does,
// below). On Linux a compatibility tool (as Boxtron does for DOS games) is a
// folder of our own in Steam's compatibilitytools.d, which Steam offers in Ultima V's Properties after a restart. On a
// Mac, Steam has no macOS launch for the game, so its entry in Steam's app cache is given one (appinfo.cjs) that runs a
// small launcher .app in the game's folder; that edit, and the manifest that makes Steam download the game, are only
// made with Steam closed. Files are reached through the `fs` handed in, and Steam's state through steamRunning() and
// quitSteam(), so all of it can be tried on temporary folders without a Steam. Linux's cache is given only MacOS in the
// game's cloud save rules, as the Mac's is with its launch, so that saves uploaded from Linux reach a Mac too; so is
// Windows', from 1.1.223 (macOS Sync).
const { createHash } = require('node:crypto');
const { dirname, join } = require('node:path');
const { appEntry, cloudPatch, cloudRules, macPatch, readAppinfo, writeAppinfo } = require('./appinfo.cjs');
const { APP_ID, findGame, parseVdf } = require('./steam.cjs');

const FLATPAK_ID = 'com.synthwavepixel.ultima5';
const TOOL = 'ultima5_sp';
const TOOL_NAME = 'Ultima V SP';
const LAUNCHER = 'Ultima V SP.app';
const LAUNCHER_EXE = 'Ultima V SP';
const INSTALLDIR = 'Ultima V';
const OVERRIDE = 'flatpak override --user --talk-name=org.freedesktop.Flatpak com.valvesoftware.Steam';

/** A string as one word to a POSIX shell, whatever is in it. */
const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * What the player pastes into Ultima V's Launch Options: the installed Windows exe, the Flatpak or the AppImage's
 * own file, each quoted as one argument, then %command%, which Steam replaces with its own launch (and the engine
 * ignores). None on a Mac, where the cache entry is the launch, or for the portable .exe, which is wherever the player
 * put it. Steam on Linux runs the line through a shell, so a path there is double-quoted with $ ` " \ escaped; a
 * Windows path cannot hold a ", so it is only quoted.
 */
function launchLine({ platform, exe, appImage, flatpak, portable }) {
  if (platform === 'win32') return portable || !exe ? null : `"${exe}" %command%`;
  if (platform === 'linux') {
    if (flatpak) return `flatpak run ${FLATPAK_ID} %command%`;
    if (appImage) return `"${appImage.replace(/[\\"$`]/g, '\\$&')}" %command%`;
  }
  return null;
}

const compatToolVdf = `"compatibilitytools"
{
\t"compat_tools"
\t{
\t\t"${TOOL}"
\t\t{
\t\t\t"install_path"\t\t"."
\t\t\t"display_name"\t\t"${TOOL_NAME}"
\t\t\t"from_oslist"\t\t"windows"
\t\t\t"to_oslist"\t\t"linux"
\t\t}
\t}
}
`;

const toolManifestVdf = `"manifest"
{
\t"version"\t\t"2"
\t"commandline"\t\t"/launch.sh %verb%"
}
`;

/**
 * The tool's launcher. Steam runs it with a verb and its own command for the game, which is ignored: run and
 * waitforexitandrun start the engine in its place, and stay until it closes; anything else Steam asks - it calls with
 * other verbs, for app 0 among others - is answered quietly with nothing. Asked to start any game but Ultima V, it says
 * so rather than starting Ultima V. Running as the game's tool keeps the engine inside Steam's launch of it, which is
 * how Game Mode knows the window is the game's (a launch line put it outside, and Game Mode waited on it for ever).
 *
 * Steam's own runtime libraries (LD_LIBRARY_PATH) and its overlay (LD_PRELOAD) are taken away before the engine starts:
 * with them the AppImage hung before it drew anything, and the overlay crashed Chromium's zygote. The AppImage is
 * started with --no-sandbox, as its own menu entry starts it: the sandbox's choice is made before the app's own code
 * runs, so the app can't make it later (main.cjs). The Flatpak keeps its own sandbox.
 *
 * Inside Flatpak Steam's sandbox the host is only reached through flatpak-spawn, which Steam needs leave for; without
 * it, the launcher says what to run. flatpak-spawn starts the engine with the host's environment, so Steam's own is
 * passed on.
 */
function launchScript({ flatpak, appImage }) {
  const target = flatpak ? `flatpak run ${FLATPAK_ID}` : `${shellQuote(appImage)} --no-sandbox`;
  return `#!/bin/sh
# ${TOOL_NAME}: written by the Ultima V app so that Steam's Ultima V plays with its engine.
case "$1" in
  run|waitforexitandrun) ;;
  *) exit 0 ;;
esac
# Steam names the game in SteamAppId, SteamGameId or STEAM_COMPAT_APP_ID, as its version has it.
case "${APP_ID}" in
  "$SteamAppId"|"$SteamGameId"|"$STEAM_COMPAT_APP_ID") ;;
  *)
    echo "${TOOL_NAME} only plays Ultima V (Steam app ${APP_ID})." >&2
    echo "Choose another compatibility tool for this game in its Properties, under Compatibility." >&2
    exit 1
    ;;
esac
# The engine reads the app id from the environment: say it is Ultima V's, whichever name Steam gave it by.
export SteamAppId=${APP_ID}
# Steam's runtime libraries hang the engine, and its overlay crashes it: the engine brings its own libraries.
unset LD_LIBRARY_PATH LD_PRELOAD
# Of what Steam passes on (Ultima V's own DOS command, and the player's launch options), only the app's update flags.
flags=
for a in "$@"; do
  case "$a" in
    --no-auto-update|--no-update-check) flags="$flags $a" ;;
  esac
done
if [ "$FLATPAK_ID" = "com.valvesoftware.Steam" ]; then
  if ! flatpak-spawn --host true >/dev/null 2>&1; then
    echo "Steam from Flathub needs leave to start Ultima V. Run this once, then restart Steam:" >&2
    echo "  ${OVERRIDE}" >&2
    exit 1
  fi
  exec flatpak-spawn --host --env="SteamAppId=$SteamAppId" --env="SteamGameId=$SteamGameId" --env="SteamUser=$SteamUser" ${target}$flags
fi
exec ${target}$flags
`;
}

/** Each Steam folder that is there, once: ~/.steam/root is usually a link to another of them. */
function existingRoots(fs, roots) {
  const seen = new Set();
  const out = [];
  for (const root of roots) {
    let real;
    try {
      real = fs.realpathSync(root);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    out.push(root);
  }
  return out;
}

const toolDir = (root) => join(root, 'compatibilitytools.d', TOOL);

/** Writes the compatibility tool under each Steam folder that is there, and gives the folders written. */
function installCompatTool(fs, roots, launcher) {
  if (!launcher.flatpak && !launcher.appImage) throw new Error('nothing for the compatibility tool to start');
  const written = [];
  for (const root of existingRoots(fs, roots)) {
    const dir = toolDir(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(join(dir, 'compatibilitytool.vdf'), compatToolVdf);
    fs.writeFileSync(join(dir, 'toolmanifest.vdf'), toolManifestVdf);
    fs.writeFileSync(join(dir, 'launch.sh'), launchScript(launcher));
    fs.chmodSync(join(dir, 'launch.sh'), 0o755);
    written.push(dir);
  }
  return written;
}

/**
 * The compatibility tool written again where it is installed, so that a newer app's launcher replaces an older one's
 * and follows an AppImage that was moved (each start, while the option is on). A Steam folder without it is left alone,
 * and so is a tool that starts the other build - the Flatpak's, started from the AppImage, or the other way - so that
 * two builds each set up do not take it from each other. Gives the folders that changed.
 */
function refreshCompatTool(fs, roots, launcher) {
  if (!launcher.flatpak && !launcher.appImage) return [];
  const changed = [];
  for (const root of existingRoots(fs, roots)) {
    const dir = toolDir(root);
    const now = readOr(fs, join(dir, 'launch.sh'), null);
    if (now === null || now.includes(`flatpak run ${FLATPAK_ID}`) !== !!launcher.flatpak) continue;
    const files = [
      ['compatibilitytool.vdf', compatToolVdf, undefined],
      ['toolmanifest.vdf', toolManifestVdf, undefined],
      ['launch.sh', launchScript(launcher), 0o755],
    ];
    if (files.every(([name, text]) => readOr(fs, join(dir, name), null) === text)) continue;
    for (const [name, text, mode] of files) writeIfChanged(fs, join(dir, name), text, mode);
    changed.push(dir);
  }
  return changed;
}

/** Whether any Steam folder has the compatibility tool. */
function hasCompatTool(fs, roots) {
  return roots.some((root) => fs.existsSync(join(toolDir(root), 'launch.sh')));
}

/** Takes the compatibility tool out of every Steam folder. */
function removeCompatTool(fs, roots) {
  for (const root of roots) fs.rmSync(toolDir(root), { recursive: true, force: true });
}

// The Mac.

const manifestAcf = `"AppState"
{
\t"appid"\t\t"${APP_ID}"
\t"Universe"\t\t"1"
\t"StateFlags"\t\t"1026"
\t"installdir"\t\t"${INSTALLDIR}"
}
`;

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleExecutable</key>
\t<string>${LAUNCHER_EXE}</string>
\t<key>CFBundleIdentifier</key>
\t<string>com.synthwavepixel.ultima5.steam</string>
\t<key>CFBundleName</key>
\t<string>${LAUNCHER_EXE}</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
</dict>
</plist>
`;

/**
 * The launcher .app's executable. Steam on a Mac starts an .app but not a bare script, and treats the process it
 * started as the game (play time, the overlay, the Cloud sync after), so this runs the app in its own place and stays.
 */
function launcherScript(appExe) {
  return `#!/bin/sh
# Steam's macOS launch of Ultima V: runs the Ultima V app, written by it when Steam was set up.
APP=${shellQuote(appExe)}
if [ ! -x "$APP" ]; then
  echo "Ultima V's engine app is not at $APP: reinstall it, or remove Steam setup" >&2
  exit 1
fi
exec "$APP" "$@"
`;
}

const readOr = (fs, path, fallback) => {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return fallback;
  }
};

/** Writes a file only when what it holds differs, so a second setup changes nothing. */
function writeIfChanged(fs, path, text, mode) {
  if (readOr(fs, path, null) === text) return;
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, text);
  if (mode) fs.chmodSync(path, mode);
}

/** What setup made, kept in the app's data: the launcher, and the manifest if we wrote it. */
const readNote = (fs, noteFile) => {
  try {
    return JSON.parse(fs.readFileSync(noteFile, 'utf8'));
  } catch {
    return null;
  }
};

const cacheFile = (steamRoot) => join(steamRoot, 'appcache', 'appinfo.vdf');

/**
 * Ultima V's entry in the cache, and that entry as `patch` makes it (our launch added, by default), or null when the
 * account has not got the game (or Steam has not cached anything yet) or the entry is not one the patch knows how to
 * edit. A cache that cannot be read or makes no sense is an error, said as it is.
 */
function ultimaEntry(fs, steamRoot, patch = (kv) => macPatch(kv, LAUNCHER)) {
  let bytes;
  try {
    bytes = fs.readFileSync(cacheFile(steamRoot));
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    throw e;
  }
  const info = readAppinfo(bytes);
  const entry = appEntry(info, Number(APP_ID));
  if (!entry) return null;
  try {
    return { info, entry, patch: patch(entry.kv) };
  } catch {
    return null;
  }
}

/**
 * Whether Steam's Play may be aimed at this copy of the app: a built app (not a development run), and not one macOS
 * is running from a hidden copy of the download (App Translocation, until the app is moved out of Downloads).
 */
const appInPlace = (packaged, appExe) => packaged && !appExe.includes('/AppTranslocation/');

/**
 * Puts the launcher in the game's folder, made if the library is there and the download has not been yet. Gives where
 * it went and whether the game's folder was made for it, or null when the library is on a disk that is not there.
 */
function placeLauncher(fs, steamRoot, appExe) {
  const exists = (p) => fs.existsSync(p);
  const found = findGame([steamRoot], (p) => readOr(fs, p, null), exists);
  if (!found) return null;
  const library = 'folder' in found ? found.library : found.missing;
  if (!exists(join(library, 'steamapps'))) return null; // placed next time
  const folder = join(library, 'steamapps', 'common', INSTALLDIR);
  const madeFolder = !exists(folder);
  const app = join(folder, LAUNCHER);
  writeIfChanged(fs, join(app, 'Contents', 'Info.plist'), infoPlist);
  writeIfChanged(fs, join(app, 'Contents', 'MacOS', LAUNCHER_EXE), launcherScript(appExe), 0o755);
  return { app, madeFolder };
}

/**
 * The cache given our launch, starting from the entry in it now. The entry as Steam sent it is kept first (as a cache
 * file of that one entry, whose keys stay right whatever Steam does to its string table), so removal puts back Steam's
 * latest. The cache is written beside itself and renamed into place, so it is never left half written.
 */
function patchCache(fs, steamRoot, keptOriginal, found) {
  const { info, entry, patch } = found;
  if (!patch.changed) return;
  const alone = {
    magic: info.magic,
    universe: info.universe,
    data: Buffer.alloc(0),
    strings: [],
    entries: [{ appid: Number(APP_ID), start: 0, stop: 0 }],
  };
  fs.mkdirSync(dirname(keptOriginal), { recursive: true });
  fs.writeFileSync(keptOriginal, writeAppinfo(alone, Number(APP_ID), entry.header, entry.kv));
  writeCache(fs, steamRoot, info, entry.header, patch.kv);
}

/** The cache with Ultima V's entry as `kv`, written beside itself and renamed into place. */
function writeCache(fs, steamRoot, info, header, kv) {
  const file = cacheFile(steamRoot);
  fs.writeFileSync(`${file}.ultima5`, writeAppinfo(info, Number(APP_ID), header, kv));
  fs.renameSync(`${file}.ultima5`, file);
}

/** Steam closed, quitting it if need be; false when it would not go. */
async function steamClosed(steamRunning, quitSteam) {
  if (!steamRunning()) return true;
  await quitSteam();
  return !steamRunning();
}

/**
 * Sets a Mac up: with Steam closed, the manifest that makes Steam download the game (unless a library has it), the
 * launcher in the game's folder, and our launch in the cache. A copy Play should not be aimed at (appInPlace) writes
 * nothing.
 */
async function macSetup({ fs, steamRoot, appExe, packaged, keptOriginal, noteFile, steamRunning, quitSteam }) {
  if (!appInPlace(packaged, appExe)) return 'app-not-in-place';
  if (!ultimaEntry(fs, steamRoot)) return 'not-owned';
  if (!(await steamClosed(steamRunning, quitSteam))) return 'steam-running';
  // Steam may have written its cache as it quit, so it is read again.
  const found = ultimaEntry(fs, steamRoot);
  if (!found) return 'not-owned';
  const note = readNote(fs, noteFile) ?? { manifest: null };
  const read = (p) => readOr(fs, p, null);
  if (findGame([steamRoot], read, (p) => fs.existsSync(p)) === null) {
    const manifest = join(steamRoot, 'steamapps', `appmanifest_${APP_ID}.acf`);
    writeIfChanged(fs, manifest, manifestAcf);
    note.manifest = manifest;
  }
  const placed = placeLauncher(fs, steamRoot, appExe);
  if (placed) {
    note.launcher = placed.app;
    note.madeFolder = note.madeFolder || placed.madeFolder;
  }
  note.launcher ??= null;
  writeIfChanged(fs, noteFile, `${JSON.stringify(note, null, 2)}\n`);
  patchCache(fs, steamRoot, keptOriginal, found);
  return 'done';
}

/**
 * At each start, for a Mac that was set up: the launcher put back or pointed at where the app is now (only from a copy
 * Play may be aimed at, so a development run or a copy still in Downloads never takes Play over), and, if Steam has
 * replaced Ultima V's entry, our launch added to the new one when Steam is closed.
 */
function macReapply({ fs, steamRoot, appExe, packaged, keptOriginal, noteFile, steamRunning }) {
  const note = readNote(fs, noteFile);
  if (!note) return 'not-set-up';
  const found = ultimaEntry(fs, steamRoot);
  if (!found) return 'not-owned';
  const placed = appInPlace(packaged, appExe) ? placeLauncher(fs, steamRoot, appExe) : null;
  if (placed && placed.app !== note.launcher) {
    const madeFolder = note.madeFolder || placed.madeFolder;
    writeIfChanged(fs, noteFile, `${JSON.stringify({ ...note, launcher: placed.app, madeFolder }, null, 2)}\n`);
  }
  if (!found.patch.changed) return 'ready';
  if (steamRunning()) return 'steam-running';
  patchCache(fs, steamRoot, keptOriginal, found);
  return 'ready';
}

/**
 * Where a Mac stands, for the Steam line: as macReapply says, but a Mac not set up whose cache has no Ultima V is
 * 'not-owned' (setup would say so); and whether Steam is running, so that the player is asked before setting up or
 * removing quits it.
 */
function macStatus(where) {
  let state = macReapply(where);
  if (state === 'not-set-up' && !ultimaEntry(where.fs, where.steamRoot)) state = 'not-owned';
  return { state, steamRunning: where.steamRunning() };
}

/** Whether Ultima V's cache entry has our launch now: true or false, null where there is no entry or it will not read. Only reads. */
function macPatched({ fs, steamRoot }) {
  try {
    const found = ultimaEntry(fs, steamRoot);
    return found ? !found.patch.changed : null;
  } catch {
    return null;
  }
}

/**
 * Takes a Mac's setup away: with Steam closed, the kept entry back in the cache (unless Steam has since sent a newer
 * one, which is left as it is), then the launcher. The manifest, if we wrote it, goes only while nothing has been
 * downloaded (the game's folder holds no more than the launcher), as Steam would otherwise forget the installed game;
 * the folder goes too if we made it and it is left empty. A kept entry that does not hold Ultima V is left, and said.
 */
async function macRestore({ fs, steamRoot, keptOriginal, noteFile, steamRunning, quitSteam }) {
  const note = readNote(fs, noteFile);
  const kept = fs.existsSync(keptOriginal);
  if (!note && !kept) return 'done';
  if (!(await steamClosed(steamRunning, quitSteam))) return 'steam-running';
  if (kept) {
    const found = ultimaEntry(fs, steamRoot);
    if (found && !found.patch.changed) {
      const original = appEntry(readAppinfo(fs.readFileSync(keptOriginal)), Number(APP_ID));
      if (!original) return 'kept-unusable';
      writeCache(fs, steamRoot, found.info, original.header, original.kv);
    }
    fs.rmSync(keptOriginal, { force: true });
  }
  const empty = (folder) => !fs.existsSync(folder) || fs.readdirSync(folder).length === 0;
  if (note?.launcher) {
    fs.rmSync(note.launcher, { recursive: true, force: true });
    const folder = dirname(note.launcher);
    if (note.madeFolder && fs.existsSync(folder) && empty(folder)) fs.rmdirSync(folder);
  }
  if (note?.manifest && empty(join(dirname(note.manifest), 'common', INSTALLDIR))) fs.rmSync(note.manifest, { force: true });
  fs.rmSync(noteFile, { force: true });
  return 'done';
}

// Linux and Windows: the cloud rules (macOS Sync). Steam marks each Cloud save it uploads with the platforms of the
// game's rule it matched, and EA's rules name Windows alone, so without MacOS added here saves uploaded from this
// machine never reach a Mac.

/** Ultima V's entry in a Steam folder's cache, and that entry with MacOS in its cloud rules (cloudPatch), as ultimaEntry. */
const cloudEntry = (fs, root) => ultimaEntry(fs, root, cloudPatch);

/**
 * How Steam's cloud rules for Ultima V stand in this machine's Steam folders (macOS Sync), only read: 'needed' where a
 * folder has the game without MacOS in its rules, 'unreadable' where a cache or the game's entry in it would not read
 * (`why` says what), 'ready' where every folder that has the game has MacOS, 'not-owned' where none has it cached.
 * `rules` is the game's rules as they read (appinfo.cjs cloudRules), for the report. A folder that lacks MacOS is said
 * first, as that is the one to fix; one that will not read before one that is fine, as a check that could not look
 * must not say all is well.
 */
function cloudCheck(fs, roots) {
  let state = 'not-owned';
  let why = null;
  let rules = [];
  const unreadable = (text) => {
    state = 'unreadable';
    why ??= text;
  };
  for (const root of existingRoots(fs, roots)) {
    let bytes;
    try {
      bytes = fs.readFileSync(cacheFile(root));
    } catch (e) {
      if (e && e.code !== 'ENOENT') unreadable(`Steam's cache: ${e.message ?? e}`);
      continue;
    }
    let entry;
    try {
      entry = appEntry(readAppinfo(bytes), Number(APP_ID));
    } catch (e) {
      unreadable(`Steam's cache: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!entry) continue;
    try {
      rules = cloudRules(entry.kv);
      if (cloudPatch(entry.kv).changed) return { state: 'needed', why: null, rules };
    } catch (e) {
      unreadable(`Ultima V's entry: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (state === 'not-owned') state = 'ready';
  }
  return { state, why, rules };
}

/**
 * Where Linux's Steam folders stand: 'needed' where one has Ultima V without MacOS in its cloud rules, 'ready' where
 * every one that has it has MacOS, null where none has it (or none will read). Only reads.
 */
function linuxCloud(fs, roots) {
  const { state } = cloudCheck(fs, roots);
  return state === 'needed' || state === 'ready' ? state : null;
}

/** The mark Steam gives a file uploaded for a Mac (ERemoteStoragePlatform's OSX). */
const FOR_MAC = 2;

/**
 * The saves Steam last synced from or to this Steam folder marked for Windows alone, each changed so that Steam
 * uploads it again, marked as the rule now says: a line end added (or taken off one that ends with one), which neither
 * the JSON nor the base64 a save is kept as minds. Only a file as Steam last synced it (its hash the one in Steam's
 * remotecache.vdf) is changed: one changed since is uploaded anyway. Gives how many were.
 */
function remarkSaves(fs, root) {
  const read = (p) => readOr(fs, p, null);
  const game = findGame([root], read, (p) => fs.existsSync(p));
  if (!game || !('folder' in game)) return 0;
  let accounts;
  try {
    accounts = fs.readdirSync(join(root, 'userdata'));
  } catch {
    return 0;
  }
  let changed = 0;
  for (const account of accounts) {
    const text = read(join(root, 'userdata', account, APP_ID, 'remotecache.vdf'));
    const files = text === null ? null : parseVdf(text)?.[APP_ID];
    if (!files || typeof files !== 'object') continue;
    for (const [name, file] of Object.entries(files)) {
      if (!name.startsWith('ultima5-sp/') || name.split('/').includes('..') || !file || typeof file !== 'object') continue;
      if (file.root !== '1' || (Number(file.platformstosync2) & FOR_MAC) !== 0) continue;
      const path = join(game.folder, ...name.split('/'));
      let bytes;
      try {
        bytes = fs.readFileSync(path);
      } catch {
        continue;
      }
      if (createHash('sha1').update(bytes).digest('hex') !== String(file.sha).toLowerCase()) continue;
      const kept = bytes.toString('utf8');
      fs.writeFileSync(path, kept.endsWith('\n') ? kept.slice(0, -1) : `${kept}\n`);
      changed++;
    }
  }
  return changed;
}

/**
 * How many of `account`'s saves in Steam Cloud Steam marked for Windows alone, so that a Mac never downloads them, from
 * the record this machine's Steam keeps of the cloud (remotecache.vdf) - the check that looks at what Steam did rather
 * than at its settings (macOS Sync). `mac`: on a Mac, every such save, none of which reaches it. Elsewhere, only those
 * still as Steam last synced them here: one changed since (re-marked by resendSaves, or played since) goes up again
 * with the rules' marks. Null where Steam keeps no record for the account here.
 */
function stuckSaves(fs, roots, account, mac) {
  if (!account) return null;
  const read = (p) => readOr(fs, p, null);
  for (const root of existingRoots(fs, roots)) {
    const text = read(join(root, 'userdata', account, APP_ID, 'remotecache.vdf'));
    const files = text === null ? null : parseVdf(text)?.[APP_ID];
    if (!files || typeof files !== 'object') continue;
    const game = mac ? null : findGame([root], read, (p) => fs.existsSync(p));
    let stuck = 0;
    for (const [name, file] of Object.entries(files)) {
      if (!name.startsWith(`ultima5-sp/${account}/`) || name.split('/').includes('..') || !file || typeof file !== 'object') continue;
      if ((Number(file.platformstosync2) & FOR_MAC) !== 0) continue;
      if (!mac) {
        if (!game || !('folder' in game)) continue;
        let bytes;
        try {
          bytes = fs.readFileSync(join(game.folder, ...name.split('/')));
        } catch {
          continue;
        }
        if (createHash('sha1').update(bytes).digest('hex') !== String(file.sha).toLowerCase()) continue;
      }
      stuck++;
    }
    return stuck;
  }
  return null;
}

/**
 * The saves Steam last synced here marked for Windows alone, re-marked in every Steam folder (remarkSaves) so that
 * Steam uploads them again with the rules' marks: the fix where the rules already have MacOS, which needs no Steam
 * closed (the files are only the game's own). Gives how many were.
 */
function resendSaves(fs, roots) {
  let changed = 0;
  for (const root of existingRoots(fs, roots)) changed += remarkSaves(fs, root);
  return changed;
}

/** MacOS added to the cloud rules of each Steam folder whose cache has not got it, and its saves re-marked. Steam closed. */
function patchLinuxCloud(fs, roots) {
  for (const root of existingRoots(fs, roots)) {
    let found;
    try {
      found = cloudEntry(fs, root);
    } catch {
      continue;
    }
    if (!found || !found.patch.changed) continue;
    writeCache(fs, root, found.info, found.entry.header, found.patch.kv);
    remarkSaves(fs, root);
  }
}

/**
 * Steam's cloud rules given MacOS where a cache has not got it (Linux, and Windows), with Steam closed: quit first,
 * and started again after ('restarted') if it was running; 'fixed' where it was closed already. 'done' where there was
 * nothing to do, 'not-owned' where no Steam folder has the game.
 */
async function linuxCloudSetup({ fs, roots, steamRunning, quitSteam, openSteam }) {
  const state = linuxCloud(fs, roots);
  if (state === null) return 'not-owned';
  if (state === 'ready') return 'done';
  const wasRunning = steamRunning();
  if (!(await steamClosed(steamRunning, quitSteam))) return 'steam-running';
  patchLinuxCloud(fs, roots);
  if (!wasRunning) return 'fixed';
  openSteam();
  return 'restarted';
}

/** At a start outside Steam: MacOS put back in the cloud rules where Steam has replaced the entry, if Steam is closed. */
function linuxCloudReapply({ fs, roots, steamRunning }) {
  const state = linuxCloud(fs, roots);
  if (state !== 'needed') return state ?? 'not-owned';
  if (steamRunning()) return 'steam-running';
  patchLinuxCloud(fs, roots);
  return 'ready';
}

module.exports = {
  cloudCheck,
  stuckSaves,
  resendSaves,
  linuxCloud,
  linuxCloudSetup,
  linuxCloudReapply,
  FLATPAK_ID,
  OVERRIDE,
  launchLine,
  installCompatTool,
  refreshCompatTool,
  hasCompatTool,
  removeCompatTool,
  macSetup,
  macReapply,
  macStatus,
  macPatched,
  macRestore,
};
