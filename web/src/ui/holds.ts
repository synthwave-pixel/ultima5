/**
 * holds.ts
 *
 * Max input (Gameplay, the ultima3 port's): a key held down repeats at the game's own pace, not the system's - the
 * same for a keyboard, the touch pad and a gamepad (gamepad.ts reads `pace` and `breaks`) - and only while the game
 * is waiting for a key, so no repeats queue up to walk on after the thumb is lifted. A new scene (a fight begun or
 * ended, a town, dungeon or level entered or left, a moongate: input.ts noteScene) breaks every hold: a key still
 * down there does nothing more until it is let go and pressed again, so a run across the map does not walk on into
 * the fight.
 */

/** Max input's paces: the least time between two repeats of a held key, ms. Separate presses are never held back. */
export const INPUT_PACES = { verySlow: 250, slow: 200, medium: 150, fast: 130 } as const;
export type InputPace = keyof typeof INPUT_PACES;
export const INPUT_PACE_NAMES = Object.keys(INPUT_PACES) as InputPace[];
/** How the Gameplay menu names each pace: "V slow" fits its width where "Very slow" would not. */
export const INPUT_PACE_LABELS: Record<InputPace, string> = { verySlow: 'V slow', slow: 'Slow', medium: 'Medium', fast: 'Fast' };
/** A held key's first repeat comes after this long (a gamepad's and the touch pad's too). */
export const HOLD_FIRST_MS = 250;
/** How soon a held key looks again when the game was busy at its repeat: it repeats once the game waits. */
const HOLD_RECHECK_MS = 16;

interface Hold {
  /** When it last counted: its press, or its last repeat. */
  last: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class Holds {
  /** The least time between a held key's repeats (INPUT_PACES). */
  pace: number = INPUT_PACES.medium;
  /** How many holds have been broken (`breakAll`): a gamepad's reader, seeing it change, spends its own. */
  breaks = 0;
  private readonly held = new Map<string, Hold>();

  constructor(
    /** Whether the game is waiting for a key now. */
    readonly waiting: () => boolean,
    /** What to do when a new scene breaks the holds: the keys queued dropped. */
    private readonly onBreak: () => void = () => undefined,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /**
   * A key just pressed, held down by `id` (a keyboard's key, the touch pad): `repeat` it, the first time after
   * HOLD_FIRST_MS and then every `pace`, each only when the game is waiting for a key, until `letGo` or `breakAll`.
   */
  hold(id: string, repeat: () => void): void {
    this.letGo(id);
    const hold: Hold = { last: this.now(), timer: null };
    this.held.set(id, hold);
    const look = (ms: number): void => void (hold.timer = setTimeout(tick, ms));
    const tick = (): void => {
      const due = hold.last + this.pace - this.now();
      if (due > 0) return look(due);
      if (!this.waiting()) return look(HOLD_RECHECK_MS);
      hold.last = this.now();
      repeat();
      look(this.pace);
    };
    look(HOLD_FIRST_MS);
  }

  /** What `id` held is let go: it repeats no more. */
  letGo(id: string): void {
    const hold = this.held.get(id);
    if (!hold) return;
    if (hold.timer !== null) clearTimeout(hold.timer);
    this.held.delete(id);
  }

  /** Everything let go at once (the window lost focus, where the key-ups go elsewhere). */
  letGoAll(): void {
    for (const id of [...this.held.keys()]) this.letGo(id);
  }

  /** A new scene: whatever is held stops repeating, and the keys queued are dropped. */
  breakAll(): void {
    this.letGoAll();
    this.breaks++;
    this.onBreak();
  }
}
