/**
 * otherWindows.ts
 *
 * The same character played in two windows at once (the port's): each saving over the other's game, whichever saves
 * last. A window playing a character says so every few seconds in the storage they share (a heartbeat under the
 * character's keys); a window that finds another's heartbeat for its own character - there as it begins, or come
 * since (the storage event every other window of the page hears) - warns the player at the next command prompt,
 * once for each other window. Windows playing different characters are nothing to each other.
 */

import { charKey, freshId } from './characters.ts';
import type { Game } from './game.ts';

/** How often a window playing a character says so (ms), and how long after its last word it is taken to be gone. */
export const HEARTBEAT_MS = 5000;
export const GONE_MS = 15000;

/** Where a character's heartbeat is kept: the window playing them and when it last said so. */
export const playingKey = (id: string): string => charKey(id, 'playing');

interface Beat {
  tab: string;
  at: number;
}

/** What a window needs of the page to watch: its storage events, a timer and the clock (the tests give their own). */
export interface Surroundings {
  listen(handler: (key: string | null, value: string | null) => void): void;
  every(ms: number, fn: () => void): void;
  now(): number;
  /** When the window goes (closed, reloaded): its heartbeat taken away, so no window just opened is warned of it. */
  leaving(fn: () => void): void;
}

const page: Surroundings = {
  listen: (handler) => globalThis.addEventListener?.('storage', (e) => handler(e.key, e.newValue)),
  every: (ms, fn) => void setInterval(fn, ms),
  now: () => Date.now(),
  leaving: (fn) => globalThis.addEventListener?.('pagehide', fn),
};

const beatOf = (text: string | null): Beat | null => {
  try {
    const b = JSON.parse(text ?? '') as Partial<Beat>;
    return typeof b.tab === 'string' && typeof b.at === 'number' ? { tab: b.tab, at: b.at } : null;
  } catch {
    return null;
  }
};

/**
 * Character `id` watched for in other windows, from now on in this one (the game begun, main.ts): its heartbeat begun,
 * and another window's - found now, or heard of later - marked for the warning (g.otherWindow).
 */
export function watchOtherWindows(g: Game, id: string, around: Surroundings = page): void {
  const tab = freshId([]);
  const key = playingKey(id);
  const heard = (beat: Beat | null): void => {
    if (beat && beat.tab !== tab && around.now() - beat.at < GONE_MS && !g.windowsWarnedOf.has(beat.tab)) g.otherWindow = beat.tab;
  };
  try {
    heard(beatOf(globalThis.localStorage?.getItem(key) ?? null));
  } catch {
    /* no storage: nothing to share */
  }
  const beat = (): void => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify({ tab, at: around.now() }));
    } catch {
      /* full or shut: the others will not hear of this one */
    }
  };
  beat();
  around.every(HEARTBEAT_MS, beat);
  around.listen((changed, value) => {
    if (changed === key) heard(beatOf(value));
  });
  around.leaving(() => {
    try {
      if (beatOf(globalThis.localStorage?.getItem(key) ?? null)?.tab === tab) globalThis.localStorage?.removeItem(key);
    } catch {
      /* it goes stale by itself (GONE_MS) */
    }
  });
}

/** The warning, at a command prompt (input.ts getCommandKey), where another window plays this character: once each. */
export async function warnOfOtherWindow(g: Game): Promise<void> {
  const other = g.otherWindow;
  if (other === null) return;
  g.otherWindow = null;
  g.windowsWarnedOf.add(other);
  const { showText, wrap } = await import('./menu.ts');
  const name = g.s.members[0].name.trim() || 'This character';
  await showText(
    g,
    'Another window',
    wrap(
      `${name} is being played in another window too. Each window's saves are made over the other's: play on in one window, and close the other.`,
    ),
  );
}
