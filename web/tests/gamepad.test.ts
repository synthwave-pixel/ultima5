import { afterEach, describe, expect, it, vi } from 'vitest';
import { K, Pad, TURN_LEFT, TURN_RIGHT } from '../src/game/io.ts';
import { GamepadInput } from '../src/ui/gamepad.ts';

/** A pad as the Gamepad API reports it: its mapping, its axes, no button pressed. */
const padOf = (mapping: string, axes: number[]) => ({
  connected: true,
  mapping,
  axes,
  buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
});

/** What a GamepadInput sends over a second of polls, the pad's axes set by `at` (ms) as it goes. */
function sent(mapping: string, at: (ms: number) => number[]): number[] {
  const out: number[] = [];
  let pad = padOf(mapping, at(0));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  const input = new GamepadInput((code) => out.push(code)) as unknown as { poll(now: number): void };
  for (let ms = 0; ms <= 1000; ms += 16) {
    pad = padOf(mapping, at(ms));
    input.poll(ms);
  }
  return out;
}

afterEach(() => vi.unstubAllGlobals());

/**
 * A stick's axis is read once it has been seen at rest (gamepad.ts): a pad whose trigger rests at -1 as an axis, or
 * whose stick drifts, sends nothing - no way held, no turn - where it once turned a dungeon, moved a menu's bar and
 * paged the townsman's box every third of a second, all by itself.
 */
describe("a gamepad's sticks", () => {
  it('send nothing from an axis that has never been at rest: a trigger at -1, a drifting stick', () => {
    expect(sent('', () => [0, 0, -1, -1])).toEqual([]); // not the standard mapping: axis 2 a trigger, resting
    expect(sent('standard', () => [0, 0, -0.8, 0])).toEqual([]); // the right stick drifting left
    expect(sent('standard', () => [0, -0.9, 0, 0])).toEqual([]); // the left stick, up
  });

  it('read a stick once it has rested: the left as the arrows, the right as a turn', () => {
    const up = sent('standard', (ms) => [0, ms < 100 ? 0 : -1, 0, 0]);
    expect(up[0]).toBe(K.Up);
    const turn = sent('standard', (ms) => [0, 0, ms < 100 ? 0 : -1, 0]);
    expect(turn[0]).toBe(TURN_LEFT);
    // Out of the standard mapping, the right stick is not read at all: which axes it is is not known.
    expect(sent('', (ms) => [0, 0, ms < 100 ? 0 : -1, 0])).toEqual([]);
  });
});

/** Read lazily (Battery saver), a pad is read only while one is connected: none, no frame asked for at all. */
describe('a gamepad read lazily', () => {
  /** The frames asked for, run one at a time by `next`. */
  const frames = (): { queued: number; next: () => void } => {
    const q: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => q.push(f));
    return {
      get queued() {
        return q.length;
      },
      next: () => q.shift()?.(performance.now()),
    };
  };

  it('asks for no frame with no pad connected, and reads every frame once one is, the pad sent from', () => {
    const f = frames();
    let pads: ReturnType<typeof padOf>[] = [];
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    const sent: number[] = [];
    const input = new GamepadInput(
      (c) => sent.push(c),
      () => true,
    );
    f.next(); // the first read, finding none
    expect(f.queued).toBe(0); // and asking no more
    pads = [padOf('standard', [0, 0, 0, 0])];
    input.wake(); // the browser's gamepadconnected
    f.next();
    expect(f.queued).toBe(1); // a pad: read at every refresh
    pads[0].buttons[0].pressed = true;
    f.next();
    expect(sent).toEqual([0x100]); // A
    pads = [];
    f.next();
    expect(f.queued).toBe(0); // unplugged: reading stops
  });

  it('reads at every refresh, pad or none, where it is not lazy', () => {
    const f = frames();
    vi.stubGlobal('navigator', { getGamepads: () => [] });
    new GamepadInput(
      () => undefined,
      () => false,
    );
    for (let i = 0; i < 3; i++) f.next();
    expect(f.queued).toBe(1);
  });
});

