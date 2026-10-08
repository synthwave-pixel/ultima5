import { describe, expect, it } from 'vitest';
import { menuKey, nextFocus, padStart, padStep, type PadReading, type Place } from '../src/ui/pageMenu.ts';

/** A button at (left, top), 100 by 40. */
const at = (left: number, top: number, width = 100): Place => ({ left, top, width, height: 40 });

/** The installer's buttons, as laid out: Scan alone, the two choosers in a row under it, the question's two under them. */
const INSTALLER = [at(0, 0, 220), at(0, 120, 160), at(170, 120, 220), at(0, 220, 160), at(170, 220, 140)];

describe('page menu: moving the highlight', () => {
  it('goes left and right in the page order, stopping at the ends', () => {
    expect(nextFocus(INSTALLER, 0, 'right')).toBe(1);
    expect(nextFocus(INSTALLER, 2, 'right')).toBe(3);
    expect(nextFocus(INSTALLER, 4, 'right')).toBe(4);
    expect(nextFocus(INSTALLER, 0, 'left')).toBe(0);
    expect(nextFocus(INSTALLER, 3, 'left')).toBe(2);
  });

  it('goes up and down to the nearest row, the button most in line', () => {
    expect(nextFocus(INSTALLER, 0, 'down')).toBe(1);
    expect(nextFocus(INSTALLER, 2, 'up')).toBe(0);
    expect(nextFocus(INSTALLER, 2, 'down')).toBe(4);
    expect(nextFocus(INSTALLER, 1, 'down')).toBe(3);
    expect(nextFocus(INSTALLER, 3, 'up')).toBe(1);
  });

  it('stays where nothing lies that way', () => {
    expect(nextFocus(INSTALLER, 0, 'up')).toBe(0);
    expect(nextFocus(INSTALLER, 4, 'down')).toBe(4);
    // Two in a row (the crash box's): nothing above or below either.
    const row = [at(0, 0), at(110, 0)];
    expect(nextFocus(row, 0, 'down')).toBe(0);
    expect(nextFocus(row, 1, 'up')).toBe(1);
  });

  it('starts at the first when nothing is highlighted, and has nowhere to go with no buttons', () => {
    expect(nextFocus(INSTALLER, -1, 'down')).toBe(0);
    expect(nextFocus([], 0, 'down')).toBe(-1);
  });
});

describe('page menu: the keys', () => {
  it('reads the arrows and WASD as the d-pad, Enter and Space as A, Escape as B', () => {
    expect(['ArrowUp', 'w', 'W', 'ArrowDown', 's', 'ArrowLeft', 'a', 'ArrowRight', 'D'].map(menuKey)).toEqual([
      'up',
      'up',
      'up',
      'down',
      'down',
      'left',
      'left',
      'right',
      'right',
    ]);
    expect(menuKey('Enter')).toBe('a');
    expect(menuKey(' ')).toBe('a');
    expect(menuKey('Escape')).toBe('b');
    expect(menuKey('q')).toBeNull();
    expect(menuKey('Tab')).toBeNull();
  });
});

/** A gamepad holding the given standard buttons, its stick at `axes`. */
function pad(held: number[] = [], axes = [0, 0]): PadReading {
  const buttons = Array.from({ length: 17 }, (_, i) => held.includes(i));
  return { buttons, axes };
}

describe('page menu: the gamepad', () => {
  it('presses A and B as they are let go, once', () => {
    const s = padStart(pad());
    expect(padStep(s, pad([0]), 0)).toEqual([]);
    expect(padStep(s, pad([0]), 16)).toEqual([]);
    expect(padStep(s, pad(), 32)).toEqual(['a']);
    expect(padStep(s, pad(), 48)).toEqual([]);
    expect(padStep(s, pad([1]), 64)).toEqual([]);
    expect(padStep(s, pad(), 80)).toEqual(['b']);
  });

  it('does not count a button already held as the box came', () => {
    const s = padStart(pad([0]));
    expect(padStep(s, pad([0]), 0)).toEqual([]);
    expect(padStep(s, pad(), 16)).toEqual([]);
    expect(padStep(s, pad([0]), 32)).toEqual([]);
    expect(padStep(s, pad(), 48)).toEqual(['a']);
  });

  it('moves as the d-pad is pushed, and again while it is held', () => {
    const s = padStart(pad());
    expect(padStep(s, pad([13]), 0)).toEqual(['down']);
    expect(padStep(s, pad([13]), 200)).toEqual([]);
    expect(padStep(s, pad([13]), 300)).toEqual(['down']);
    expect(padStep(s, pad([13]), 400)).toEqual([]);
    expect(padStep(s, pad([13]), 430)).toEqual(['down']);
    expect(padStep(s, pad(), 450)).toEqual([]);
    expect(padStep(s, pad([15]), 460)).toEqual(['right']);
  });

  it('reads the left stick past its dead zone, the stronger axis winning', () => {
    const s = padStart(pad());
    expect(padStep(s, pad([], [0.3, 0.2]), 0)).toEqual([]);
    expect(padStep(s, pad([], [-0.9, 0.6]), 16)).toEqual(['left']);
    expect(padStep(s, pad([], [0.1, -0.8]), 32)).toEqual(['up']);
  });

  it('lets go of everything when the gamepad goes', () => {
    const s = padStart(pad());
    padStep(s, pad([0, 12]), 0);
    expect(padStep(s, null, 16)).toEqual(['a']);
    expect(padStep(s, null, 1000)).toEqual([]);
  });
});
