/**
 * pageHarness.ts
 *
 * The page's hooks (ui/pageHooks.ts installPageHooks) run in Node, for the tests of what they ask the game: a
 * do-anything stand-in for the page (the window, the document, the canvas, the sound - every property one more of
 * it, every call one too), a gamepad whose buttons a test holds down, and every key the page pushes to the screen kept,
 * through the screen's two-at-a-time (ui/inTwos.ts) as Screen.push takes it - but not Screen.push's queue: none is
 * dropped for a full queue or a held repeat with keys waiting, nor for a box of the page's own up.
 */

import { vi } from 'vitest';
import type { GameCore } from '../src/game/gameCore.ts';
import { Holds } from '../src/ui/holds.ts';
import type { InTwos } from '../src/ui/inTwos.ts';

/** Anything at all: each property another, each call or `new` another; a number 0 where one is wanted, never a promise. */
export const anything: unknown = new Proxy(function () {}, {
  get: (_target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'then' ? undefined : anything),
  apply: () => anything,
  construct: () => anything as object,
  set: () => true,
});

/** What the screen was given: the key, and whether it was a held key's repeat. */
export interface Pushed {
  code: number;
  held: boolean;
}

/** The standard mapping's d-pad buttons and A and B (gamepad.ts BUTTONS, DPAD). */
export const PAD = { A: 0, B: 1, Up: 12, Down: 13, Left: 14, Right: 15 } as const;

export interface PageRun {
  /** The screen the hooks were given: its holds, its two-at-a-time as the hooks (or a game's own) set it. */
  screen: { holds: Holds; inTwos: InTwos | null };
  /** Every key pushed to the screen, as the game would read it. */
  pushed: Pushed[];
  /** One refresh of the display at `ms`, the pad's buttons `down` (PAD's) held. */
  frame(ms: number, down: number[]): void;
  /** `down` held from `from` to `to` ms, a refresh every 16 ms; the keys pushed meanwhile. */
  hold(down: number[], from: number, to: number): Pushed[];
}

/**
 * installPageHooks run for `g` in Node, with a pad and a screen of the harness's own; `waiting`, whether the game
 * waits for a key (Holds.waiting), true by default.
 */
export async function pageHarness(g: GameCore, waiting: () => boolean = () => true): Promise<PageRun> {
  let down: number[] = [];
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('window', anything);
  vi.stubGlobal('document', anything);
  vi.stubGlobal('localStorage', anything);
  vi.stubGlobal('ResizeObserver', anything);
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal('navigator', {
    getGamepads: () => [
      {
        index: 0,
        id: 'pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })),
      },
    ],
  });
  const pushed: Pushed[] = [];
  let now = 0;
  const own: Record<PropertyKey, unknown> = {
    holds: new Holds(waiting),
    inTwos: null,
    push(this: PageRun['screen'], code: number, _pressed = true, held = false) {
      pushed.push({ code: this.inTwos?.take(code, held, now) ?? code, held });
    },
  };
  const screen = new Proxy(own, {
    get: (o, key) => (key in o ? o[key] : anything),
    set: (o, key, value) => ((o[key] = value), true),
  }) as unknown as PageRun['screen'];
  const { installPageHooks } = await import('../src/ui/pageHooks.ts');
  installPageHooks(g, screen as never, anything as never, anything as never);
  const frame = (ms: number, held: number[]): void => {
    now = ms;
    down = held;
    for (const f of frames.splice(0)) f(ms);
  };
  return {
    screen,
    pushed,
    frame,
    hold(held, from, to) {
      const at = pushed.length;
      for (let ms = from; ms <= to; ms += 16) frame(ms, held);
      return pushed.slice(at);
    },
  };
}
