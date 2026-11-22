/**
 * padWatch.ts
 *
 * The controller page's record (controllers.html, controllers.ts): every slot of the browser's gamepad list as it is at each frame,
 * and a log of what changed - a slot filled or emptied, a pad connected or not, a button down or up, a stick pushed
 * past half way or back, a pad's timestamp standing still while it holds something down (a pad that has stopped
 * answering, frozen as it was) and moving again, the page's focus and the frames it missed - with the pad the game
 * would read (pads.ts Played) marked. Its report is plain text to copy into an issue. Nothing here touches the page.
 */

import { Played } from '../ui/pads.ts';

/** A stick counts as pushed past this far from its middle, as the game reads it (gamepad.ts). */
const PUSHED = 0.5;
/** A pad holding something down whose timestamp has not moved for this long is noted as standing still. */
const STILL_MS = 2000;
/** A frame this late after the last is noted: the page held up (or hidden) that long. */
const LATE_MS = 250;
/** The log's length: the oldest lines go. */
const KEEP = 400;

/** Standard-mapping button names, by index. */
const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'LS', 'RS', 'Up', 'Down', 'Left', 'Right', 'Home'];
const name = (i: number): string => NAMES[i] ?? `button ${i}`;

/** One slot of the list as last seen. */
export interface Slot {
  place: number;
  index: number | null;
  id: string;
  connected: boolean;
  mapping: string;
  timestamp: number;
  /** The buttons down, by index, and each one's value. */
  down: Map<number, number>;
  axes: number[];
  /** When (the page's clock) the timestamp last moved, and anything down last changed. */
  timestampMoved: number;
  changed: number;
  /** Whether it is noted as standing still now. */
  still: boolean;
  /** Whether it is the pad the game reads now. */
  read: boolean;
}

export class PadWatch {
  readonly slots: (Slot | null)[] = [];
  readonly log: string[] = [];
  private readonly played = new Played();
  private start: number | null = null;
  private lastFrame: number | null = null;

  /** A line in the log, at `now`. */
  note(now: number, text: string): void {
    this.start ??= now;
    this.log.push(`${((now - this.start) / 1000).toFixed(3).padStart(9)}s  ${text}`);
    if (this.log.length > KEEP) this.log.splice(0, this.log.length - KEEP);
  }

  /** The browser's list (navigator.getGamepads) read at frame `now`. */
  step(list: ArrayLike<Gamepad | null> | null | undefined, now: number): void {
    this.start ??= now;
    if (this.lastFrame !== null && now - this.lastFrame > LATE_MS)
      this.note(now, `no frame for ${Math.round(now - this.lastFrame)} ms (the page held up, or hidden)`);
    this.lastFrame = now;
    const length = list?.length ?? 0;
    const connected: Gamepad[] = [];
    for (let place = 0; place < Math.max(length, this.slots.length); place++) {
      const pad = place < length ? (list![place] ?? null) : null;
      const was = this.slots[place] ?? null;
      if (!pad) {
        if (was) this.note(now, `slot ${place}: emptied (was ${was.id || 'unnamed'})`);
        this.slots[place] = null;
        continue;
      }
      if (pad.connected) connected.push(pad);
      const slot = this.read(pad, place, was, now);
      this.slots[place] = slot;
    }
    this.slots.length = length;
    const [reading] = this.played.pick(connected);
    for (const slot of this.slots) {
      if (!slot) continue;
      const now_ = reading !== undefined && connected.indexOf(reading) >= 0 && slotOf(reading, slot);
      if (now_ && !slot.read) this.note(now, `slot ${slot.place}: now the pad the game reads`);
      slot.read = now_;
    }
  }

