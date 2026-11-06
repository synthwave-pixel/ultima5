// The desktop app: one window showing the built game from app/, served over a
// private app:// scheme so it behaves as a secure origin (storage, gamepads,
// clipboard) without a web server. No menu bar, so every key reaches the
// game; F11 or Alt+Enter toggles full screen, as do the system's own
// controls and the touch pad's full-screen button (preload.cjs). The window
// starts full screen unless the player last left it a window, and always when
// Steam's Game Mode launched it (windowState.cjs). Under gamescope,
// Steam's Game Mode compositor, GPU acceleration and the Chromium sandbox
// are turned off: see below. Only one copy runs; a second launch brings the
// first window forward. --dev turns on the development build's cheats (shown
// in red under Cheats) in a release build, for testing it (web/src/devMode.ts).
// The page is sandboxed, and the installer's scan for the game's files is the
// one thing it may ask of the disk (preload.cjs, scan.cjs). Launched from a
// non-Steam shortcut, the app puts Steam's library artwork in place, once
// (steamArt.cjs). Launched by Steam itself, the saves are files in the game's folder (steamSaves.cjs). Newer releases are looked for once it is up, and installed or told of as the copy allows
// (updates.cjs). The Windows portable .exe keeps its data in a folder beside it (portable.cjs). The Steam line in
// Settings sets Steam up to play its Ultima V with this engine, or takes that away (steamSetup.cjs); on a Mac that was
// set up, each start puts the edit back if Steam has undone it.
const electron = require('electron');
const { app, BrowserWindow, dialog, protocol, net, shell, session, ipcMain } = electron;
const { join, normalize } = require('node:path');
const { pathToFileURL } = require('node:url');
const { homedir } = require('node:os');
const fs = require('node:fs');
const { writeFileSync, existsSync, readFileSync } = fs;
const { execFile, spawnSync } = require('node:child_process');
const { readCopy, scanForGameFiles } = require('./scan.cjs');
const { readState, startsFullScreen, writeState } = require('./windowState.cjs');
const {
  applyUpdate,
  checkForUpdates,
  closeUpdates,
  currentNews,
  currentOffer,
  lookForNews,
  newsSeen,
  onOffer,
  releaseNotes,
  toldOfUpdate,
  updating,
} = require('./updates.cjs');
const { installSteamArt } = require('./steamArt.cjs');
const { portableData } = require('./portable.cjs');
const { accountId, findGame, isSteamLaunch, libraryPaths, saveDir, steamRoots } = require('./steam.cjs');
const { loadAll, removeKey, writeKey } = require('./steamSaves.cjs');
const { readOptions, writeOptions } = require('./steamOptions.cjs');
const { report: steamReport } = require('./steamReport.cjs');
const { lineState } = require('./launchCheck.cjs');
const { clashMessage, noteMode } = require('./instanceMode.cjs');
const steamSetup = require('./steamSetup.cjs');

// The portable .exe's data beside it, set before anything (the single-instance lock, the page's storage) uses it - and
// before anything asks for the data folder, which Electron makes as it is asked (portable.cjs).
const beside = portableData({ env: process.env, appData: app.getPath('appData'), name: app.getName() });
if (beside) app.setPath('userData', beside);

// Game Mode runs the app under the gamescope compositor, where Chromium's GPU process has hung whole sessions and
// its seccomp sandbox has killed apps Steam launched. The game is a 2D canvas that needs neither, so under gamescope
// both are off, and the window is X11 (XWayland), the path gamescope handles best. Desktop Mode is left alone.
const inGamescope = !!process.env.GAMESCOPE_WAYLAND_DISPLAY || /gamescope/i.test(process.env.XDG_CURRENT_DESKTOP ?? '');
if (inGamescope) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

