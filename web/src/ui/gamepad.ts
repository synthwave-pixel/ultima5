/**
 * gamepad.ts
 *
 * A gamepad through the browser's Gamepad API, in the standard mapping:
 * the d-pad (or the left stick) as the arrow keys, repeating while held
 * as a held key does; A, B, X, Y, Start (Menu) and Select (View) as the
 * controller codes the game reads (game/io.ts Pad); and the right stick, left or right, as a turn (TURN_LEFT,
 * TURN_RIGHT), which only a dungeon heeds.
 */

import { K, Pad, TURN_LEFT, TURN_RIGHT } from '../game/io.ts';

const REPEAT_FIRST_MS = 300;
const REPEAT_MS = 130;
const DEADZONE = 0.5;
/** A turn held on the right stick repeats slower than a step: a quarter turn is a lot to overshoot. */
const TURN_FIRST_MS = 450;
const TURN_MS = 350;

/** Standard-mapping button index to what it sends. */
const BUTTONS: [number, number][] = [
  [0, Pad.A],
  [1, Pad.B],
  [2, Pad.X],
  [3, Pad.Y],
  [9, Pad.Start],
  [8, Pad.Select],
];
const DPAD: [number, number][] = [
  [12, K.Up],
  [13, K.Down],
  [14, K.Left],
  [15, K.Right],
];

export class GamepadInput {
  private held = new Map<number, number>();
  private nextRepeat = 0;
  private direction = 0;
  private turn = 0;
  private nextTurn = 0;

  constructor(private readonly send: (code: number, held?: boolean) => void) {
    const poll = (now: number): void => {
      this.poll(now);
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  private poll(now: number): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = pads.find((p) => p && p.connected);
    if (!pad) return;
    for (const [i, code] of BUTTONS) {
      const down = pad.buttons[i]?.pressed ?? false;
      if (down && !this.held.has(i)) {
        this.held.set(i, now);
        this.send(code);
      } else if (!down) this.held.delete(i);
    }
    let dir = 0;
    for (const [i, code] of DPAD) if (pad.buttons[i]?.pressed) dir = code;
    const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    if (dir === 0 && Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? K.Left : K.Right) : ay < 0 ? K.Up : K.Down;
    }
    // The right stick (axes 2 and 3 in the standard mapping), across: a turn, sent once and again while held.
    const rx = pad.axes[2] ?? 0;
    const turn = Math.abs(rx) > DEADZONE && Math.abs(rx) > Math.abs(pad.axes[3] ?? 0) ? (rx < 0 ? TURN_LEFT : TURN_RIGHT) : 0;
    if (turn !== this.turn) {
      this.turn = turn;
      if (turn !== 0) {
        this.send(turn);
        this.nextTurn = now + TURN_FIRST_MS;
      }
    } else if (turn !== 0 && now >= this.nextTurn) {
      this.send(turn, true);
      this.nextTurn = now + TURN_MS;
    }
    if (dir !== this.direction) {
      this.direction = dir;
      if (dir !== 0) {
        this.send(dir);
        this.nextRepeat = now + REPEAT_FIRST_MS;
      }
    } else if (dir !== 0 && now >= this.nextRepeat) {
      this.send(dir, true);
      this.nextRepeat = now + REPEAT_MS;
    }
  }
}
