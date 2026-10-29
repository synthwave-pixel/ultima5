// Updates from the GitHub releases (main.cjs), a few seconds after the window is up, each way as this copy allows:
//   'auto'   - Windows installed by its installer, and the AppImage: electron-updater fetches a newer release in the
//              background (the latest*.yml the release carries) and installs it when the game quits, or at once if
//              the player restarts into it.
//   'notice' - macOS and the Windows portable .exe, which electron-updater cannot replace (macOS installs an update
//              only into an app signed by an Apple developer; this one is not): the player is told a newer release
//              is out and offered its page, to read what changed and download from. Signing the Mac app would make it
//              'auto' (issue #1).
//   'flatpak' - the Flatpak: through Flatpak's update portal (flatpakUpdates.cjs), the newer release pulled from the
//              site's repository and deployed, a restart playing it - so a Steam Deck in Game Mode is kept up to date
//              without Discover, which runs only in Desktop Mode. Where the portal cannot be had or the update fails,
//              a notice instead: under Game Mode with no page offered, only the way to update (Discover).
//   'none'   - the app run unpackaged (development); or --no-update-check.
// What there is is told to the page (preload.cjs u5native.updates; web/src/ui/updates.ts), which says so in the
// game's own way - a line in the title menu, and once a version a box over the title - and asks for the restart or
// the page from here. Under Steam's Game Mode no page is offered (a browser there leaves the game behind); a build
// downloaded is still installed when the game quits. A failure to look (offline, GitHub down) is only logged.
const { readFileSync, writeFileSync } = require('node:fs');
const flatpakUpdates = require('./flatpakUpdates.cjs');

const OWNER = 'synthwave-pixel';
const REPO = 'ultima5';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;

/** How this copy is updated: 'auto', 'notice', 'flatpak' or 'none' (see above). */
function updateKind({ packaged, platform, env, argv }) {
  if (!packaged || argv.includes('--no-update-check')) return 'none';
  if (env.FLATPAK_ID || env.container === 'flatpak') return 'flatpak';
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
  return kept(file).noticed ?? null;
}

/** What updates.json keeps: the version last told of (noticed), the version that ran last (lastRun). */
function kept(file) {
  try {
    const d = JSON.parse(readFileSync(file, 'utf8'));
    return typeof d === 'object' && d !== null ? d : {};
  } catch {
    return {};
  }
}

/** `patch` kept in updates.json beside what it keeps already. */
function keep(file, patch) {
  try {
    writeFileSync(file, JSON.stringify({ ...kept(file), ...patch }));
  } catch (e) {
    console.warn('update:', e?.message ?? e);
  }
}

/** Whether to tell the player of `latest`: newer than this copy, and not told of already. */
function shouldNotice(latest, current, told) {
  return isNewer(latest, current) && (told === null || isNewer(latest, told));
}

/**
 * What there is to update to, for the page (web/src/ui/updates.ts UpdateOffer): a build come down ('restart'), or a
 * release out ('release'); its version and this copy's; and whether the player has been told of it. The Flatpak's
 * restart is `installed` already (and, under Game Mode, only `quits`); a release with no `page` offered is told of only.
 */
let offer = null;
/** The Flatpak's restart: its newest version started (flatpakUpdates.cjs spawnLatest); null, a quit alone. */
let relaunch = null;
/**
 * A Flatpak update under way, settling when it ends; null when none is. The portal gives up an update when the game
 * that asked for it goes, so a quit waits for it (main.cjs), a while at most.
 */
let pending = null;
let settle = null;
const updating = () => pending;
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

