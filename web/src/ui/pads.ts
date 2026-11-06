/**
 * pads.ts
 *
 * The browser's gamepads, read so that every browser the game runs in gives the same answer: the one place that asks
 * navigator.getGamepads. Today's browsers hand back an Array; older ones - Android's WebView among them - a
 * GamepadList, which has a length and its indexes but none of an Array's methods, so a find() or some() on it threw
 * and the controller did nothing at all (found by the ap0ught fork). Its slots may be null, or hold a pad no longer
 * connected; the call may be missing altogether, or throw where the page is not allowed gamepads. A pad's buttons
 * and axes are read by index too, for the same reason. Every one of those is no pad, never an error.
 */

/** The connected pads, in the browser's order (its first is the one the game reads). */
export function connectedPads(): Gamepad[] {
  let list: ArrayLike<Gamepad | null> | null | undefined;
  try {
    list = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null;
  } catch {
    return []; // not allowed here (a permissions policy): no pads
  }
  const out: Gamepad[] = [];
  for (let i = 0; list && i < list.length; i++) {
    const pad = list[i];
    if (pad?.connected) out.push(pad);
  }
  return out;
}

/** The first connected pad, or null. */
export function firstPad(): Gamepad | null {
  return connectedPads()[0] ?? null;
}

/** Whether a pad's button is down, by index (a missing one is up). */
export function pressed(pad: Gamepad, button: number): boolean {
  return pad.buttons[button]?.pressed ?? false;
}

/** A pad's buttons as booleans, and its axes as numbers: plain arrays, whatever the browser gave. */
export function buttonsOf(pad: Gamepad): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < pad.buttons.length; i++) out.push(pressed(pad, i));
  return out;
}
export function axesOf(pad: Gamepad): number[] {
  const out: number[] = [];
  for (let i = 0; i < pad.axes.length; i++) out.push(pad.axes[i] ?? 0);
  return out;
}
