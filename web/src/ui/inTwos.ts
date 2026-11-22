/**
 * inTwos.ts
 *
 * Two ways held on a ship go two at a time (issue #40). Held together - up and right on the d-pad (gamepad.ts pairs
 * them on the world map), or two arrow keys each repeating as it is held - two ways go in turn, a step each. On foot,
 * on a horse or in the rowing boat that is a diagonal; but a ship turning spends the move (outdoors.ts turnParty), so
 * one way after the other only turned it, "Head North", "Head East", and it never moved. On a ship, then, a held way's
 * repeat goes the way the last went until that way has gone twice - turn, then sail - and then the other way held.
 * Every press is the player's own and goes as pressed; so does any key that is no way.
 */

import { K } from '../game/io.ts';

const WAYS = new Set<number>([K.Up, K.Down, K.Left, K.Right]);

/** How long after its last repeat another way is still taken for held: half a repeat's pace more, for the slack. */
const STILL_HELD_PACES = 1.5;

export class InTwos {
  /** The way last sent, and how many times in a row. */
  private last = 0;
  private run = 0;
  /** When each way was last pressed or repeated. */
  private readonly seen = new Map<number, number>();

  constructor(
    /** Whether two ways held go two at a time now: a ship at the world map's command prompt. */
    private readonly on: () => boolean,
    /** A held key's pace (holds.ts): how often each way held repeats. */
    private readonly pace: () => number,
  ) {}

  /** Key `k` about to reach the game - `held`, a held key's repeat - at `now` (ms): the key the game is given. */
  take(k: number, held: boolean, now: number): number {
    if (!WAYS.has(k)) return k;
    this.seen.set(k, now);
    let out = k;
    if (held && this.on()) {
      if (this.run < 2) out = this.last;
      else if (k === this.last) out = this.other(now) ?? k;
    }
    this.run = out === this.last ? this.run + 1 : 1;
    this.last = out;
    return out;
  }

  /** The way other than the last that is still held - repeated within the last pace and a half - if any. */
  private other(now: number): number | undefined {
    let best: number | undefined;
    let when = -Infinity;
    for (const [way, at] of this.seen)
      if (way !== this.last && now - at <= this.pace() * STILL_HELD_PACES && at > when) [best, when] = [way, at];
    return best;
  }
}
