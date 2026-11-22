/**
 * gamepad.ts
 *
 * A gamepad through the browser's Gamepad API, in the standard mapping:
 * the d-pad (or the left stick) as the arrow keys, repeating while held
 * as a held key does (holds.ts: at the Max input pace, only while the game waits for a key, and not once a new scene
 * has broken the hold, until it is let go); A, B, X, Y, Start (Menu) and Select (View) as the
 * controller codes the game reads (game/io.ts Pad); and the right stick, left or right, as a turn (TURN_LEFT,
 * TURN_RIGHT), which only a dungeon heeds. Every connected pad is watched, and the one played last is read (pads.ts
 * Played): another pad listed - a remote, a Steam Deck's own controls, or a pad the browser keeps listed though it
 * reports no more, frozen with a way held - holds nothing while it sits unchanged. Two neighbouring ways held on the
 * d-pad where `diagonals` says (the game's GameCore.pairsWays: Ultima V's world map), the two go in turn at the game's
 * pace, as two arrow keys held do (issue #40). B held passes again and again where `passes` says (GameCore.passRepeats:
 * Ultima V's command prompt waiting, outside a fight), as Space held does; no other
 * button repeats, nor B anywhere else, where it backs out or says No. A stick's axis counts only once that pad's has been seen at rest, near
 * its middle: one that rests off it - a stick that drifts, or a trigger, which some pads report as an axis that rests
 * at -1 - would otherwise hold a way, or a turn, for as long as the pad is plugged in. The right stick is read only in
 * the standard mapping, the one that says which axes it is. Read at every refresh of the display; or, where reading is
 * lazy (Battery saver), only while a pad is connected - none, no reading at all, till the browser says one is.
 */