const APP_DIR = join(__dirname, 'app');
const SCHEME = 'app';
const HOST = 'ultima5';
/** How long a quit waits for the Flatpak's update to finish coming down (holdForUpdate). */
const UPDATE_HOLD_MS = 60_000;

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/**
 * Windows' Steam folder, from the registry (HKCU\Software\Valve\Steam SteamPath), asked once; null elsewhere or when
 * it is not set. Steam writes it with forward slashes, which steamRoots takes as a Windows path only with backslashes.
 */
let registryPath;
function registrySteamPath() {
  if (registryPath !== undefined) return registryPath;
  registryPath = null;
  if (process.platform !== 'win32') return registryPath;
  const r = spawnSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', windowsHide: true });
  const m = /SteamPath\s+REG_\w+\s+(.+)/.exec(r.stdout ?? '');
  if (m) registryPath = m[1].trim().replace(/\//g, '\\');
  return registryPath;
}

/** Where Steam may be on this system (steam.cjs), the registry's place first on Windows. */
const steamRootsHere = () =>
  steamRoots({ platform: process.platform, home: homedir(), env: process.env, registrySteamPath: registrySteamPath() });

let found;
/**
 * Steam and Ultima V in its libraries, looked for once whether or not Steam launched the app (the page asks again and
 * again): `steam` - is there a Steam root at all - and `game` - 'ok' (its folder is there), 'missing' (Steam lists it
 * in a library whose folder is not there) or 'none' (no library holds it) - and `where`: the folder, or the library it
 * was expected in. `root` is the Steam folder whose library holds the game (it also names the account), else null.
 * Only reads.
 */
function steamFind() {
  if (found) return found;
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  const roots = steamRootsHere();
  const steam = roots.some((r) => existsSync(r));
  let missing = null;
  for (const root of roots) {
    const game = findGame([root], read, existsSync);
    if (game && 'missing' in game) missing ??= game.missing;
    if (!game || !('folder' in game)) continue;
    return (found = { steam, game: 'ok', where: game.folder, folder: game.folder, root });
  }
  if (missing !== null) return (found = { steam, game: 'missing', where: missing, folder: null, root: null });
  return (found = { steam, game: 'none', where: '', folder: null, root: null });
}

/**
 * What a Steam launch found: null when Steam did not launch the game, else steamFind's `game` and `where`. `dir` is
 * where the saves are kept, <game folder>/ultima5-sp/<account id>, null without a folder or an account (a launch
 * that mixed accounts would be worse than none); `folder` is the game's own.
 */
function steamLaunch() {
  if (!isSteamLaunch(process.env)) return null;
  const f = steamFind();
  if (f.root === null) return { game: f.game, where: f.where, folder: null, account: false, accountId: null, dir: null };
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  // The Steam folder whose library holds the game is the one whose login file names the account.
  const account = accountId(f.root, process.env, read);
  return {
    game: 'ok',
    where: f.folder,
    folder: f.folder,
    account: account !== null,
    accountId: account,
    dir: account === null ? null : saveDir(f.folder, account),
  };
}

/**
 * Whether Steam is running: steam_osx on a Mac, steam on Linux. Only pgrep's "none found" (status 1) says it is not:
 * a pgrep that could not be run or failed says nothing, and Steam's files are not edited on nothing.
 */
function steamRunning() {
  const name = { darwin: 'steam_osx', linux: 'steam' }[process.platform];
  return name !== undefined && spawnSync('pgrep', ['-x', name]).status !== 1;
}

/** Asks Steam on a Mac to quit, then waits up to 40 s for it to go. It goes even when osascript says "User canceled". */
function quitSteam() {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', 'quit app "Steam"'], () => {
      const until = Date.now() + 40_000;
      const look = () => (!steamRunning() || Date.now() > until ? resolve() : setTimeout(look, 500));
      look();
    });
  });
}

// This build, for the Steam line: the Flatpak, the AppImage (its name has no version, so updates overwrite it and the line
// holds), the portable .exe.
const asFlatpak = process.env.FLATPAK_ID === steamSetup.FLATPAK_ID;
const appImage = process.env.APPIMAGE || null;
const launchLineHere = () =>
  steamSetup.launchLine({
    platform: process.platform,
    exe: process.execPath,
    appImage,
    flatpak: asFlatpak,
    portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
  });