/** GitHub's newest release's version (1.1.12). */
async function latestRelease(net) {
  const res = await net.fetch(LATEST_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return String((await res.json()).tag_name ?? '').replace(/^v/, '');
}

/**
 * Look for an update, as this copy allows (updateKind). `electron` is the main process's (app, net); `quiet` true
 * under Game Mode, where no page is offered. `file`, where the version last told of is kept (updates.json).
 * `flatpak`, the portal's (flatpakUpdates.cjs; the tests give their own).
 */
async function checkForUpdates({ electron, quiet, file, flatpak = flatpakUpdates }) {
  const { app, net } = electron;
  const kind = updateKind({
    packaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
    argv: process.argv,
  });
  if (kind === 'none') return;
  if (kind === 'flatpak') return flatpakUpdate({ app, net, quiet, file, flatpak });
  if (kind === 'auto') {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (e) => console.warn('update:', e?.message ?? e));
    autoUpdater.on('update-downloaded', (info) => {
      console.log(`update: ${info.version} downloaded, installed on quitting`);
      publish({
        kind: 'restart',
        version: String(info.version),
        current: app.getVersion(),
        told: false,
      });
    });
    await autoUpdater.checkForUpdates().catch((e) => console.warn('update:', e?.message ?? e));
    return;
  }
  // A notice: the newest release, from GitHub's API.
  if (quiet) return;
  try {
    const latest = await latestRelease(net);
    const current = app.getVersion();
    if (!latest || !isNewer(latest, current)) return;
    notice(latest, current, file, true);
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
}

/** A newer release told of: its page offered, or (`page` false) only the way to it said. */
function notice(latest, current, file, page) {
  publish({
    kind: 'release',
    version: latest,
    current,
    told: !shouldNotice(latest, current, noticed(file)),
    ...(page ? {} : { page }),
  });
}

/**
 * The Flatpak's update (flatpakUpdates.cjs): the portal asked to keep this copy up to date - at once where GitHub has
 * a newer release - and the game told when it is installed; where the portal cannot be had or the update fails, the
 * release told of instead (under Game Mode, without its page).
 */
async function flatpakUpdate({ app, net, quiet, file, flatpak }) {
  const current = app.getVersion();
  let latest = null;
  try {
    latest = await latestRelease(net);
  } catch (e) {
    console.warn('update check:', e?.message ?? e);
  }
  const newer = !!latest && isNewer(latest, current);
  const fallback = () => newer && notice(latest, current, file, !quiet);
  const portal = await flatpak.connect();
  if (!portal) return void fallback();
  relaunch = quiet ? null : portal.spawnLatest;
  try {
    await flatpak.watch({
      portal,
      newer,
      installed: () => {
        console.log(`update: ${newer ? latest : 'a newer version'} installed by the flatpak portal`);
        publish({
          kind: 'restart',
          installed: true,
          quits: quiet,
          ...(newer ? { version: latest } : {}),
          current,
          told: false,
        });
      },
      failed: (why) => {
        console.warn('flatpak update:', why);
        fallback();
      },
      busy: (b) => {
        if (b) pending = new Promise((r) => (settle = r));
        else {
          settle?.();
          pending = settle = null;
        }
      },
    });
  } catch (e) {
    console.warn('flatpak update:', e?.message ?? e);
    fallback();
  }
}

/**
 * Take up the offer: the restart into the build come down (the Flatpak's: its newest version started, and this one
 * quits - or, under Game Mode, only the quit), or the release's page in the player's browser.
 */
function applyUpdate({ electron }) {
  if (!offer) return false;
  if (offer.kind === 'restart' && offer.installed) {
    const quit = () => electron.app.quit();
    if (relaunch)
      void relaunch().then(quit, (e) => {
        console.warn('update: the new version would not start:', e?.message ?? e);
        quit();
      });
    else quit();
  } else if (offer.kind === 'restart') require('electron-updater').autoUpdater.quitAndInstall();
  else if (offer.page !== false) void electron.shell.openExternal(RELEASES);
  else return false;
  return true;
}

/** The player has been told of the offer (its box shown): not again for this version, a release's kept in `file`. */
function toldOfUpdate({ file }) {
  if (!offer) return;
  if (offer.kind === 'release') keep(file, { noticed: offer.version });
  publish({ ...offer, told: true });
}

// --- What is new: the first start after an update ---------------------------------------------------------------

/** This copy's version, where it is newer than the one that ran last (kept in updates.json): { version, from }. */
let news = null;

/**
 * Whether this is the first start of a newer version (an update taken up, by whatever way it came): noted as `news`
 * for the title to say once, and the version kept as the last run. Not in a copy run unpackaged.
 */
function lookForNews({ app, file }) {
  if (!app.isPackaged) return null;
  const current = app.getVersion();
  const last = kept(file).lastRun;
  keep(file, { lastRun: current });
  news = typeof last === 'string' && isNewer(current, last) ? { version: current, from: last } : null;
  return news;
}

const currentNews = () => news;
/** The player has been told (the title's box shown): not again. */
const newsSeen = () => void (news = null);

/**
 * A release's notes as plain lines for the game's own text pages (web's showText): GitHub's Markdown - headings,
 * bold, links, bullets - let go of its marks; the compare link left off. Paragraphs apart by a blank line.
 */
function plainNotes(markdown) {
  const out = [];
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    if (/^\s*\*\*Full Changelog\*\*/.test(raw)) continue;
    const line = raw
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trimEnd();
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** The notes of release `version`, from GitHub, as plain text; null where they cannot be had (offline). */
async function releaseNotes({ net, version }) {
  try {
    const res = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/v${version}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return plainNotes((await res.json()).body);
  } catch (e) {
    console.warn('release notes:', e?.message ?? e);
    return null;
  }
}

module.exports = {
  updating,
  lookForNews,
  currentNews,
  newsSeen,
  plainNotes,
  releaseNotes,
  updateKind,
  isNewer,
  shouldNotice,
  checkForUpdates,
  applyUpdate,
  toldOfUpdate,
  currentOffer,
  onOffer,
  RELEASES,
};