import { K, Pad, TURN_LEFT, TURN_RIGHT } from '../game/io.ts';
import { notePadSeen } from '../game/keyStore.ts';
import { HOLD_FIRST_MS, INPUT_PACES, type Holds } from './holds.ts';
import { connectedPads, Played } from './pads.ts';
import { windowFocused } from './windowFocus.ts';
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
  /** The pad played last, and each pad's axes seen at rest: only these are read. */
  private played = new Played();
  /** Two neighbouring ways held in turn (`diagonals`): the pair, the one to send next; null for one way. */
  private pair: [number, number] | null = null;
  private turnNext = 0;
  /** B held: when it went down and last counted, and whether a new scene has spent it. */
  private bSince = 0;
  private bLast = 0;
  private bSpent = false;

  /** Whether a frame is asked for, to read the pad in. */
  private reading = false;
  /** Whether the window was out of focus at the last read: nothing sent (poll). */
  private away = false;

  constructor(
    private readonly send: (code: number, held?: boolean) => void,
    /** Whether the pad is read only while one is connected (Battery saver), not at every refresh. */
    private readonly lazy: () => boolean = () => false,
    /** The keyboard's holds: their pace, whether the game waits for a key, and the holds broken. */
    private readonly holds: Pick<Holds, 'pace' | 'breaks' | 'waiting'> = { pace: INPUT_PACES.medium, breaks: 0, waiting: () => true },
    /** Whether two neighbouring ways held on the d-pad go in turn (the game's pairsWays: Ultima V's world map). */
    private readonly diagonals: () => boolean = () => false,
    /** Whether B held passes again now (the game's passRepeats: Ultima V's command prompt, outside a fight). */
    private readonly passes: () => boolean = () => false,
    /** Whether the window has the focus: only then is the pad's state sent (windowFocus.ts). */
    private readonly focused: () => boolean = windowFocused,
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

  /**
   * The pads read at `now`. Out of focus, nothing is sent - another window's the press - though what is held is kept
   * as held, and spent: a button or a way held as the focus comes back counts once let go and pressed again.
   */
  private poll(now: number): void {
    this.away = !this.focused();
    this.read(now);
    if (this.away) this.spent = this.turnSpent = this.bSpent = true;
  }

  /** What the pad's state sends, the window's focus had (poll). */
  private emit(code: number, held?: boolean): void {
    if (!this.away) this.send(code, held);
  }

  private read(now: number): void {
    const all = connectedPads();
    if (all.length === 0) return;
    // The pad played last; none yet, nothing down.
    const pads = this.played.pick(all);
    if (this.holds.breaks !== this.breaks) {
      this.breaks = this.holds.breaks;
      this.spent = this.turnSpent = this.bSpent = true;
    }
    const waiting = this.holds.waiting();
    for (const [i, code] of BUTTONS) {
      const down = pads.some((pad) => pad.buttons[i]?.pressed ?? false);
      if (down && !this.held.has(i)) {
        this.held.set(i, now);
        this.emit(code);
        if (code === Pad.B) {
          this.bSince = this.bLast = now;
          this.bSpent = false;
        }
      } else if (!down) this.held.delete(i);
      else if (
        code === Pad.B &&
        !this.bSpent &&
        waiting &&
        now - this.bSince >= HOLD_FIRST_MS &&
        now - this.bLast >= this.holds.pace &&
        this.passes()
      ) {
        // Held at the command prompt: Pass again, as Space held does (issue #40).
        this.emit(code, true);
        this.bLast = now;
      }
    }
    let dir = 0;
    const held = new Set<number>();
    for (const pad of pads)
      for (const [i, code] of DPAD)
        if (pad.buttons[i]?.pressed) {
          dir = code;
          held.add(code);
        }
    // One way up or down and one across, held together, where they go in turn.
    const upright = [K.Up, K.Down].filter((c) => held.has(c));
    const across = [K.Left, K.Right].filter((c) => held.has(c));
    // Asked as a pair begins: one under way goes on (the game says no while busy with a step; a new scene breaks it).
    const going = this.pair !== null && this.pair[0] === upright[0] && this.pair[1] === across[0];
    if (upright.length === 1 && across.length === 1 && (going || this.diagonals())) {
      this.inTurn(upright[0], across[0], now, waiting);
      return;
    }
    // The left stick; and the right stick (axes 2 and 3, in the standard mapping alone).
    let [ax, ay, rx, ry] = [0, 0, 0, 0];
    for (const pad of pads) {
      const axis = (i: number): number => this.played.rest.axis(pad, all.indexOf(pad), i);
      [ax, ay] = [axis(0), axis(1)];
      if (pad.mapping === 'standard') [rx, ry] = [axis(2), axis(3)];
    }
    if (dir === 0 && Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE) {
      dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? K.Left : K.Right) : ay < 0 ? K.Up : K.Down;
    }
    // The right stick, across: a turn, sent once and again while held.
    const turn = Math.abs(rx) > DEADZONE && Math.abs(rx) > Math.abs(ry) ? (rx < 0 ? TURN_LEFT : TURN_RIGHT) : 0;
    if (turn !== this.turn) {
      this.turn = turn;
      this.turnSpent = false;
      if (turn !== 0) {
        this.emit(turn);
        this.nextTurn = now + TURN_FIRST_MS;
      }
    } else if (turn !== 0 && !this.turnSpent && waiting && now >= this.nextTurn) {
      this.emit(turn, true);
      this.nextTurn = now + TURN_MS;
    }
    // One of a pair still held, the other let go: it goes on as it was, with no step of its own for the letting go.
    if (this.pair && this.pair.includes(dir)) this.direction = dir;
    this.pair = null;
    if (dir !== this.direction) {
      this.direction = dir;
      this.spent = false;
      if (dir !== 0) {
        this.emit(dir);
        this.since = this.last = now;
      }
    } else if (dir !== 0 && !this.spent && waiting && now - this.since >= HOLD_FIRST_MS && now - this.last >= this.holds.pace) {
      this.emit(dir, true);
      this.last = now;
    }
  }

  /**
   * `upright` and `across` held together: a pair new from nothing, the up or down way at once and the other a pace
   * later; the second of the two pressed, a press, the first next; then the two in turn, a pace apart, each only
   * while the game waits.
   */
  private inTurn(upright: number, across: number, now: number, waiting: boolean): void {
    const was = this.pair;
    if (!was || was[0] !== upright || was[1] !== across) {
      this.pair = [upright, across];
      this.spent = false;
      // The one of the two not already held (the press just made), or, both new, the up or down way.
      const first = this.direction === upright ? across : upright;
      this.emit(first);
      this.turnNext = first === upright ? across : upright;
      this.direction = first;
      this.since = this.last = now;
      return;
    }
    if (this.spent || !waiting || now - this.last < this.holds.pace) return;
    this.emit(this.turnNext, true);
    this.direction = this.turnNext;
    this.turnNext = this.turnNext === upright ? across : upright;
    this.last = now;
  }
}