/**
 * What names this copy in its launch line, as lineState looks for it: the Flatpak's id, the AppImage's file or the
 * installed exe.
 */
const launchLineName = () => (asFlatpak ? steamSetup.FLATPAK_ID : appImage || process.execPath);

/**
 * Whether the launch line Steam saved for Ultima V is this copy's, read back from localconfig.vdf (launchCheck.cjs) and
 * only ever read. Off a Steam launch Steam does not say which account is playing, so it is the one signed in most
 * recently (steam.cjs accountId); a launch uses its own. `lineOnAt` is when the option was turned on: until Steam has
 * written the file since then, an absent line is "not seen yet". Null where there is no line to check or no Steam.
 */
function steamLineState(options) {
  const expected = launchLineHere();
  if (!expected) return null;
  const root = steamFind().root ?? steamRootsHere().find((r) => existsSync(r));
  if (!root) return null;
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  const account = accountId(root, process.env, read);
  const file = account === null ? null : join(root, 'userdata', account, 'config', 'localconfig.vdf');
  let written = null;
  try {
    if (file !== null) written = fs.statSync(file).mtimeMs;
  } catch {}
  const recentlyTurnedOn = options.lineOnAt !== 0 && (written === null || written < options.lineOnAt);
  return {
    state: lineState(file === null ? null : read(file), expected, launchLineName(), recentlyTurnedOn),
    bothLinux: process.platform === 'linux' && options.playLine && options.compatTool,
  };
}

/** A Mac's Steam folder, the app, and what setup keeps in the app's data (steamSetup.cjs). */
const macWhere = () => ({
  fs,
  steamRoot: steamRoots({ platform: 'darwin', home: homedir(), env: process.env })[0],
  appExe: process.execPath,
  packaged: app.isPackaged,
  keptOriginal: join(app.getPath('userData'), 'steam-appinfo-3067520.bin'),
  noteFile: join(app.getPath('userData'), 'steam-setup.json'),
  steamRunning,
  quitSteam,
});

const SYSTEM = { darwin: 'mac', win32: 'windows' }[process.platform] ?? 'linux';
const STEAM_STILL_RUNNING = "Steam didn't quit. Quit it yourself, then try again.";

/**
 * Where this system stands with Steam, for the Steam line. On a Mac that was set up, asking also puts the edit back if
 * Steam has undone it and is closed; and a Mac says whether Steam is running, which setting up or removing would quit. Windows never edits Steam's files, so whether the line was pasted is not known.
 */
function steamStatus() {
  const line = launchLineHere();
  const roots = steamRootsHere().filter((r) => existsSync(r));
  if (roots.length === 0) return { system: SYSTEM, state: 'no-steam', line };
  if (SYSTEM === 'mac') {
    // The Settings line must always open: a cache that cannot be read or written is logged, and shown as not set up.
    try {
      const { state, steamRunning: running } = steamSetup.macStatus(macWhere());
      return { system: SYSTEM, state, line, steamRunning: running };
    } catch (e) {
      console.warn('steam status:', e);
      return { system: SYSTEM, state: 'not-set-up', line, steamRunning: steamRunning() };
    }
  }
  if (SYSTEM === 'linux') return { system: SYSTEM, state: steamSetup.hasCompatTool(fs, roots) ? 'ready' : 'not-set-up', line };
  return { system: SYSTEM, state: 'not-set-up', line };
}

// Whether this start had to put Ultima V's cache entry back (null: not looked at yet, or not a Mac), for the report.
let macReapplied = null;

/**
 * What the tester report is made from (steamReport.cjs): only what is found by reading. Where the engine took its game
 * files from is the page's to know, so the report says whether Steam's copy was found. The characters in Steam's
 * folder are the ids on its list (ultima5.characters), counted with the saves' contents left unsaid.
 */