/**
 * Every connected pad is read, not only the browser's first (issue #19): a Shield's remote, or another device the
 * browser lists as a pad ahead of the controller played with, took every press of the controller's for itself; a
 * Steam Deck's own controls and an external pad are both played with. A button is down if down on any pad; the
 * direction is the one pushed furthest; each pad's sticks are read once that pad's own have been seen at rest.
 */
describe('several gamepads', () => {
  /** A pad as the Gamepad API reports it, at `index`, with `down` pressed. */
  const padAt = (index: number, mapping: string, axes: number[], down: number[] = []) => ({
    index,
    id: `pad ${index}`,
    connected: true,
    mapping,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })),
  });

  /** What a GamepadInput sends over a second of polls, the pads set by `at` (ms) as it goes. */
  const sentFrom = (at: (ms: number) => ReturnType<typeof padAt>[]): number[] => {
    const out: number[] = [];
    let pads = at(0);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    const input = new GamepadInput((code) => out.push(code)) as unknown as { poll(now: number): void };
    for (let ms = 0; ms <= 1000; ms += 16) {
      pads = at(ms);
      input.poll(ms);
    }
    return out;
  };

  /** A remote, listed first: no stick, nothing pressed. */
  const remote = () => padAt(0, '', []);

  it("takes the buttons of a pad listed after another, not only the first's", () => {
    const out = sentFrom((ms) => [remote(), padAt(1, 'standard', [0, 0, 0, 0], ms >= 100 ? [0] : [])]);
    expect(out).toEqual([Pad.A]);
  });

  it("takes the d-pad and the sticks of a pad listed after another, once that pad's have rested", () => {
    expect(sentFrom((ms) => [remote(), padAt(1, 'standard', [0, 0, 0, 0], ms >= 100 ? [14] : [])])[0]).toBe(K.Left);
    expect(sentFrom((ms) => [remote(), padAt(1, 'standard', [0, ms < 100 ? 0 : -1, 0, 0])])[0]).toBe(K.Up);
    expect(sentFrom((ms) => [remote(), padAt(1, 'standard', [0, 0, ms < 100 ? 0 : 1, 0])])[0]).toBe(TURN_RIGHT);
  });

  it("reads each pad's sticks only once its own have rested: one pad's rest is not another's", () => {
    // The first pad's sticks at rest; the second's left stick pushed up from the start, never at rest.
    expect(sentFrom(() => [padAt(0, 'standard', [0, 0, 0, 0]), padAt(1, 'standard', [0, -1, 0, 0])])).toEqual([]);
  });

  it('holds no way from one pad that rests off its middle while another is played with', () => {
    // A device resting with its axes at -1, listed first, and a pad pressed right on its d-pad, then let go.
    const out = sentFrom((ms) => [padAt(0, '', [-1, -1, -1, -1]), padAt(1, 'standard', [0, 0, 0, 0], ms >= 100 && ms < 200 ? [15] : [])]);
    expect(out).toEqual([K.Right]);
  });

  it('sends a button held on two pads once', () => {
    const out = sentFrom((ms) => [
      padAt(0, 'standard', [0, 0, 0, 0], ms >= 100 ? [0] : []),
      padAt(1, 'standard', [0, 0, 0, 0], ms >= 200 ? [0] : []),
    ]);
    expect(out).toEqual([Pad.A]);
  });

  it('takes the stick pushed furthest, of all the pads', () => {
    const out = sentFrom((ms) => [
      padAt(0, 'standard', [ms < 100 ? 0 : 0.6, 0, 0, 0]),
      padAt(1, 'standard', [0, ms < 100 ? 0 : -0.9, 0, 0]),
    ]);
    expect(out[0]).toBe(K.Up);
  });
});

/**
 * Two neighbouring ways held on the d-pad, on the world map (issue #40): the two in turn, at the game's pace, as two
 * arrow keys held on a keyboard go - a near diagonal, where the d-pad once went one way only and the player rocked it
 * back and forth. Elsewhere (a town, a fight, a dungeon, a question), and for two ways opposite, one way as before.
 */
