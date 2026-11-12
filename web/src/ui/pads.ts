/**
 * pads.ts
 *
 * The browser's gamepads, read so that every browser the game runs in gives the same answer: the one place that asks
 * navigator.getGamepads. Today's browsers hand back an Array; older ones - Android's WebView among them - a
 * GamepadList, which has a length and its indexes but none of an Array's methods, so a find() or some() on it threw
 * and the controller did nothing at all (found by the ap0ught fork). Its slots may be null, or hold a pad no longer
 * connected; the call may be missing altogether, or throw where the page is not allowed gamepads. A pad's buttons
 * and axes are read by index too, for the same reason. Every one of those is no pad, never an error.
 *
 * Every connected pad is read, not the first alone (issue #19): the browser may list another device as a pad ahead
 * of the one played with - a Shield's remote - and a Steam Deck's own controls and an external pad are both played
 * with. A pad's stick axis counts only once that pad's has been seen at rest, near its middle (Rest): one that rests
 * off it - a drifting stick, a trigger some pads give as an axis resting at -1 - would otherwise hold a way for good.
 */

/** The connected pads, in the browser's order. */
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

/** How near its middle an axis must come to be taken for at rest. */
const REST = 0.25;

/** The axes of each pad seen at rest, by the pad's place in the browser's list: only these are read. */
export class Rest {
  private seen = new Map<number, { id: string; axes: Set<number> }>();

  /** The pad's axes at rest now, noted. A different pad in a place forgets the one before. */
  note(pad: Gamepad, place: number): void {
    const key = typeof pad.index === 'number' ? pad.index : place;
    let s = this.seen.get(key);
    if (!s || s.id !== pad.id) this.seen.set(key, (s = { id: pad.id, axes: new Set() }));
    axesOf(pad).forEach((v, i) => Math.abs(v) < REST && s.axes.add(i));
  }

  /** The pad's axis `i`, or 0 until it has been seen at rest. */
  axis(pad: Gamepad, place: number, i: number): number {
    const key = typeof pad.index === 'number' ? pad.index : place;
    return this.seen.get(key)?.axes.has(i) ? (pad.axes[i] ?? 0) : 0;
  }
}

/**
 * Every connected pad read as one, its sticks only once at rest (`rest` noting them): a button is down if down on any,
 * an axis is the one furthest from its middle. Null with no pad.
 */
export function readAll(rest: Rest): { buttons: boolean[]; axes: number[] } | null {
  const pads = connectedPads();
  if (pads.length === 0) return null;
  const buttons: boolean[] = [];
  const axes: number[] = [];
  pads.forEach((pad, place) => {
    rest.note(pad, place);
    buttonsOf(pad).forEach((down, i) => (buttons[i] = (buttons[i] ?? false) || down));
    for (let i = 0; i < pad.axes.length; i++) {
      const v = rest.axis(pad, place, i);
      if (Math.abs(v) > Math.abs(axes[i] ?? 0)) axes[i] = v;
      else axes[i] ??= 0;
    }
  });
  return { buttons, axes };
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
