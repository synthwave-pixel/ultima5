// Updates from the GitHub releases (main.cjs), a few seconds after the window is up, each way as this copy allows:
//   'auto'   - Windows installed by its installer, and the AppImage: electron-updater fetches a newer release in the
//              background (the latest*.yml the release carries) and installs it when the game quits, or at once if
//              the player restarts into it.
//   'notice' - macOS and the Windows portable .exe, which electron-updater cannot replace (macOS installs an update
//              only into an app signed by an Apple developer; this one is not): the player is told a newer release
//              is out and offered its page, to read what changed and download from. Signing the Mac app would make it
//              'auto' (issue #1).
//   'none'   - the Flatpak, which flatpak updates; the app run unpackaged (development); or --no-update-check.
// What there is is told to the page (preload.cjs u5native.updates; web/src/ui/updates.ts), which says so in the
// game's own way - a line in the title menu, and once a version a box over the title - and asks for the restart or
// the page from here. Under Steam's Game Mode no page is offered (a browser there leaves the game behind); a build
// downloaded is still installed when the game quits. A failure to look (offline, GitHub down) is only logged.
const { readFileSync, writeFileSync } = require('node:fs');

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
 * What there is to update to, for the page (web/src/ui/updates.ts UpdateOffer): a build come down ('restart'), or a
 * release out ('release'); its version and this copy's; and whether the player has been told of it.
 */
let offer = null;
const listeners = new Set();

/** The offer now, or null. */
const currentOffer = () => offer;

/** Told each time the offer changes. */
function onOffer(listener) {
  listeners.add(listener);
}

function publish(next) {
  offer = next;
  for (const l of listeners) l(offer);
}

/**
 * Look for an update, as this copy allows (updateKind). `electron` is the main process's (app, net); `quiet` true
 * under Game Mode, where no page is offered. `file`, where the version last told of is kept (updates.json).
 */
async function checkForUpdates({ electron, quiet, file }) {
  const { app, net } = electron;
  const kind = updateKind({ packaged: app.isPackaged, platform: process.platform, env: process.env, argv: process.argv });
  if (kind === 'none') return;
  if (kind === 'auto') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.warn('update:', e?.message ?? e));
    autoUpdater.on('update-downloaded', (info) => {
      console.log(`update: ${info.version} downloaded, installed on quitting`);
      publish({ kind: 'restart', version: String(info.version), current: app.getVersion(), told: false });
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
    const current = app.getVersion();
    if (!latest || !isNewer(latest, current)) return;
    publish({ kind: 'release', version: latest, current, told: !shouldNotice(latest, current, noticed(file)) });
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
}

/** Take up the offer: the restart into the build come down, or the release's page in the player's browser. */
function applyUpdate({ electron }) {
  if (!offer) return false;
  if (offer.kind === 'restart') require('electron-updater').autoUpdater.quitAndInstall();
  else void electron.shell.openExternal(RELEASES);
  return true;
}

/** The player has been told of the offer (its box shown): not again for this version, a release's kept in `file`. */
function toldOfUpdate({ file }) {
  if (!offer) return;
  if (offer.kind === 'release') {
    try {
      writeFileSync(file, JSON.stringify({ noticed: offer.version }));
    } catch (e) {
      console.warn('update:', e?.message ?? e);
    }
  }
  publish({ ...offer, told: true });
}

module.exports = { updateKind, isNewer, shouldNotice, checkForUpdates, applyUpdate, toldOfUpdate, currentOffer, onOffer, RELEASES };