describe('a diagonal held on the d-pad', () => {
  const [UP, DOWN, LEFT, RIGHT] = [12, 13, 14, 15];
  /** What is sent over `until` ms of polls (every 16 ms): the d-pad's buttons down by `at`, diagonals where `open`. */
  const run = (at: (ms: number) => number[], open = true, until = 1000, busy: (ms: number) => boolean = () => false) => {
    const out: { code: number; ms: number; held: boolean }[] = [];
    let down = at(0);
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i) })),
        },
      ],
    });
    const holds = { pace: 150, breaks: 0, waiting: () => !busy(now) };
    const input = new GamepadInput(
      (code, held = false) => out.push({ code, ms: now, held }),
      () => false,
      holds,
      () => open,
    ) as unknown as { poll(now: number): void };
    for (; now <= until; now += 16) {
      down = at(now);
      input.poll(now);
    }
    return out;
  };
  const codes = (out: { code: number }[]) => out.map((o) => o.code);

  it('goes the two ways in turn on the world map, both pressed together: the first at once, the next a pace later', () => {
    const out = run(() => [UP, RIGHT]);
    expect(codes(out).slice(0, 6)).toEqual([K.Up, K.Right, K.Up, K.Right, K.Up, K.Right]);
    expect(out[0]).toEqual({ code: K.Up, ms: 0, held: false });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].held).toBe(true);
      expect(out[i].ms - out[i - 1].ms).toBeGreaterThanOrEqual(150);
      expect(out[i].ms - out[i - 1].ms).toBeLessThan(150 + 16);
    }
  });

  it('takes the second way pressed as a press, then the two in turn', () => {
    const out = run((ms) => (ms < 200 ? [LEFT] : [LEFT, DOWN]));
    expect(out[0]).toEqual({ code: K.Left, ms: 0, held: false });
    const at = out.findIndex((o) => o.code === K.Down);
    expect(out[at]).toMatchObject({ code: K.Down, held: false });
    expect(out[at].ms).toBe(208); // the first poll with it down
    expect(codes(out.slice(at, at + 5))).toEqual([K.Down, K.Left, K.Down, K.Left, K.Down]);
  });

  it('goes on the one way still held when the other is let go, with no step of its own for the letting go', () => {
    const out = run((ms) => (ms < 500 ? [UP, RIGHT] : [RIGHT]));
    const after = out.filter((o) => o.ms >= 500);
    expect(after.every((o) => o.code === K.Right && o.held)).toBe(true);
    expect(after[0].ms - out.filter((o) => o.ms < 500).at(-1)!.ms).toBeGreaterThanOrEqual(150);
  });

  it('keeps the two in turn, no step extra, where the world map is not said while a step is taken', () => {
    // As the game is busy with each step, `diagonals` false then: the pair is not begun again on its return.
    const out: { code: number; ms: number; held: boolean }[] = [];
    let now = 0;
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === UP || i === RIGHT })),
        },
      ],
    });
    let busyUntil = -1;
    const holds = { pace: 150, breaks: 0, waiting: () => now >= busyUntil };
    const input = new GamepadInput(
      (code, held = false) => {
        out.push({ code, ms: now, held });
        busyUntil = now + 40; // each step takes a while
      },
      () => false,
      holds,
      () => now >= busyUntil,
    ) as unknown as { poll(now: number): void };
    for (; now <= 1000; now += 16) input.poll(now);
    expect(out.filter((o) => !o.held)).toHaveLength(1);
    expect(codes(out)).toEqual(codes(out).map((_, i) => (i % 2 === 0 ? K.Up : K.Right)));
  });

  it('goes one way only off the world map, as before', () => {
    expect(new Set(codes(run(() => [UP, RIGHT], false)))).toEqual(new Set([K.Right]));
  });

  it('goes one way only for two ways opposite, as before', () => {
    expect(new Set(codes(run(() => [LEFT, RIGHT])))).toEqual(new Set([K.Right]));
    expect(new Set(codes(run(() => [UP, DOWN])))).toEqual(new Set([K.Down]));
  });

  it('sends nothing more while the game is busy, then goes on in turn once it waits', () => {
    const out = run(
      () => [UP, RIGHT],
      true,
      1000,
      (ms) => ms > 0 && ms < 600,
    );
    expect(out.filter((o) => o.ms > 0 && o.ms < 600)).toEqual([]);
    expect(codes(out)).toEqual(codes(out).map((_, i) => (i % 2 === 0 ? K.Up : K.Right)));
  });
});
