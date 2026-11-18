/**
 * appStart.ts
 *
 * What the app does as it starts, whichever game it starts (main.ts, Ultima V's entry; a fork's own entry for its game):
 * the installed app's updates (the service worker's, the desktop app's, the Android app's), keeping the browser's
 * storage, the Loading notice and the boot screen drawn before the game can draw.
 */

import { storageKey } from './brand.ts';
import { HI_HEIGHT, HI_WIDTH } from './ui/framebuffer.ts';
import { launchWarning, warningDue, type CapacitorLike } from './ui/platform.ts';
import { showNotice } from './ui/notice.ts';
import { androidUpdates, desktopUpdates, webUpdates, type DesktopUpdates, type UpdateHook } from './ui/updates.ts';
import { registerSW } from 'virtual:pwa-register';

const WARNED_KEY = storageKey('iosWarned');

// The installed app: a new version downloads in the background and waits; the title menu offers the restart
// (intro.ts). A page left running looks again every hour. The desktop app (an app:// origin) and the Android app
// (Capacitor) ship their own files and have no service worker; their updates are new builds.
export const capacitor = (window as { Capacitor?: CapacitorLike }).Capacitor;
const native = Boolean(capacitor?.isNativePlatform?.());
let updateReady = false;
let applyUpdate: (reload?: boolean) => Promise<void> = () => Promise.resolve();

/** The service worker registered, where there is one (an http page, not the apps, not development): as the app starts. */
export function watchForUpdates(): void {
  if (!location.protocol.startsWith('http') || native || import.meta.env.DEV) return;
  applyUpdate = registerSW({
    onNeedRefresh() {
      updateReady = true;
    },
    onRegisteredSW(_url, registration) {
      // Offline, the look fails, and is tried again the next hour: nothing broke.
      if (registration) setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
}

/**
 * Where a newer version is to be learnt of (ui/updates.ts): the desktop app's main process, the Android app's look at
 * GitHub, or the web's service worker.
 */
export function updateHook(cap: CapacitorLike | undefined): UpdateHook {
  const desktop = (window as { u5native?: { updates?: DesktopUpdates } }).u5native?.updates;
  if (desktop) return desktopUpdates(desktop);
  const plugins = (cap as { Plugins?: AndroidPlugins } | undefined)?.Plugins;
  const getInfo = plugins?.App?.getInfo;
  if (native && getInfo) {
    return androidUpdates({
      version: async () => (await getInfo.call(plugins.App)).version,
      openUrl: (url) => {
        if (plugins.GameFolder?.openUrl) void plugins.GameFolder.openUrl({ url }).catch(() => window.open(url, '_blank'));
        else window.open(url, '_blank');
      },
      fetch: (...a) => fetch(...a),
      told: {
        get: () => {
          try {
            return localStorage.getItem(UPDATE_TOLD_KEY);
          } catch {
            return null;
          }
        },
        set: (v) => {
          try {
            localStorage.setItem(UPDATE_TOLD_KEY, v);
          } catch {
            // Nowhere to keep it: told again next time.
          }
        },
      },
    });
  }
  return webUpdates(
    () => updateReady,
    () => void applyUpdate(true),
  );
}

/** The Android app's plugins the update needs: the APK's version, and a page opened in the system's browser. */
interface AndroidPlugins {
  App?: { getInfo?: () => Promise<{ version: string }> };
  GameFolder?: { openUrl?: (o: { url: string }) => Promise<unknown> };
}

/** The version the Android app last told the player of (ui/updates.ts androidUpdates). */
const UPDATE_TOLD_KEY = storageKey('updateTold');

/**
 * What the page keeps is kept: ask the browser not to evict it, and warn an iOS tab of WebKit's seven days - in the
 * page (notice.ts), read before the game starts.
 */
export async function keepStorage(): Promise<void> {
  // Refused or not, the game goes on: asking is all it can do.
  if (navigator.storage?.persist) void navigator.storage.persist().catch(() => undefined);
  const warning = launchWarning(navigator, (q) => window.matchMedia(q));
  if (!warning) return;
  let last: number | null = null;
  try {
    const raw = localStorage.getItem(WARNED_KEY);
    last = raw === null ? null : Number(raw);
  } catch {
    /* storage refused: the warning shows again */
  }
  if (!warningDue(last, Date.now())) return;
  await showNotice('Keeping your game', warning);
  try {
    localStorage.setItem(WARNED_KEY, String(Date.now()));
  } catch {
    /* as above */
  }
}

/**
 * A line on the screen before the game can draw one (Loading...; a failure to start has the crash box): at the game's
 * own size, in the Standard lettering once it has come (it needs none of the game's files), until then in the
 * browser's.
 */
let noticeFont: Uint8Array | null = null;

/** The lettering the notice is drawn in, once it has come (loadStandardFont). */
export function useNoticeFont(f: Uint8Array | null): void {
  noticeFont = f;
}
export function canvasNotice(canvas: HTMLCanvasElement, text: string): void {
  canvas.width = HI_WIDTH;
  canvas.height = HI_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const G = 32; // a glyph's cell, as the game draws its text
  const lines = wrap(text, Math.floor(canvas.width / G) - 2);
  const top = Math.round(canvas.height / 2 - (lines.length * G) / 2);
  if (!noticeFont) {
    ctx.fillStyle = '#fff';
    ctx.font = `${G * 0.8}px monospace`;
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, (canvas.width - ctx.measureText(l).width) / 2, top + i * G));
    return;
  }
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  lines.forEach((l, i) => {
    const left = Math.round((canvas.width - l.length * G) / 2);
    [...l].forEach((ch, k) => {
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code > 0x7f) return;
      const glyph = noticeFont!.subarray((code - 0x20) * G * G, (code - 0x1f) * G * G);
      for (let y = 0; y < G; y++)
        for (let x = 0; x < G; x++) if (glyph[y * G + x]) px[(top + i * G + y) * canvas.width + left + k * G + x] = 0xffffffff;
    });
  });
  ctx.putImageData(img, 0, 0);
}

