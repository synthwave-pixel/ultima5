import { afterEach, describe, expect, it, vi } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { GamepadInput } from '../src/ui/gamepad.ts';
import { HOLD_FIRST_MS, INPUT_PACES } from '../src/ui/holds.ts';
import { FocusWatch } from '../src/ui/windowFocus.ts';

const padOf = () => ({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
});

afterEach(() => vi.unstubAllGlobals());

/**
 * The game in two windows - a browser's and the desktop app's - and a press on the pad moved both: the browser hands
 * a pad's state to a page it shows, focused or not. Only the window with the focus reads it now; a button held as the
 * focus comes back counts once let go and pressed again, as a key held into a new scene does.
 */
describe('the gamepad and the window’s focus', () => {
  const setup = () => {
    const pad = padOf();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    let focused = true;
    const sent: number[] = [];
    const input = new GamepadInput(
      (c) => sent.push(c),
      () => false,
      { pace: INPUT_PACES.medium, breaks: 0, waiting: () => true },
      () => false,
      () => false,
      () => focused,
    ) as unknown as { poll(now: number): void };
    return { pad, sent, input, focus: (f: boolean) => (focused = f) };
  };

  it('sends nothing while another window has the focus', () => {
    const { pad, sent, input, focus } = setup();
    focus(false);
    input.poll(0);
    pad.buttons[0].pressed = true;
    input.poll(16);
    pad.buttons[0].pressed = false;
    pad.buttons[12].pressed = true;
    for (let ms = 32; ms < 32 + HOLD_FIRST_MS + 400; ms += 16) input.poll(ms);
    expect(sent).toEqual([]);
  });

  it('takes a button held as the focus comes back only once it is let go and pressed again', () => {
    const { pad, sent, input, focus } = setup();
    focus(false);
    input.poll(0);
    pad.buttons[0].pressed = true;
    pad.buttons[12].pressed = true; // up on the d-pad, held too
    input.poll(16);
    focus(true);
    for (let ms = 32; ms < 32 + HOLD_FIRST_MS + 400; ms += 16) input.poll(ms);
    expect(sent).toEqual([]); // neither the A nor the way held, nor a repeat of it
    pad.buttons[0].pressed = false;
    pad.buttons[12].pressed = false;
    input.poll(1000);
    pad.buttons[0].pressed = true;
    input.poll(1016);
    expect(sent).toEqual([Pad.A]);
  });

  it('reads as ever with the focus', () => {
    const { pad, sent, input } = setup();
    input.poll(0);
    pad.buttons[12].pressed = true;
    input.poll(16);
    expect(sent).toEqual([K.Up]);
  });
});

describe('the window’s focus (FocusWatch)', () => {
  it('is had until the window loses it, and again when it comes back', () => {
    const target = new EventTarget();
    const watch = new FocusWatch(target);
    expect(watch.focused).toBe(true); // a window never told of its focus (a Steam Deck's Game Mode) is not locked out
    target.dispatchEvent(new Event('blur'));
    expect(watch.focused).toBe(false);
    target.dispatchEvent(new Event('focus'));
    expect(watch.focused).toBe(true);
  });
});
