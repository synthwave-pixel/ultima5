// Updates from the GitHub releases (main.cjs), a few seconds after the window is up, each way as this copy allows:
//   'auto'   - Windows installed by its installer, and the AppImage: electron-updater fetches a newer release in the
//              background (the latest*.yml the release carries) and installs it when the game quits, or at once if
//              the player says so.
//   'notice' - macOS and the Windows portable .exe, which electron-updater cannot replace (macOS installs an update
//              only into an app signed by an Apple developer; this one is not): the player is told a newer release
//              is out, once for each, and offered its page. Signing the Mac app would make it 'auto' (issue #1).
//   'none'   - the Flatpak, which flatpak updates; the app run unpackaged (development); or --no-update-check.
// Under Steam's Game Mode nothing is asked: an update downloaded is installed when the game quits, and a notice
// waits for the desktop. A failure to look (offline, GitHub down) is only logged.
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const OWNER = 'synthwave-pixel';
const REPO = 'ultima5';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

/** How this copy is updated: 'auto', 'notice' or 'none' (see above). */
function updateKind({ packaged, platform, env, argv }) {
  if (!packaged || argv.includes('--no-update-check')) return 'none';
  if (env.FLATPAK_ID || env.container === 'flatpak') return 'none';
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_DIR ? 'notice' : 'auto';
  if (platform === 'linux') return env.APPIMAGE ? 'auto' : 'notice';
  return 'notice';
}

/** A version's numbers (1.1.12, v1.1.12): major, minor, patch; a pre-release (1.1.0-dev.x) ranks below its release. */
function parts(version) {
  const [core, pre] = String(version).replace(/^v/, '').split('-', 2);
  const [a = 0, b = 0, c = 0] = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [a, b, c, pre ? 0 : 1];
}

/** Whether `latest` is newer than `current`. */
function isNewer(latest, current) {
  const [l, c] = [parts(latest), parts(current)];
  for (let i = 0; i < l.length; i++) if (l[i] !== c[i]) return l[i] > c[i];
  return false;
}

/** The version last noticed (updates.json), so each newer release is told of once. */
function noticed(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).noticed ?? null;
  } catch {
    return null;
  }
}

/** Whether to tell the player of `latest`: newer than this copy, and not told of already. */
function shouldNotice(latest, current, told) {
  return isNewer(latest, current) && (told === null || isNewer(latest, told));
}

/**
 * Look for an update, as this copy allows (updateKind). `electron` is the main process's (app, dialog, shell, net);
 * `win` the game's window; `quiet` true under Game Mode, where nothing is asked.
 */
async function checkForUpdates({ electron, win, quiet }) {
  const { app, dialog, shell, net } = electron;
  const kind = updateKind({ packaged: app.isPackaged, platform: process.platform, env: process.env, argv: process.argv });
  if (kind === 'none') return;
  if (kind === 'auto') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.warn('update:', e?.message ?? e));
    autoUpdater.on('update-downloaded', async (info) => {
      console.log(`update: ${info.version} downloaded, installed on quitting`);
      if (quiet || win.isDestroyed()) return;
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        message: `Ultima V ${info.version} is ready`,
        detail:
          'It will be installed when you quit the game. Restart now to play it at once: anything since the game last ' +
          'saved (at a door, or Save in the Pause menu) is lost, as when closing the window.',
        buttons: ['Later', 'Restart now'],
        defaultId: 0,
        cancelId: 0,
      });
      if (response === 1) autoUpdater.quitAndInstall();
    });
    await autoUpdater.checkForUpdates().catch((e) => console.warn('update:', e?.message ?? e));
    return;
  }
  // A notice: the newest release, from GitHub's API.
  if (quiet) return;
  try {
    const res = await net.fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const latest = String((await res.json()).tag_name ?? '').replace(/^v/, '');
    const file = join(app.getPath('userData'), 'updates.json');
    if (!latest || !shouldNotice(latest, app.getVersion(), noticed(file)) || win.isDestroyed()) return;
    writeFileSync(file, JSON.stringify({ noticed: latest }));
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      message: `Ultima V ${latest} is out`,
      detail: `This is ${app.getVersion()}. The new version is on the game's releases page; your saved game carries over.`,
      buttons: ['Later', 'Open the releases page'],
      defaultId: 1,
      cancelId: 0,
    });
    if (response === 1) void shell.openExternal(RELEASES);
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
}

module.exports = { updateKind, isNewer, shouldNotice, checkForUpdates, RELEASES };
