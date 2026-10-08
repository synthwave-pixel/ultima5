/**
 * platform.ts
 *
 * Where the game is running, as far as storage is concerned. Every browser
 * on iOS wraps Apple's WebKit, whose tracking prevention deletes a site's
 * script-written storage (the saved game included) after seven days of
 * browser use without a visit. A web app added to the Home Screen keeps
 * its own storage and is not subject to that, so the warning is for a
 * browser tab on iOS only.
 */

export interface NavigatorLike {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** Safari's flag for a page launched from the Home Screen. */
  standalone?: boolean;
}

/** iPhone, iPod, iPad, and iPadOS 13+ which calls itself a Mac with a touch screen. */
export function isIOS(nav: NavigatorLike): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

/** Launched from the Home Screen (or otherwise installed), by Safari's flag or the display-mode media query. */
export function isInstalled(nav: NavigatorLike, matchMedia?: (query: string) => { matches: boolean }): boolean {
  return nav.standalone === true || matchMedia?.('(display-mode: standalone)').matches === true;
}

export const IOS_STORAGE_WARNING =
  'In an iOS browser tab the saved game, and the game files given to the installer, are deleted after seven days ' +
  'of browser use without a visit here. That is a WebKit rule, the same in Safari, Chrome and Brave. To keep them: ' +
  'add this page to the Home Screen (Share, then Add to Home Screen), or export the game to a file from Settings.';

/** The warning to show at launch, or null when it does not apply. */
export function launchWarning(nav: NavigatorLike, matchMedia?: (query: string) => { matches: boolean }): string | null {
  return isIOS(nav) && !isInstalled(nav, matchMedia) ? IOS_STORAGE_WARNING : null;
}

export const WARNING_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The Capacitor bridge the Android app's web view is given, with its App plugin where the app carries it. */
export interface CapacitorLike {
  isNativePlatform?: () => boolean;
  Plugins?: { App?: { exitApp?: () => unknown } };
}

/**
 * How the game can quit, where it runs as an app that can (the ultima3 port's): the desktop app serves it from its
 * own app:// scheme (desktop/main.cjs) and quits when its window closes; the Android app quits through Capacitor's App
 * plugin. Anywhere else there is none, and the title menu offers no Quit: a browser closes its own tabs.
 */
export function appQuit(protocol: string, closeWindow: () => void, capacitor?: CapacitorLike): (() => void) | undefined {
  if (protocol === 'app:') return closeWindow;
  const app = capacitor?.isNativePlatform?.() ? capacitor.Plugins?.App : undefined;
  const exit = app?.exitApp;
  return exit ? () => void exit.call(app) : undefined;
}

/** Whether the warning is due: never shown, or shown a day or more ago (a clock set back counts as due too). */
export function warningDue(lastShown: number | null, now: number): boolean {
  return lastShown === null || !Number.isFinite(lastShown) || now - lastShown >= WARNING_INTERVAL_MS || lastShown > now;
}
