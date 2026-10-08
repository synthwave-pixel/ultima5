/**
 * pageMenu.ts
 *
 * A box of the page's own, in plain HTML over the canvas (the installer, the crash box), driven as the game's menus
 * are: the d-pad, the left stick, the arrow keys or WASD move a highlight from button to button, A, Enter or Space
 * presses the one highlighted, B or Escape backs out where there is anything to back out of. The mouse and a finger
 * press the buttons themselves. The gamepad is read only while such a box is up, and the game's own reading of it
 * (gamepad.ts) is not running then or is held off (screen.ts push): one reader at a time.
 */

export type Move = 'up' | 'down' | 'left' | 'right';
export type Press = Move | 'a' | 'b';

/** A button's place on the page, as getBoundingClientRect gives it. */
export interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The button the highlight moves to from `from` (an index into `places`, in the page's order), or `from` if none lies
 * that way. Left and right go to the one before or after in the page's order, so a row that wraps runs on into the
 * next as reading does; up and down to the nearest button wholly above or below, the one most nearly in line first.
 */
export function nextFocus(places: Place[], from: number, move: Move): number {
  if (places.length === 0) return -1;
  if (from < 0 || from >= places.length) return 0;
  if (move === 'left') return Math.max(0, from - 1);
  if (move === 'right') return Math.min(places.length - 1, from + 1);
  const at = places[from];
  const mid = at.left + at.width / 2;
  let best = from;
  let bestScore = Infinity;
  places.forEach((p, i) => {
    if (i === from) return;
    // Wholly above or below: a button beside this one, a pixel higher, is not "up".
    const gap = move === 'up' ? at.top - (p.top + p.height) : p.top - (at.top + at.height);
    if (gap < -1) return;
    const aside = Math.abs(p.left + p.width / 2 - mid);
    // A row's nearness counts more than a button's being in line: down from a wide button goes to the row under it.
    const score = Math.max(gap, 0) * 4 + aside;
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

/** What a key does in such a box, if anything: the keyboard as a controller. */
export function menuKey(key: string): Press | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    case 'Enter':
    case ' ':
      return 'a';
    case 'Escape':
      return 'b';
    default:
      return null;
  }
}

const REPEAT_FIRST_MS = 300;
const REPEAT_MS = 130;
const DEADZONE = 0.5;
/** Standard-mapping buttons: A and B, then the d-pad's up, down, left and right. */
const A = 0;
const B = 1;
const DPAD: [number, Move][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

/** What the gamepad was doing at the last look. */
export interface PadState {
  /** A and B as they were, and whether each was already held when the box came (it counts only once let go). */
  down: [boolean, boolean];
  stale: [boolean, boolean];
  move: Move | null;
  nextRepeat: number;
}

/** A gamepad as read: its buttons pressed or not, its axes. */
export interface PadReading {
  buttons: boolean[];
  axes: number[];
}

/** The state to start from, with what is held as the box comes (null: no gamepad). */
export function padStart(pad: PadReading | null): PadState {
  const a = pad?.buttons[A] ?? false;
  const b = pad?.buttons[B] ?? false;
  return { down: [a, b], stale: [a, b], move: null, nextRepeat: 0 };
}

/**
 * One look at the gamepad at `now` (ms): what it presses. A and B press as they are let go, as the notice's do
 * (notice.ts), so the game, reading the gamepad once the box has gone, does not take the same press for its own; one
 * held when the box came is not a press. A direction moves as it is pushed and again while held, as the game's d-pad
 * repeats (gamepad.ts).
 */
export function padStep(state: PadState, pad: PadReading | null, now: number): Press[] {
  const out: Press[] = [];
  const buttons = [pad?.buttons[A] ?? false, pad?.buttons[B] ?? false];
  buttons.forEach((down, i) => {
    if (state.down[i] && !down) {
      if (!state.stale[i]) out.push(i === 0 ? 'a' : 'b');
      state.stale[i] = false;
    }
    state.down[i] = down;
  });
  let move: Move | null = null;
  if (pad) {
    for (const [i, m] of DPAD) if (pad.buttons[i]) move = m;
    const [ax, ay] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    if (!move && Math.max(Math.abs(ax), Math.abs(ay)) > DEADZONE)
      move = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : ay < 0 ? 'up' : 'down';
  }
  if (move !== state.move) {
    state.move = move;
    if (move) {
      out.push(move);
      state.nextRepeat = now + REPEAT_FIRST_MS;
    }
  } else if (move && now >= state.nextRepeat) {
    out.push(move);
    state.nextRepeat = now + REPEAT_MS;
  }
  return out;
}

/** The first connected gamepad, read (as gamepad.ts takes the first). */
function readPad(): PadReading | null {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const pad = pads.find((p) => p && p.connected);
  return pad ? { buttons: pad.buttons.map((b) => b.pressed), axes: [...pad.axes] } : null;
}

/** The boxes up now, the last on top: only the top one answers. */
const boxes: object[] = [];

/** Whether a box of the page's own is up, whose the controller and keys are (screen.ts holds the game's off). */
export function menuUp(): boolean {
  return boxes.length > 0;
}

export interface MenuOptions {
  /** The buttons that can be highlighted now, in the page's order: hidden and disabled ones are left out here. */
  buttons: () => HTMLButtonElement[];
  /** The button highlighted when it comes, and whenever the highlighted one is gone. */
  first: () => HTMLButtonElement | null;
  /** B or Escape: backing out of a step, if there is one. */
  back?: () => void;
  /** A press taken before the buttons' own (true if taken): the crash box's up and down scroll its details. */
  take?: (press: Press) => boolean;
}

/** Whether a button can be highlighted: shown, laid out, and not disabled. */
export function usable(b: HTMLButtonElement): boolean {
  return !b.disabled && !b.hidden && b.getClientRects().length > 0;
}

/**
 * Drive the buttons in `root` as a menu until the returned function is called: a highlight (the class `at`) on the
 * focused one, moved and pressed by the gamepad and the keys. Every key is the box's while it is on top (in the
 * capture phase, before the game's own listeners); a key with Ctrl or Cmd keeps its own use (copying).
 */
export function driveMenu(root: HTMLElement, opts: MenuOptions): () => void {
  const me = {};
  boxes.push(me);
  const top = (): boolean => boxes[boxes.length - 1] === me;
  const current = (): HTMLButtonElement | null => {
    const list = opts.buttons();
    const f = document.activeElement;
    return list.find((b) => b === f) ?? null;
  };
  const mark = (): void => {
    const on = current();
    for (const b of root.querySelectorAll('button.at')) if (b !== on) b.classList.remove('at');
    on?.classList.add('at');
  };
  const focus = (b: HTMLButtonElement | null): void => {
    b?.focus();
    mark();
  };
  const press = (p: Press): void => {
    if (opts.take?.(p)) return;
    if (p === 'b') return opts.back?.();
    const list = opts.buttons();
    const on = current();
    if (!on) return focus(opts.first() ?? list[0] ?? null);
    if (p === 'a') return on.click();
    const i = nextFocus(
      list.map((b) => b.getBoundingClientRect()),
      list.indexOf(on),
      p,
    );
    focus(list[i] ?? on);
  };

  // The highlight follows the focus wherever it goes (a click, Tab, the page moving it).
  const unmark = (): void => queueMicrotask(mark);
  root.addEventListener('focusin', mark);
  root.addEventListener('focusout', unmark);
  focus(opts.first());

  const keydown = (e: KeyboardEvent): void => {
    if (!top()) return;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      return press(e.shiftKey ? 'left' : 'right');
    }
    const p = menuKey(e.key);
    if (!p) return;
    e.preventDefault();
    // A held key repeats a move, as the d-pad does; a held A or B is one press.
    if (e.repeat && (p === 'a' || p === 'b')) return;
    press(p);
  };
  // The key's let-go is the box's too: Space and Enter press the button here, not again as the browser would.
  const keyup = (e: KeyboardEvent): void => {
    if (!top()) return;
    e.stopPropagation();
    if (menuKey(e.key)) e.preventDefault();
  };
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);

  const state = padStart(readPad());
  let focused: Element | null = null;
  let polling = requestAnimationFrame(function poll(now) {
    const presses = padStep(state, readPad(), now);
    if (top()) presses.forEach(press);
    // The focus moved by the page itself (Choose again, the installer's question) is followed too: a window without
    // the focus tells it nothing of that.
    if (document.activeElement !== focused) {
      focused = document.activeElement;
      mark();
    }
    polling = requestAnimationFrame(poll);
  });

  return () => {
    cancelAnimationFrame(polling);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('keyup', keyup, true);
    root.removeEventListener('focusin', mark);
    root.removeEventListener('focusout', unmark);
    const i = boxes.indexOf(me);
    if (i >= 0) boxes.splice(i, 1);
  };
}
