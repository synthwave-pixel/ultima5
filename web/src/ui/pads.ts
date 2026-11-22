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
 * Every connected pad is watched, not the first alone (issue #19): the browser may list another device as a pad
 * ahead of the one played with - a Shield's remote - and a Steam Deck's own controls and an external pad are both
 * played with. Of them, the one played last is read (Played): the pad whose buttons or sticks changed most recently,
 * whatever it holds. The browser can keep a pad in its list that no longer reports - a Bluetooth pad dropped and
 * listed again in a new place, its old place left frozen as it was, a way held (issue #40) - and one read with the
 * others would hold that way for good: the player's own pad never changes the frozen one, so its first press takes
 * over and the frozen pad is left alone. A pad's stick axis counts only once that pad's has been seen at rest, near
 * its middle (Rest): one that rests off it - a drifting stick, a trigger some pads give as an axis resting at -1 -
 * would otherwise hold a way for good.
 */

/** The browser's list of pads as it gives it, or null where there is none or it may not be asked (a permissions policy). */
export function browserPadList(): ArrayLike<Gamepad | null> | null {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : null;
  } catch {
    return null;
  }
}

/** The connected pads, in the browser's order. */
export function connectedPads(): Gamepad[] {
  const list = browserPadList();
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

/** How far from its middle an axis must go to count as played with (the game's own dead zone: gamepad.ts). */
const PLAYED = 0.5;

/** A pad in the browser's list: its place there and its name, so another pad in the same place is another. */
const keyOf = (pad: Gamepad, place: number): string => `${typeof pad.index === 'number' ? pad.index : place}:${pad.id}`;

/**
 * The pad played last, of those connected: the one whose buttons down, or sticks pushed past half way (once at rest),
 * changed most recently. A pad that only sits there - at rest, or frozen as it was left - never takes over; a held
 * button or way on the one played last stays held. A pad first seen with something down counts as changed, a pad
 * first seen at rest not. Every pad's sticks are noted at rest (`rest`) as they go, the one read or not.
 */
export class Played {
  /** What each pad had down when last read, by keyOf. */
  private last = new Map<string, string>();
  /** The pad played last, by keyOf; null till one is. */
  private active: string | null = null;

  constructor(readonly rest = new Rest()) {}

  /** Of `all` (connectedPads, in order), the pad to read: the one played last, or none while none has been. */
  pick(all: Gamepad[]): Gamepad[] {
    const keys = all.map(keyOf);
    let changed: string | null = null;
    let changedDown = false;
    all.forEach((pad, place) => {
      this.rest.note(pad, place);
      const now = this.downOn(pad, place);
      const before = this.last.get(keys[place]) ?? '';
      this.last.set(keys[place], now);
      // Two changed at once: the one with something down now.
      if (now !== before && (changed === null || (!changedDown && now !== ''))) [changed, changedDown] = [keys[place], now !== ''];
    });
    for (const key of [...this.last.keys()]) if (!keys.includes(key)) this.last.delete(key);
    if (changed !== null) this.active = changed;
    const at = this.active === null ? -1 : keys.indexOf(this.active);
    if (at < 0) this.active = null;
    return at < 0 ? [] : [all[at]];
  }

  /** What `pad` has down: its buttons, and its sticks' axes pushed past half way, as a string to compare. */
  private downOn(pad: Gamepad, place: number): string {
    const out: string[] = [];
    buttonsOf(pad).forEach((down, i) => down && out.push(`b${i}`));
    for (let i = 0; i < pad.axes.length; i++) {
      const v = this.rest.axis(pad, place, i);
      if (Math.abs(v) > PLAYED) out.push(`a${i}${v < 0 ? '-' : '+'}`);
    }
    return out.join(' ');
  }
}

/**
 * The pad played last (`played`), its sticks only once at rest: its buttons, and its axes. With pads connected but none
 * played yet, nothing down. Null with no pad.
 */
export function readAll(played: Played): { buttons: boolean[]; axes: number[] } | null {
  const all = connectedPads();
  if (all.length === 0) return null;
  const [pad] = played.pick(all);
  if (!pad) return { buttons: [], axes: [] };
  const place = all.indexOf(pad);
  const axes: number[] = [];
  for (let i = 0; i < pad.axes.length; i++) axes.push(played.rest.axis(pad, place, i));
  return { buttons: buttonsOf(pad), axes };
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