function reportFacts(options, launch) {
  const f = steamFind();
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  };
  const root = f.root ?? steamRootsHere().find((r) => existsSync(r)) ?? null;
  const libraries = root === null ? [] : libraryPaths(root, read);
  const hasDataOvl = f.folder === null ? null : fs.readdirSync(f.folder).some((n) => n.toUpperCase() === 'DATA.OVL');
  const account = launch?.accountId ?? null;
  const cloud = account === null ? null : options.cloud[account] === true;
  let cloudCharacters = null;
  if (cloud && launch.dir) {
    try {
      const ids = JSON.parse(loadAll(launch.dir)['ultima5.characters'] ?? '').ids;
      cloudCharacters = Array.isArray(ids) ? ids.length : 0;
    } catch {
      cloudCharacters = 0;
    }
  }
  const build = asFlatpak
    ? 'Flatpak'
    : appImage
      ? 'AppImage'
      : process.env.PORTABLE_EXECUTABLE_DIR
        ? 'portable'
        : app.isPackaged
          ? 'installed'
          : 'development';
  const env = {};
  for (const name of ['SteamAppId', 'SteamGameId', 'STEAM_COMPAT_APP_ID', 'SteamUser', 'FLATPAK_ID']) env[name] = process.env[name];
  const line = steamLineState(options);
  return {
    version: app.getVersion(),
    system: SYSTEM,
    arch: process.arch,
    build,
    home: homedir(),
    bySteam: isSteamLaunch(process.env),
    env,
    steamRoot: root,
    libraries,
    game: f.game === 'ok' ? 'ok' : f.game === 'missing' ? 'missing' : 'none',
    where: f.where,
    hasDataOvl,
    options,
    cloud,
    accountKnown: account !== null,
    lineState: line?.state ?? null,
    macPatched: SYSTEM === 'mac' && root !== null ? steamSetup.macPatched(macWhere()) : null,
    macReapplied: SYSTEM === 'mac' ? macReapplied : null,
    cloudCharacters,
  };
}

/** Sets Steam up on this system, and says how it went. */
async function setUpSteam() {
  if (SYSTEM === 'windows') {
    return launchLineHere() === null
      ? 'The portable Ultima V has no fixed place for Steam to start it from. Play from Steam with the installed Ultima V.'
      : 'Nothing to install on Windows. Copy the launch line, then in Steam: Ultima V > Properties > Launch Options, ' +
          'and paste.';
  }
  if (SYSTEM === 'mac') {
    const result = await steamSetup.macSetup(macWhere());
    if (result === 'steam-running') return STEAM_STILL_RUNNING;
    if (result === 'not-owned') return "Steam doesn't list Ultima V on this Mac. Check this Steam account has it, then try again.";
    if (result === 'app-not-in-place') {
      return app.isPackaged
        ? 'Move Ultima V to Applications and open it from there, then set up Steam again.'
        : "A development run isn't set up as Steam's Ultima V. Use a built copy in Applications.";
    }
    return 'Done. Open Steam: it downloads Ultima V if it has not yet, and Play starts this engine.';
  }
  if (!asFlatpak && !appImage) return "Steam can't start this copy of Ultima V. Use the Flatpak or the AppImage.";
  const written = steamSetup.installCompatTool(fs, steamRootsHere(), { flatpak: asFlatpak, appImage });
  if (written.length === 0) return "Steam isn't here. Install Steam and start it once, then try again.";
  const flathub = written.some((dir) => dir.includes('com.valvesoftware.Steam'));
  return (
    'Done. Restart Steam, then in Ultima V > Properties > Compatibility, choose Ultima V SP. Steam downloads ' +
    'the game, and Play starts this engine.' +
    (flathub ? ` Steam from Flathub needs this run once too: ${steamSetup.OVERRIDE}` : '')
  );
}

