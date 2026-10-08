// The desktop app: one window showing the built game from app/, served over a
// private app:// scheme so it behaves as a secure origin (storage, gamepads,
// clipboard) without a web server. No menu bar, so every key reaches the
// game; F11 or Alt+Enter toggles full screen, and the window starts full
// screen when asked (--fullscreen) or when Steam launched it (the SteamDeck
// or SteamOS environment variables, set in Game Mode). Under gamescope,
// Steam's Game Mode compositor, GPU acceleration and the Chromium sandbox
// are turned off: see below. Only one copy runs; a second launch brings the
// first window forward. --dev turns on the development build's cheats (shown
// in red under Cheats) in a release build, for testing it (web/src/devMode.ts).
// The page is sandboxed, and the installer's scan for the game's files is the
// one thing it may ask of the disk (preload.cjs, scan.cjs). Launched from a
// non-Steam shortcut, the app puts Steam's library artwork in place, once
// (steamArt.cjs).
const { app, BrowserWindow, protocol, net, shell, session, ipcMain } = require('electron');
const { join, normalize } = require('node:path');
const { pathToFileURL } = require('node:url');
const { homedir } = require('node:os');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { scanForGameFiles } = require('./scan.cjs');
const { installSteamArt } = require('./steamArt.cjs');

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

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/** Where the window was last, so it comes back the same size. */
const boundsFile = () => join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    return JSON.parse(readFileSync(boundsFile(), 'utf8'));
  } catch {
    return null;
  }
}
function saveBounds(win) {
  try {
    if (!win.isFullScreen() && !win.isMaximized()) writeFileSync(boundsFile(), JSON.stringify(win.getBounds()));
  } catch {
    /* not fatal */
  }
}

function wantsFullScreen() {
  if (process.argv.includes('--windowed')) return false;
  if (process.argv.includes('--fullscreen')) return true;
  return process.env.SteamDeck === '1' || process.env.SteamOS === '1';
}

function createWindow() {
  const saved = loadBounds();
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
    ...(wantsFullScreen() ? { fullscreen: true } : {}),
    title: 'Ultima V',
    icon: join(__dirname, 'build', 'icons', '256x256.png'), // the window's (packaged: package.json build.files)
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: join(__dirname, 'preload.cjs') },
  });
  win.setMenuBarVisibility(false);
  win.removeMenu();
  win.on('resize', () => saveBounds(win));
  win.on('move', () => saveBounds(win));
  // F11 and Alt+Enter toggle full screen; nothing else is intercepted, so Escape and the letters reach the game.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // Links out of the game (there are none today) open in the system browser, never in the app.
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
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  if (!primary) return; // quitting: see above
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
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write'));
  // The installer's Scan for game files... (preload.cjs): the copies scan.cjs finds, only the files the page names.
  // Only the game's own page (the app:// scheme) may ask; a frame from anywhere else is answered with no copies.
  ipcMain.handle('scan-game-files', (event, names) =>
    String(event.senderFrame?.url ?? '').startsWith('app://') && Array.isArray(names) && names.every((n) => typeof n === 'string')
      ? scanForGameFiles(names)
      : []);
  const win = createWindow();
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
  }, 3000);
  // A smoke test (smoke.cjs): screenshot after the game has drawn, then quit.
  const shot = process.env.ULTIMA5_SMOKE;
  if (shot) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const ok = await win.webContents.executeJavaScript("!!(window.u5 || document.getElementById('installer'))");
          const image = await win.webContents.capturePage();
          writeFileSync(shot, image.toPNG());
          console.log(`smoke: ${ok ? 'running' : 'NOT running'}, screenshot ${shot}`);
          app.exit(ok ? 0 : 1);
        } catch (e) {
          console.error('smoke failed', e);
          app.exit(1);
        }
      }, 6000);
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