/**
 * The boot screen while the game loads (web/public/boot.jpg, tools/key-art.mjs): the box's painting under the title,
 * the game screen's shape, drawn smooth at the display's size - a painting, not the game's own picture, so neither
 * grown unsmoothed nor lined with the game's scanlines. Drawn again as the window is
 * resized, until `stop` is called (the game about to draw) - which waits until it has been up BOOT_MS, so that a quick
 * start does not flash it. It has a moment to come (it is cached with the page); if it does not, or cannot, the
 * Loading notice stays, and nothing is waited for.
 */
const BOOT_MS = 1200;
let bootShown = false;

/** Whether the boot screen has been drawn (the Loading notice is then not drawn again over it). */
export function bootScreenShown(): boolean {
  return bootShown;
}
export function bootScreen(canvas: HTMLCanvasElement): Promise<() => Promise<void>> {
  let shownAt = 0;
  let live = true;
  const art = new Image();
  const draw = (): void => {
    if (!live || !art.complete || !art.naturalWidth) return;
    const r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    [canvas.width, canvas.height] = [Math.round(r.width * devicePixelRatio), Math.round(r.height * devicePixelRatio)];
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
    bootShown = true;
    shownAt ||= performance.now();
  };
  const stop = async (): Promise<void> => {
    if (shownAt) await new Promise((r) => setTimeout(r, Math.max(0, shownAt + BOOT_MS - performance.now())));
    live = false;
    window.removeEventListener('resize', draw);
  };
  window.addEventListener('resize', draw);
  return new Promise((done) => {
    const settle = (): void => done(stop);
    art.onload = () => {
      draw();
      settle();
    };
    art.onerror = settle;
    setTimeout(settle, 1500);
    art.src = `${import.meta.env.BASE_URL}boot.jpg`;
  });
}

/** A line broken into lines of at most `width` characters, at spaces where it can be. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word;
    while (line.length > width) {
      out.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  if (line) out.push(line);
  return out;
}
