/**
 * gamepad.ts
 *
 * A gamepad through the browser's Gamepad API, in the standard mapping:
 * the d-pad (or the left stick) as the arrow keys, repeating while held
 * as a held key does (holds.ts: at the Max input pace, only while the game waits for a key, and not once a new scene
 * has broken the hold, until it is let go); A, B, X, Y, Start (Menu) and Select (View) as the
 * controller codes the game reads (game/io.ts Pad); and the right stick, left or right, as a turn (TURN_LEFT,
 * TURN_RIGHT), which only a dungeon heeds. Every connected pad is read (pads.ts): a button down on any is down, and
 * the stick pushed furthest is the one taken. A stick's axis counts only once that pad's has been seen at rest, near
 * its middle: one that rests off it - a stick that drifts, or a trigger, which some pads report as an axis that rests
 * at -1 - would otherwise hold a way, or a turn, for as long as the pad is plugged in. The right stick is read only in
 * the standard mapping, the one that says which axes it is. Read at every refresh of the display; or, where reading is
 * lazy (Battery saver), only while a pad is connected - none, no reading at all, till the browser says one is.
 */

import { K, Pad, TURN_LEFT, TURN_RIGHT } from '../game/io.ts';
import { notePadSeen } from '../game/keyStore.ts';
import { HOLD_FIRST_MS, INPUT_PACES, type Holds } from './holds.ts';
import { connectedPads, Rest } from './pads.ts';
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
  [4, Pad.LB],
  [5, Pad.RB],
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
  /** When the direction held went down, and when it last counted. */
  private since = 0;
  private last = 0;
  private direction = 0;
  /** Whether a new scene has spent the direction, or the turn, held: neither repeats until let go. */
  private spent = false;
  private turnSpent = false;
  /** The holds' `breaks` when last read: a new count spends what is held. */
  private breaks = 0;
  private turn = 0;
  private nextTurn = 0;
  /** Each pad's axes seen at rest: only these are read. */
  private rest = new Rest();

  /** Whether a frame is asked for, to read the pad in. */
  private reading = false;

  constructor(
    private readonly send: (code: number, held?: boolean) => void,
    /** Whether the pad is read only while one is connected (Battery saver), not at every refresh. */
    private readonly lazy: () => boolean = () => false,
    /** The keyboard's holds: their pace, whether the game waits for a key, and the holds broken. */
    private readonly holds: Pick<Holds, 'pace' | 'breaks' | 'waiting'> = { pace: INPUT_PACES.medium, breaks: 0, waiting: () => true },
  ) {
    // A pad plugged in, or first pressed (where the browser tells of one only then): read from the next refresh, and
    // kept as seen, so a Steam Deck's note on Steam's controller layout is not said again (boot.ts steamNote).
    globalThis.addEventListener?.('gamepadconnected', () => {
      notePadSeen();
      this.wake();
    });
    this.wake();
  }

  /** Reading begun again, where it had stopped (a pad connected, or Battery saver turned off). */
  wake(): void {
    if (this.reading) return;
    this.reading = true;
    requestAnimationFrame((now) => {
      this.reading = false;
      this.poll(now);
      if (!this.lazy() || this.connected()) this.wake();
    });
  }

  /** Whether any pad is connected. */
  private connected(): boolean {
    return connectedPads().length > 0;
  }

  private poll(now: number): void {
    const pads = connectedPads();
    if (pads.length === 0) return;
    if (this.holds.breaks !== this.breaks) {
      this.breaks = this.holds.breaks;
      this.spent = this.turnSpent = true;
    }
    const waiting = this.holds.waiting();
    for (const [i, code] of BUTTONS) {
      const down = pads.some((pad) => pad.buttons[i]?.pressed ?? false);
      if (down && !this.held.has(i)) {
        this.held.set(i, now);
        this.send(code);
      } else if (!down) this.held.delete(i);
    }
    let dir = 0;
    for (const pad of pads) for (const [i, code] of DPAD) if (pad.buttons[i]?.pressed) dir = code;
    // Of every pad, the left stick pushed furthest; and the right stick (axes 2 and 3, in the standard mapping alone).
    let [ax, ay, rx, ry] = [0, 0, 0, 0];
    pads.forEach((pad, place) => {
      this.rest.note(pad, place);
      const axis = (i: number): number => this.rest.axis(pad, place, i);
      if (Math.max(Math.abs(axis(0)), Math.abs(axis(1))) > Math.max(Math.abs(ax), Math.abs(ay))) [ax, ay] = [axis(0), axis(1)];
      if (pad.mapping === 'standard' && Math.abs(axis(2)) > Math.abs(rx)) [rx, ry] = [axis(2), axis(3)];
    });
    if (dir === 0 && Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? K.Left : K.Right) : ay < 0 ? K.Up : K.Down;
    }
    // The right stick, across: a turn, sent once and again while held.
    const turn = Math.abs(rx) > DEADZONE && Math.abs(rx) > Math.abs(ry) ? (rx < 0 ? TURN_LEFT : TURN_RIGHT) : 0;
    if (turn !== this.turn) {
      this.turn = turn;
      this.turnSpent = false;
      if (turn !== 0) {
        this.send(turn);
        this.nextTurn = now + TURN_FIRST_MS;
      }
    } else if (turn !== 0 && !this.turnSpent && waiting && now >= this.nextTurn) {
      this.send(turn, true);
      this.nextTurn = now + TURN_MS;
    }
    if (dir !== this.direction) {
      this.direction = dir;
      this.spent = false;
      if (dir !== 0) {
        this.send(dir);
        this.since = this.last = now;
      }
    } else if (dir !== 0 && !this.spent && waiting && now - this.since >= HOLD_FIRST_MS && now - this.last >= this.holds.pace) {
      this.send(dir, true);
      this.last = now;
    }
  }
}
