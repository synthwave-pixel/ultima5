/**
 * updates.ts
 *
 * A newer version of the game, as the page learns of it, for the title (intro.ts): its menu's line, and once for
 * each version a box of its own saying what it is. Where it comes from depends on where the game runs:
 *   - the web: the service worker has fetched the new build, which a restart takes up ('restart', the version unsaid);
 *   - the desktop app: its main process (desktop/updates.cjs) - a build electron-updater has downloaded, installed by
 *     a restart ('restart'), or, where it cannot replace the copy (macOS, the portable .exe), a newer release out
 *     ('release'), whose page is opened for the player to read and download from;
 *   - the Android app: a newer release on GitHub than the APK's own version ('release'), its page opened in the
 *     system's browser (the GameFolder plugin's openUrl).
 * The releases page, never the file itself: what changed is read there first, and the download is the player's.
 */

/** What there is to update to. `told`: the player has been shown its box already (shown once a version). */
export interface UpdateOffer {
  kind: 'restart' | 'release';
  /** The new version and this copy's, where known (the service worker's build has no number). */
  version?: string;
  current?: string;
  told: boolean;
}

/** The game's view of it (Game.hooks.update): the offer now, taking it up, and the player told of it. */
export interface UpdateHook {
  offer: () => UpdateOffer | null;
  apply: () => void;
  told: () => void;
}

export const RELEASES = 'https://github.com/synthwave-pixel/ultima5/releases/latest';
const LATEST_API = 'https://api.github.com/repos/synthwave-pixel/ultima5/releases/latest';

/** A version's numbers (1.1.12, v1.1.12): major, minor, patch; a pre-release (1.1.0-dev.x) ranks below its release. */
function parts(version: string): number[] {
  const [core = '', pre] = version.replace(/^v/, '').split('-', 2);
  const [a = 0, b = 0, c = 0] = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
  return [a, b, c, pre ? 0 : 1];
}

/** Whether `latest` is newer than `current` (as desktop/updates.cjs reckons it). */
export function isNewer(latest: string, current: string): boolean {
  const [l, c] = [parts(latest), parts(current)];
  for (let i = 0; i < l.length; i++) if (l[i] !== c[i]) return l[i] > c[i];
  return false;
}

/** The desktop app's bridge (desktop/preload.cjs u5native.updates). */
export interface DesktopUpdates {
  offer: () => Promise<UpdateOffer | null>;
  apply: () => Promise<unknown>;
  told: () => Promise<unknown>;
  onChange: (listener: (offer: UpdateOffer | null) => void) => void;
}

/** The desktop app's offer, kept as its main process tells it. */
export function desktopUpdates(bridge: DesktopUpdates): UpdateHook {
  let offer: UpdateOffer | null = null;
  bridge.onChange((o) => (offer = o));
  void bridge
    .offer()
    .then((o) => (offer ??= o))
    .catch(() => undefined);
  return {
    offer: () => offer,
    apply: () => void bridge.apply().catch(() => undefined),
    told: () => {
      if (offer) offer = { ...offer, told: true };
      void bridge.told().catch(() => undefined);
    },
  };
}

/** What the Android app gives: the APK's version (Capacitor's App plugin) and a link opened outside it. */
export interface AndroidUpdates {
  version: () => Promise<string>;
  openUrl: (url: string) => void;
  fetch: typeof fetch;
  /** The version last told of, kept by the page (localStorage). */
  told: { get: () => string | null; set: (version: string) => void };
}

/**
 * The Android app's offer: GitHub's newest release, where newer than the APK - looked for once, a moment after the
 * game starts. Offline, or GitHub not answering, there is none.
 */
export function androidUpdates(app: AndroidUpdates): UpdateHook {
  let offer: UpdateOffer | null = null;
  void (async () => {
    const current = await app.version();
    const res = await app.fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const latest = String(((await res.json()) as { tag_name?: string }).tag_name ?? '').replace(/^v/, '');
    if (!latest || !current || !isNewer(latest, current)) return;
    const was = app.told.get();
    offer = { kind: 'release', version: latest, current, told: was !== null && !isNewer(latest, was) };
  })().catch(() => undefined);
  return {
    offer: () => offer,
    apply: () => app.openUrl(RELEASES),
    told: () => {
      if (!offer) return;
      offer = { ...offer, told: true };
      if (offer.version) app.told.set(offer.version);
    },
  };
}

/** The web's: the service worker's new build, which a restart takes up. Said in the menu alone: no box for it. */
export function webUpdates(ready: () => boolean, restart: () => void): UpdateHook {
  return { offer: () => (ready() ? { kind: 'restart', told: true } : null), apply: restart, told: () => undefined };
}