/** Takes Steam's setup away on this system, and says how it went. */
async function removeSteamSetup() {
  if (SYSTEM === 'windows') {
    return 'In Steam: Ultima V > Properties > Launch Options, and clear the line. Nothing else was changed.';
  }
  if (SYSTEM === 'mac') {
    const result = await steamSetup.macRestore(macWhere());
    if (result === 'steam-running') return STEAM_STILL_RUNNING;
    if (result === 'kept-unusable') {
      return "The copy of Steam's own settings for Ultima V kept at setup is damaged, so they were left as they are.";
    }
    return 'Removed. Ultima V in Steam is as Steam had it.';
  }
  steamSetup.removeCompatTool(fs, steamRootsHere());
  fs.rmSync(stableLink, { force: true });
  return 'Removed. Restart Steam, and choose another compatibility tool for Ultima V, or none.';
}

/** Where the window was last as a window, and whether it was last full screen (windowState.cjs). */
const stateFile = () => join(app.getPath('userData'), 'window.json');
function saveBounds(win) {
  if (!win.isFullScreen() && !win.isMaximized()) writeState(stateFile(), win.getBounds());
}

function createWindow() {
  const saved = readState(stateFile());
  const win = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    // Full screen at the start only when wanted. `fullscreen: false` said outright would also take full screen away on
    // macOS altogether (the green button, Window > Enter Full Screen, F11), so it is left unsaid otherwise.
    fullscreenable: true,
    ...(startsFullScreen(process.argv, process.env, saved) ? { fullscreen: true } : {}),
    title: 'Ultima V',
    icon: join(__dirname, 'build', 'icons', '256x256.png'), // the window's (packaged: package.json build.files)
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(__dirname, 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.on('resize', () => saveBounds(win));
  win.on('move', () => saveBounds(win));
  // However full screen came or went (F11, the system's controls, the touch pad's button), it is remembered for the
  // next start and told to the page, whose button shows it.
  for (const [event, on] of [
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ])
    win.on(event, () => {
      writeState(stateFile(), { fullScreen: on });
      if (!win.webContents.isDestroyed()) win.webContents.send('full-screen-changed', on);
    });
  // F11 and Alt+Enter toggle full screen; nothing else is intercepted, so Escape and the letters reach the game.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Links out of the game (the installer's to GOG) open in the system browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // A page whose renderer died (a crash, the GPU driver, the system out of memory) leaves a black window that answers
  // nothing, which full screen under Game Mode has no way out of: load it again, back to the title and the last save.
  // A renderer that dies again straight away would reload forever, so after three reloads in a minute the window is
  // left as it is. A clean exit is the window closing, not a crash.
  const reloads = [];
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`renderer gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    const now = Date.now();
    while (reloads.length && now - reloads[0] > 60_000) reloads.shift();
    if (reloads.length >= 3) return;
    reloads.push(now);
    win.webContents.reload();
  });
  // A page busy for a while (a long load, a stall) comes back on its own more often than not; it is only noted.
  win.on('unresponsive', () => console.warn('window unresponsive'));
  win.on('responsive', () => console.warn('window responsive again'));
  // --dev on the command line is passed on to the page as ?dev, the one query flag the game takes from it.
  const dev = process.argv.includes('--dev');
  void win.loadURL(`${SCHEME}://${HOST}/index.html${dev ? '?dev' : ''}`);
  return win;
}

// One copy at a time (the ultima3 port's). A second launch (Steam starting the shortcut twice, or Play pressed again
// while the first copy was still coming up) brings the first window forward and quits, instead of opening a second
// game on the same save, where whichever copy saved last would silently overwrite the other. Under Flatpak the lock
// works across launches because the wrapper points TMPDIR, where Chromium keeps the lock's socket, at a directory the
// instances share.
//
// A copy of the other kind (through Steam, or not) plays different saves, so it is told so and quits instead. Every
// copy gives its mode with the lock request; the one the lock refuses reads the running copy's mode from instance.json
// (instanceMode.cjs), which the first copy wrote once it had the lock, and the first copy ignores a request of the
// other mode (the two starting at once).
const steamMode = isSteamLaunch(process.env);
const modeFile = join(app.getPath('userData'), 'instance.json');
const primary = app.requestSingleInstanceLock({ steam: steamMode });
const clash = primary ? null : clashMessage(modeFile, steamMode);
if (primary) noteMode(modeFile, steamMode);
else app.quit();
app.on('second-instance', (_event, _argv, _cwd, data) => {
  if (data?.steam !== steamMode) return;
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!primary) {
    // Quitting: see above. The refused copy of the other mode says why first.
    if (clash !== null) dialog.showMessageBoxSync({ type: 'info', title: 'Ultima V', message: clash });
    return;
  }
  // app://ultima5/<path> -> app/<path>, confined to that folder.
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '') path = '/index.html';
    const file = normalize(join(APP_DIR, path));
    // Optional files the game probes for (a set's Mask, a scene) are simply absent: a quiet 404.
    if (!file.startsWith(APP_DIR) || !existsSync(file)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Nothing in the game needs a permission prompt; deny them all rather than show a dialog.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'),
  );
  // The installer's Scan for game files... (preload.cjs): the copies scan.cjs finds, only the files the page names.
  // Only the game's own page (the app:// scheme) may ask; a frame from anywhere else is answered with no copies.
  ipcMain.handle('scan-game-files', (event, names) =>
    String(event.senderFrame?.url ?? '').startsWith('app://') && Array.isArray(names) && names.every((n) => typeof n === 'string')
      ? scanForGameFiles(names)
      : [],
  );
  // A Steam launch (preload.cjs u5native.steam), decided here once and answered only to the game's own page: whether
  // there is one, where the game's files are, and whether an account is known. The game's files are read from the folder
  // Steam gave, the files the page names; none where there is no folder.
  const launch = steamLaunch();
  ipcMain.on('steam-launch', (event) => {
    event.returnValue =
      launch && String(event.senderFrame?.url ?? '').startsWith('app://')
        ? { steam: true, game: launch.game, where: launch.where, account: launch.account }
        : { steam: false };
  });
  // What Steam has, launched by it or not (preload.cjs u5native.steam.find), and its files for the one-time take.
  ipcMain.on('steam-find', (event) => {
    const f = steamFind();
    event.returnValue = String(event.senderFrame?.url ?? '').startsWith('app://')
      ? { steam: f.steam, game: f.game, where: f.where }
      : { steam: false, game: 'none', where: '' };
  });
  ipcMain.handle('steam-game-files', (event, names) =>
    steamFind().folder &&
    String(event.senderFrame?.url ?? '').startsWith('app://') &&
    Array.isArray(names) &&
    names.every((n) => typeof n === 'string')
      ? { where: steamFind().folder, files: readCopy(steamFind().folder, names) }
      : null,
  );
  // The saves of a Steam launch (preload.cjs u5native.steam.saves, web/src/game/keyStore.ts), asked for synchronously so
  // that a write the disk refuses fails the save at once. Answered only to the game's own page, and only with a folder to
  // keep them in (otherwise all gives null, and the others say false).
  const saveDir = launch?.dir ?? null;
  const savesFor = (event) => (String(event.senderFrame?.url ?? '').startsWith('app://') ? saveDir : null);
  ipcMain.on('steam-saves-all', (event) => {
    const dir = savesFor(event);
    event.returnValue = dir === null ? null : loadAll(dir);
  });
  ipcMain.on('steam-saves-set', (event, key, value) => {
    const dir = savesFor(event);
    // True, or why the write was refused (steamSaves.cjs): the page lets earlier saves go only for a full disk.
    event.returnValue = dir !== null && typeof key === 'string' && typeof value === 'string' && writeKey(dir, key, value);
  });
  ipcMain.on('steam-saves-remove', (event, key) => {
    const dir = savesFor(event);
    event.returnValue = dir !== null && typeof key === 'string' && removeKey(dir, key);
  });
  // The Steam options (preload.cjs u5native.steam.options / setOption), kept per machine. The page is told them with
  // this launch's account (null off Steam or with none known), as Cloud saves is per account. Here a switch only records
  // its value; Cloud saves can be switched only in a Steam launch that knows its account.
  const optionsFile = join(app.getPath('userData'), 'steam-options.json');
  ipcMain.on('steam-options', (event) => {
    event.returnValue = String(event.senderFrame?.url ?? '').startsWith('app://')
      ? { ...readOptions(optionsFile), account: launch?.accountId ?? null }
      : { ...readOptions(null), account: null };
  });
  ipcMain.handle('steam-set-option', (event, name, on) => {
    if (!String(event.senderFrame?.url ?? '').startsWith('app://') || typeof on !== 'boolean') return false;
    const o = readOptions(optionsFile);
    if (name === 'cloud') {
      if (!launch?.accountId) return false;
      if (on) o.cloud[launch.accountId] = true;
      else delete o.cloud[launch.accountId];
    } else if (name === 'playLine' || name === 'compatTool' || name === 'macPlay') o[name] = on;
    else return false;
    writeOptions(optionsFile, o);
    return true;
  });
  // The touch pad's full-screen button (preload.cjs): whether the window is full screen, set first if `on` is given.
  // Only the game's own page may ask.
  ipcMain.handle('full-screen', (event, on) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !String(event.senderFrame?.url ?? '').startsWith('app://')) return false;
    if (typeof on === 'boolean' && on !== win.isFullScreen()) win.setFullScreen(on);
    return win.isFullScreen();
  });
  // A newer version (updates.cjs), for the game to say in its own way (preload.cjs u5native.updates): the offer, taking
  // it up, the player told of it. Only the game's own page may ask.
  const fromGame = (event) => String(event.senderFrame?.url ?? '').startsWith('app://');
  const updatesFile = join(app.getPath('userData'), 'updates.json');
  ipcMain.handle('update-offer', (event) => (fromGame(event) ? currentOffer() : null));
  ipcMain.handle('update-apply', (event) => fromGame(event) && applyUpdate({ electron, steam: steamMode }));
  ipcMain.handle('update-told', (event) => void (fromGame(event) && toldOfUpdate({ file: updatesFile })));
  // The first start of a newer version, for the title to say once, and that release's notes for its What's new.
  lookForNews({ app, file: updatesFile });
  ipcMain.handle('update-news', (event) => (fromGame(event) ? currentNews() : null));
  ipcMain.handle('update-news-seen', (event) => void (fromGame(event) && newsSeen()));
  ipcMain.handle('update-notes', (event, version) =>
    fromGame(event) && typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? releaseNotes({ net, version }) : null,
  );
  // The Steam line in Settings (steamSetup.cjs): where this system stands, setting up, removing, and the launch line to
  // copy. Only the game's own page may ask. Setting up or removing gives the message to show, whatever went wrong.
  const failed = (e) => `That didn't work: ${e instanceof Error ? e.message : String(e)}`;
  ipcMain.handle('steam-status', (event) => (fromGame(event) ? steamStatus() : null));
  ipcMain.handle('steam-setup', (event) => (fromGame(event) ? setUpSteam().catch(failed) : null));
  ipcMain.handle('steam-remove', (event) => (fromGame(event) ? removeSteamSetup().catch(failed) : null));
  ipcMain.handle('steam-launch-line', (event) => {
    if (!fromGame(event)) return null;
    return launchLineHere();
  });
  // Whether the launch line Steam saved is this copy's (steamLineState above), for the Steam line in Settings.
  ipcMain.handle('steam-line-state', (event) => (fromGame(event) ? steamLineState(readOptions(optionsFile)) : null));
  // The tester report for Copy report (steamReport.cjs): plain text, no save or file contents.
  ipcMain.handle('steam-report', (event) => (fromGame(event) ? steamReport(reportFacts(readOptions(optionsFile), launch)) : null));
  const win = createWindow();
  onOffer((o) => {
    if (!win.isDestroyed()) win.webContents.send('update-offer-changed', o);
  });
  // Quitting while the Flatpak's update is coming down (updates.cjs updating): the portal would give it up with the
  // game, so the window stays, saying so (preload.cjs), until it is done - a minute at most - and then the game goes.
  let leaving = false;
  const holdForUpdate = (event) => {
    const pending = updating();
    if (leaving || !pending) return;
    event.preventDefault();
    leaving = true;
    if (!win.isDestroyed()) win.webContents.send('update-finishing');
    void Promise.race([pending, new Promise((r) => setTimeout(r, UPDATE_HOLD_MS))]).then(() => app.quit());
  };
  win.on('close', holdForUpdate);
  app.on('before-quit', holdForUpdate);
  // The Flatpak's update monitor let go as the game goes (the portal's own tidying, said rather than left to it): a
  // moment at most, and nothing more if it is not answered.
  let closed = false;
  app.on('will-quit', (event) => {
    if (closed) return;
    closed = true;
    event.preventDefault();
    void Promise.race([closeUpdates(), new Promise((r) => setTimeout(r, 500))]).then(() => app.quit());
  });
  // Launched from a non-Steam shortcut, the first time: Steam's library artwork put in place (steamArt.cjs), a moment
  // after the window is up, apart from everything else. It never throws, and what it did is only logged.
  setTimeout(() => {
    installSteamArt({
      env: process.env,
      home: homedir(), // $HOME (the Flatpak's is the player's own home)
      platform: process.platform,
      artDir: join(__dirname, 'build', 'steam'),
      noteFile: join(app.getPath('userData'), 'steam-art.json'),
    })
      .then((r) => r.result !== 'not from a shortcut' && console.log('steam artwork:', JSON.stringify(r)))
      .catch(() => {});
    // Steam set up from here: a Mac's cache entry given our launch again if Steam has replaced it (or said to wait for
    // Steam to close, which the Steam line shows).
    try {
      if (SYSTEM === 'mac') {
        const before = steamSetup.macPatched(macWhere());
        const state = steamSetup.macReapply(macWhere());
        macReapplied = before === false && state === 'ready';
        if (state !== 'not-set-up' && state !== 'ready') console.log('steam setup:', state);
      }
    } catch (e) {
      console.warn('steam setup not re-applied:', e);
    }
  }, 3000);
  // Newer releases looked for at once (updates.cjs), the game playing on while one comes down; no page offered under
  // Game Mode. Never in a smoke test.
  if (!process.env.ULTIMA5_SMOKE) {
    void checkForUpdates({
      electron,
      quiet: inGamescope,
      file: updatesFile,
      steam: steamMode,
    });
  }
  // A smoke test (smoke.cjs): screenshot once the game is up, then quit. Looked for every half second, from six seconds
  // after the page loads, for up to thirty: a slow runner (Windows CI's, once) was not up at a single look at six.
  const shot = process.env.ULTIMA5_SMOKE;
  if (shot) {
    win.webContents.on('did-finish-load', () => {
      const until = Date.now() + 30_000;
      const look = async () => {
        try {
          const ok = await win.webContents.executeJavaScript("!!(window.u5 || document.getElementById('installer'))");
          if (!ok && Date.now() < until) {
            setTimeout(() => void look(), 500);
            return;
          }
          const image = await win.webContents.capturePage();
          writeFileSync(shot, image.toPNG());
          console.log(`smoke: ${ok ? 'running' : 'NOT running'}, screenshot ${shot}`);
          app.exit(ok ? 0 : 1);
        } catch (e) {
          console.error('smoke failed', e);
          app.exit(1);
        }
      };
      setTimeout(() => void look(), 6000);
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
