// The Flatpak's own updates (updates.cjs), through Flatpak's update portal - org.freedesktop.portal.Flatpak, which
// every Flatpak may talk to without a permission of its own. Discover updates a Flatpak only in Desktop Mode, so on a
// Steam Deck played in Game Mode a release would otherwise wait for the player's trip to the desktop. The portal lets
// the app ask, from inside its sandbox, for its own newer commit to be pulled from the remote it was installed from
// (here the site's signed repository, flatpak-repo.sh) and deployed beside the running one, verified as flatpak
// verifies any update; the copy playing keeps running, and the next start is the new version.
//
//   1. CreateUpdateMonitor: an UpdateMonitor object for this app, whose UpdateAvailable signal the portal sends when
//      it notices a newer commit on the remote (it looks from time to time on its own).
//   2. Update on that monitor, when the portal says there is one - or at once, when GitHub's newest release is newer
//      than this copy (the portal's own look may be minutes away). Its Progress signal says how it goes: running (0),
//      nothing to do (1: the repository not yet holding the release, the Pages deploy a few minutes behind it; the
//      portal's signal comes when it does), done (2), failed (3).
//   3. Done: the game is told the update is installed, and a restart plays it - Spawn with FLATPAK_SPAWN_FLAGS_LATEST_
//      VERSION starts the newest deployed version in a sandbox of its own, and this one quits. Under Steam's Game Mode
//      the restart is only a quit: a game started outside Steam is not shown there, so the player starts it again from
//      the library.
//
// Where the portal cannot be had - an old flatpak (no UpdateMonitor before the portal's version 4), no session bus -
// or the update fails, connect() or watch() says so and updates.cjs falls back to telling the player of the release.
// The signals come only to the connection that made the monitor, so the D-Bus talk is in process (@particle/dbus-next),
// not through gdbus.

const PORTAL = 'org.freedesktop.portal.Flatpak';
const PORTAL_PATH = '/org/freedesktop/portal/Flatpak';
const MONITOR = 'org.freedesktop.portal.Flatpak.UpdateMonitor';
/** The portal version that has UpdateMonitor. */
const MONITOR_VERSION = 4;
/** Spawn's flag for the newest deployed version of the app (flatpak-portal.h). */
const SPAWN_LATEST_VERSION = 2;
/** The command the Flatpak runs the app by (electron-builder's flatpak target: /app/bin/electron-wrapper). */
const COMMAND = 'electron-wrapper';
/** Progress's status. */
const STATUS = { running: 0, empty: 1, done: 2, error: 3 };

/** A string as D-Bus's `ay` takes a path or an argument: its bytes, NUL-ended. */
const bytes = (s) => Buffer.from(`${s}\0`);

/**
 * The portal, through the session bus: { createMonitor, spawnLatest }, or null where it cannot be had (no bus, no
 * portal, one too old for update monitors). `dbus` is @particle/dbus-next (tests give their own).
 */
async function connect({ dbus = require('@particle/dbus-next') } = {}) {
  let bus;
  try {
    bus = dbus.sessionBus();
    const obj = await bus.getProxyObject(PORTAL, PORTAL_PATH);
    const portal = obj.getInterface(PORTAL);
    const version = Number((await obj.getInterface('org.freedesktop.DBus.Properties').Get(PORTAL, 'version')).value);
    if (!(version >= MONITOR_VERSION)) throw new Error(`the portal is version ${version}, without update monitors`);
    return {
      /** A monitor: { onAvailable(fn), onProgress(fn), update() }. */
      async createMonitor() {
        const handle = await portal.CreateUpdateMonitor({});
        const monitor = (await bus.getProxyObject(PORTAL, handle)).getInterface(MONITOR);
        return {
          onAvailable: (fn) => monitor.on('UpdateAvailable', () => fn()),
          onProgress: (fn) => monitor.on('Progress', (info) => fn(plain(info))),
          update: () => monitor.Update('', {}),
        };
      },
      /** The newest deployed version started, in its own sandbox. */
      spawnLatest: () => portal.Spawn(bytes('/'), [bytes(COMMAND)], {}, {}, SPAWN_LATEST_VERSION, {}),
    };
  } catch (e) {
    console.warn('flatpak update portal:', e?.message ?? e);
    bus?.disconnect();
    return null;
  }
}

/** An a{sv} as plain values: { status: 2, error_message: '...' }. */
function plain(info) {
  const out = {};
  for (const [k, v] of Object.entries(info ?? {})) out[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return out;
}

/**
 * Keep this copy up to date through `portal` (connect's): an update asked for when the portal sees one, or at once
 * when `newer` (GitHub's newest release is newer than this copy); `installed()` when one is deployed, `failed(why)`
 * when one fails, and `busy(true|false)` as one starts and ends (updates.cjs holds the game's quitting for it). One at
 * a time; nothing more once installed.
 */
async function watch({ portal, newer, installed, failed, busy: told = () => {} }) {
  const monitor = await portal.createMonitor();
  let busy = false;
  let done = false;
  const setBusy = (b) => {
    if (b === busy) return;
    busy = b;
    told(b);
  };
  const update = () => {
    if (busy || done) return;
    setBusy(true);
    monitor.update().catch((e) => {
      setBusy(false);
      failed(e?.message ?? String(e));
    });
  };
  monitor.onProgress((p) => {
    if (p.status === STATUS.running) return;
    setBusy(false);
    if (p.status === STATUS.done) {
      done = true;
      installed();
    } else if (p.status === STATUS.error) failed(p.error_message || p.error || 'the update failed');
    // Nothing to do (STATUS.empty): the repository not yet holding it; the portal's signal will come when it does.
  });
  monitor.onAvailable(update);
  if (newer) update();
  return monitor;
}

module.exports = { connect, watch, STATUS };
