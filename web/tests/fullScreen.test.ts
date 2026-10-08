import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readState, startsFullScreen, writeState } from '../../desktop/windowState.cjs';
import { type FullScreenDocument, fullScreenOf, type NativeFullScreen } from '../src/ui/fullScreen.ts';
import { fullScreenMarks } from '../src/ui/touch.ts';

/** The desktop app's window, as its bridge (desktop/preload.cjs) tells it: full screen or not, and every change. */
function fakeWindow(start: boolean) {
  let on = start;
  const listeners: ((on: boolean) => void)[] = [];
  const native: NativeFullScreen = {
    set: async (now) => {
      on = now;
      for (const l of listeners) l(on);
      return on;
    },
    get: async () => on,
    onChange: (l) => void listeners.push(l),
  };
  /** The window going full screen or leaving it by other means (F11, the system's controls). */
  const system = (now: boolean): void => {
    on = now;
    for (const l of listeners) l(on);
  };
  return { native, system };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('the full-screen switch', () => {
  it('in the desktop app switches the window itself, and follows it however it changes', async () => {
    const { native, system } = fakeWindow(true);
    const full = fullScreenOf(native, undefined)!;
    const seen: boolean[] = [];
    full.onChange((on) => seen.push(on));
    await settle();
    expect(full.on).toBe(true); // the window started full screen
    full.toggle();
    await settle();
    expect(full.on).toBe(false);
    system(true); // F11, or the green button
    expect(full.on).toBe(true);
    expect(seen).toEqual([true, false, true]);
  });

  it('in a browser asks for full screen, and leaves it when in it', async () => {
    let element: Element | null = null;
    const changed: (() => void)[] = [];
    const asked: string[] = [];
    const doc: FullScreenDocument = {
      fullscreenEnabled: true,
      get fullscreenElement() {
        return element;
      },
      documentElement: {
        requestFullscreen: async () => {
          asked.push('enter');
          element = {} as Element;
          for (const c of changed) c();
        },
      },
      exitFullscreen: async () => {
        asked.push('leave');
        element = null;
        for (const c of changed) c();
      },
      addEventListener: (_type, l) => void changed.push(l),
    };
    const full = fullScreenOf(undefined, doc)!;
    const seen: boolean[] = [];
    full.onChange((on) => seen.push(on));
    expect(full.on).toBe(false);
    full.toggle();
    await settle();
    full.toggle();
    await settle();
    expect(asked).toEqual(['enter', 'leave']);
    expect(seen).toEqual([true, false]);
  });

  it('is not there where full screen cannot be had (iOS Safari)', () => {
    expect(fullScreenOf(undefined, undefined)).toBeNull();
    expect(fullScreenOf(undefined, { fullscreenEnabled: false } as FullScreenDocument)).toBeNull();
  });

  it('draws its corner marks pointing out to go full screen, and in to leave it', () => {
    // Going: the marks the button always had.
    expect(fullScreenMarks(10, false)).toBe('M2.5 4.5 V2.5 H4.5 M5.5 2.5 H7.5 V4.5 M7.5 5.5 V7.5 H5.5 M4.5 7.5 H2.5 V5.5');
    // Leaving: each L turned in, its corner towards the middle.
    expect(fullScreenMarks(10, true)).toBe('M4.5 2.5 V4.5 H2.5 M5.5 2.5 V4.5 H7.5 M7.5 5.5 H5.5 V7.5 M2.5 5.5 H4.5 V7.5');
  });
});

describe('the desktop window at the start (desktop/windowState.cjs)', () => {
  it('is full screen unless the player last left it a window', () => {
    expect(startsFullScreen([], {}, {})).toBe(true); // the first start
    expect(startsFullScreen([], {}, { fullScreen: true })).toBe(true);
    expect(startsFullScreen([], {}, { fullScreen: false, width: 1280, height: 800 })).toBe(false);
  });

  it('is as the command line says, and full screen always in Steam’s Game Mode', () => {
    expect(startsFullScreen(['--windowed'], {}, { fullScreen: true })).toBe(false);
    expect(startsFullScreen(['--fullscreen'], {}, { fullScreen: false })).toBe(true);
    expect(startsFullScreen([], { SteamDeck: '1' }, { fullScreen: false })).toBe(true);
    expect(startsFullScreen([], { SteamOS: '1' }, { fullScreen: false })).toBe(true);
    expect(startsFullScreen(['--windowed'], { SteamDeck: '1' }, {})).toBe(false);
  });

  it('keeps where the window was and whether it was full screen, each kept as the other changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'u5-window-'));
    try {
      const file = join(dir, 'window.json');
      expect(readState(file)).toEqual({}); // nothing yet
      writeState(file, { x: 10, y: 20, width: 1280, height: 800 });
      writeState(file, { fullScreen: false });
      expect(readState(file)).toEqual({ x: 10, y: 20, width: 1280, height: 800, fullScreen: false });
      writeState(file, { x: 30 });
      expect(readState(file)).toEqual({ x: 30, y: 20, width: 1280, height: 800, fullScreen: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