  /** One pad, in `place`, against how it was. */
  private read(pad: Gamepad, place: number, was: Slot | null, now: number): Slot {
    const down = new Map<number, number>();
    for (let i = 0; i < pad.buttons.length; i++) {
      const b = pad.buttons[i];
      if (b?.pressed) down.set(i, b.value ?? 1);
    }
    const axes: number[] = [];
    for (let i = 0; i < pad.axes.length; i++) axes.push(pad.axes[i] ?? 0);
    const index = typeof pad.index === 'number' ? pad.index : null;
    const timestamp = typeof pad.timestamp === 'number' ? pad.timestamp : 0;
    const fresh = !was || was.id !== pad.id || was.index !== index;
    const tag = `slot ${place}`;
    if (fresh) {
      this.note(
        now,
        `${tag}: ${was ? 'now' : 'filled by'} "${pad.id}" (index ${index ?? '-'}, ${pad.mapping || 'no'} mapping, ${pad.connected ? 'connected' : 'not connected'})`,
      );
      const held = [...down.keys()].map(name);
      if (held.length) this.note(now, `${tag}: seen with ${held.join(', ')} down`);
    } else {
      if (was.connected !== pad.connected) this.note(now, `${tag}: ${pad.connected ? 'connected' : 'not connected'}`);
      for (const i of down.keys()) if (!was.down.has(i)) this.note(now, `${tag}: ${name(i)} down`);
      for (const i of was.down.keys()) if (!down.has(i)) this.note(now, `${tag}: ${name(i)} up`);
      axes.forEach((v, i) => {
        const [a, b] = [side(was.axes[i] ?? 0), side(v)];
        if (a !== b)
          this.note(now, `${tag}: axis ${i} ${b === 0 ? 'back to the middle' : `pushed ${b < 0 ? '-' : '+'}`} (${v.toFixed(2)})`);
      });
    }
    const stateSame = !fresh && sameDown(was.down, down) && was.axes.every((v, i) => side(v) === side(axes[i] ?? 0));
    const timestampMoved = fresh || timestamp !== was.timestamp ? now : was.timestampMoved;
    const holding = down.size > 0 || axes.some((v) => Math.abs(v) > PUSHED);
    const still = holding && now - timestampMoved >= STILL_MS;
    if (!fresh && still && !was.still)
      this.note(now, `${tag}: timestamp still for ${Math.round(now - timestampMoved)} ms with something down`);
    if (!fresh && !still && was.still) this.note(now, `${tag}: timestamp moving again`);
    return {
      place,
      index,
      id: pad.id,
      connected: pad.connected,
      mapping: pad.mapping,
      timestamp,
      down,
      axes,
      timestampMoved,
      changed: stateSame ? was.changed : now,
      still,
      read: was?.read ?? false,
    };
  }

  /** The whole record as plain text, at `now`, after `header` lines (the browser, the page's focus). */
  report(now: number, header: string[]): string {
    const lines = [...header, ''];
    if (!this.slots.some((s) => s)) lines.push('No pads listed by the browser.');
    this.slots.forEach((slot, place) => {
      if (!slot) {
        lines.push(`slot ${place}: empty`);
        return;
      }
      const down = [...slot.down].map(([i, v]) => (v === 1 ? name(i) : `${name(i)} ${v.toFixed(2)}`));
      lines.push(
        `slot ${place}: "${slot.id}"${slot.read ? '  <- the pad the game reads' : ''}`,
        `  index ${slot.index ?? '-'}, ${slot.mapping || 'no'} mapping, ${slot.connected ? 'connected' : 'not connected'}`,
        `  timestamp ${slot.timestamp.toFixed(1)}, moved ${Math.round(now - slot.timestampMoved)} ms ago${slot.still ? ' (still, with something down)' : ''}`,
        `  down: ${down.join(', ') || 'nothing'}`,
        `  axes: ${slot.axes.map((v) => v.toFixed(2)).join(' ') || 'none'}`,
      );
    });
    lines.push('', `Log (the last ${KEEP} lines):`, ...this.log);
    return lines.join('\n');
  }
}

/** Which side of its middle an axis is pushed past half way: -1, 0 or 1. */
const side = (v: number): number => (v < -PUSHED ? -1 : v > PUSHED ? 1 : 0);

const sameDown = (a: Map<number, number>, b: Map<number, number>): boolean => a.size === b.size && [...a.keys()].every((k) => b.has(k));

/** Whether `pad` is the one in `slot`. */
const slotOf = (pad: Gamepad, slot: Slot): boolean =>
  pad.id === slot.id && (typeof pad.index === 'number' ? pad.index : null) === slot.index;
