import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { GamepadInput } from '../src/ui/gamepad.ts';
import { axesOf, buttonsOf, connectedPads, firstPad, pressed } from '../src/ui/pads.ts';

/**
 * A list as older browsers give it (a GamepadList): a length and indexes, none of an Array's methods - no find, some,
 * map or flatMap, no iterator. The pads' buttons and axes the same.
 */
function listLike<T>(items: T[]): ArrayLike<T> {
  const out: Record<number, T> & { length: number } = { length: items.length };
  items.forEach((it, i) => (out[i] = it));
  return out;
}

const pad = (index: number, connected: boolean, down: number[] = [], axes: number[] = [0, 0, 0, 0], asList = false): Gamepad => {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), touched: false, value: 0 }));
  return {
    index,
    connected,
    mapping: 'standard',
    buttons: asList ? listLike(buttons) : buttons,
    axes: asList ? listLike(axes) : axes,
  } as unknown as Gamepad;
};

afterEach(() => vi.unstubAllGlobals());

describe('the browser’s gamepads, read alike in every browser', () => {
  it('reads an Array, as today’s browsers give', () => {
    const b = pad(1, true, [0]);
    vi.stubGlobal('navigator', { getGamepads: () => [null, b, pad(2, false)] });
    expect(connectedPads()).toEqual([b]);
    expect(firstPad()).toBe(b);
  });

  it('reads a GamepadList with no Array methods, as older WebViews give, its pads’ buttons and axes too', () => {
    const b = pad(0, true, [1], [0.5, -1, 0, 0], true);
    vi.stubGlobal('navigator', { getGamepads: () => listLike([b, null, null, null]) });
    expect(firstPad()).toBe(b);
    expect(pressed(b, 1)).toBe(true);
    expect(pressed(b, 0)).toBe(false);
    expect(pressed(b, 40)).toBe(false); // a button the pad has not
    expect(buttonsOf(b).slice(0, 3)).toEqual([false, true, false]);
    expect(axesOf(b)).toEqual([0.5, -1, 0, 0]);
  });

  it('finds no pad, without an error, where there is none to find', () => {
    vi.stubGlobal('navigator', { getGamepads: () => listLike([null, pad(1, false)]) });
    expect(firstPad()).toBeNull();
    vi.stubGlobal('navigator', { getGamepads: () => null });
    expect(connectedPads()).toEqual([]);
    vi.stubGlobal('navigator', {}); // no Gamepad API at all
    expect(connectedPads()).toEqual([]);
    vi.stubGlobal('navigator', {
      getGamepads: () => {
        throw new DOMException('not allowed', 'SecurityError'); // a permissions policy forbidding gamepads
      },
    });
    expect(connectedPads()).toEqual([]);
  });

  it('lets the game read a pad through a GamepadList: A pressed is sent', () => {
    const out: number[] = [];
    let a = false;
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', { getGamepads: () => listLike([pad(0, true, a ? [0] : [], [0, 0, 0, 0], true)]) });
    const input = new GamepadInput((code) => out.push(code)) as unknown as { poll(now: number): void };
    input.poll(0);
    a = true;
    input.poll(16);
    expect(out).toEqual([Pad.A]);
  });
});
