import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCommandKey } from '../src/game/input.ts';
import { Pad } from '../src/game/io.ts';
import { GONE_MS, HEARTBEAT_MS, playingKey, warnOfOtherWindow, watchOtherWindows, type Surroundings } from '../src/game/otherWindows.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/**
 * The same character played in two windows (otherWindows.ts): each warned of the other at its next command prompt,
 * once - and windows playing different characters, or one closed, warn of nothing.
 */

/** The storage the windows share, and what each hears of the others' writes (the storage event: not its own). */
const store = new Map<string, string>();
let listeners: { from: object; handler: (key: string | null, value: string | null) => void }[] = [];
let writer: object | null = null;
let clock = 1_000_000;
beforeEach(() => {
  store.clear();
  listeners = [];
  clock = 1_000_000;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
      for (const l of listeners) if (l.from !== writer) l.handler(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

/** A window of the page, playing character `id`: its game, its heartbeat to send, and its going. */
function window(id: string) {
  const { g, p } = newGame();
  journeyOnward(g);
  const self = {};
  let beat = (): void => undefined;
  let leave = (): void => undefined;
  const around: Surroundings = {
    listen: (handler) => void listeners.push({ from: self, handler }),
    every: (_ms, fn) => void (beat = fn),
    now: () => clock,
    leaving: (fn) => void (leave = fn),
  };
  writer = self;
  watchOtherWindows(g, id, around);
  writer = null;
  return {
    g,
    p,
    beat: () => {
      writer = self;
      beat();
      writer = null;
    },
    close: () => {
      listeners = listeners.filter((l) => l.from !== self);
      leave();
    },
  };
}

describe('the same character in two windows', () => {
  it('is warned of in each: the one opened second at once, the first as the second says it plays', () => {
    const first = window('iolo');
    expect(first.g.otherWindow).toBeNull();
    const second = window('iolo');
    expect(second.g.otherWindow).not.toBeNull(); // the first's heartbeat, there already
    expect(first.g.otherWindow).not.toBeNull(); // the second's, heard as it began
  });

  it('is nothing between windows playing different characters', () => {
    const iolo = window('iolo');
    const dupre = window('dupre');
    iolo.beat();
    dupre.beat();
    expect(iolo.g.otherWindow).toBeNull();
    expect(dupre.g.otherWindow).toBeNull();
  });

  it('is nothing from a window closed - its heartbeat taken away, or gone stale', () => {
    const first = window('iolo');
    first.close();
    expect(store.has(playingKey('iolo'))).toBe(false);
    expect(window('iolo').g.otherWindow).toBeNull();
    // One that went without a word (crashed): stale once its heartbeat is old.
    store.clear();
    window('iolo'); // never closed, never beats again
    clock += GONE_MS + HEARTBEAT_MS;
    expect(window('iolo').g.otherWindow).toBeNull();
  });

  it('is warned of once for each other window, at the next command prompt', async () => {
    const first = window('iolo');
    const second = window('iolo');
    first.g.s.members[0].name = 'Iolo';
    first.p.keys.push(Pad.A, Pad.B); // the warning read; then a turn passed
    await getCommandKey(first.g, 'outdoors');
    expect(first.p.log.replace(/\s+/g, ' ')).toContain('Iolo is being played in another window too.');
    expect(first.g.otherWindow).toBeNull();
    // The same window's heartbeat again: no second warning.
    clock += HEARTBEAT_MS;
    second.beat();
    expect(first.g.otherWindow).toBeNull();
    // A third window: warned of in its turn.
    window('iolo');
    expect(first.g.otherWindow).not.toBeNull();
  });

  it('says nothing at the prompt where no other window plays', async () => {
    const only = window('iolo');
    await warnOfOtherWindow(only.g);
    expect(only.p.log).not.toContain('another window');
  });
});
