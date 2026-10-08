/**
 * fullScreen.ts
 *
 * Full screen, for the touch pad's button (touch.ts): in the desktop app the window's own (desktop/preload.cjs), the
 * same full screen as F11 and the system's controls and remembered for the next start; elsewhere the browser's.
 */

/** Full screen where it can be had: whether it is on, a switch, and word of every change, however it came. */
export interface FullScreen {
  readonly on: boolean;
  toggle(): void;
  onChange(listener: (on: boolean) => void): void;
}

/** The desktop app's window, through its bridge. */
export interface NativeFullScreen {
  set(on: boolean): Promise<boolean>;
  get(): Promise<boolean>;
  onChange(listener: (on: boolean) => void): void;
}

/** What of the page's document the browser's full screen needs. */
export interface FullScreenDocument {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: Element | null;
  readonly documentElement: { requestFullscreen(): Promise<void> };
  exitFullscreen(): Promise<void>;
  addEventListener(type: 'fullscreenchange', listener: () => void): void;
}

/** Full screen from the desktop app's window where there is one (`native`), else the browser's (`doc`); null for none. */
export function fullScreenOf(native: NativeFullScreen | undefined, doc: FullScreenDocument | undefined): FullScreen | null {
  if (native) {
    let on = false;
    const listeners: ((on: boolean) => void)[] = [];
    const told = (now: boolean): void => {
      if (now === on) return;
      on = now;
      for (const l of listeners) l(on);
    };
    native.onChange(told);
    void native.get().then(told);
    return {
      get on() {
        return on;
      },
      toggle: () => void native.set(!on).then(told),
      onChange: (l) => void listeners.push(l),
    };
  }
  if (!doc?.fullscreenEnabled) return null;
  return {
    get on() {
      return doc.fullscreenElement !== null;
    },
    toggle() {
      const asked = doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen();
      asked.catch(() => {
        /* refused: nothing to do */
      });
    },
    onChange: (l) => doc.addEventListener('fullscreenchange', () => l(doc.fullscreenElement !== null)),
  };
}

/** This page's full screen: the desktop app's window, or the browser's where it allows it. */
export function fullScreen(): FullScreen | null {
  const native = (globalThis as { u5native?: { fullScreen?: NativeFullScreen } }).u5native?.fullScreen;
  return fullScreenOf(native, typeof document === 'undefined' ? undefined : document);
}
