import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K } from '../src/game/io.ts';
import { noteScene } from '../src/game/input.ts';
import { GamepadInput } from '../src/ui/gamepad.ts';
import { HOLD_FIRST_MS, Holds, INPUT_PACES } from '../src/ui/holds.ts';
import { DEFAULTS, normaliseOptions } from '../src/game/settings.ts';
import { newGame } from './helpers.ts';

/** Max input (holds.ts): a held key repeats at the game's pace, only while the game waits, until let go or broken. */
describe('a held key', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Holds over a game that waits for a key unless `busy`, with every repeat it took. */
  const setup = () => {
    let busy = false;
    let flushed = 0;
    const holds = new Holds(
      () => !busy,
      () => void flushed++,
      () => Date.now(),
    );
    const repeats: number[] = [];
    const hold = () => holds.hold('key:ArrowRight', () => repeats.push(Date.now()));
    return { holds, repeats, hold, setBusy: (b: boolean) => (busy = b), flushed: () => flushed };
  };

  it("repeats at the game's pace, the first after HOLD_FIRST_MS, until let go", async () => {
    const { holds, repeats, hold } = setup();
    hold();
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS - 1);
    expect(repeats).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(repeats).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(holds.pace * 4);
    expect(repeats).toHaveLength(5);
    holds.letGo('key:ArrowRight');
    await vi.advanceTimersByTimeAsync(1000);
    expect(repeats).toHaveLength(5);
  });

  it('repeats at the Max input pace chosen', async () => {
    const { holds, repeats, hold } = setup();
    holds.pace = INPUT_PACES.verySlow;
    hold();
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS + INPUT_PACES.verySlow * 5);
    expect(repeats).toHaveLength(6);
  });

  it('does not repeat while the game is busy, and repeats once when it waits again', async () => {
    const { repeats, hold, setBusy } = setup();
    setBusy(true);
    hold();
    await vi.advanceTimersByTimeAsync(2000);
    expect(repeats).toHaveLength(0);
    setBusy(false);
    await vi.advanceTimersByTimeAsync(16);
    expect(repeats).toHaveLength(1);
  });

  it('stops at a new scene, the keys queued dropped, until pressed again', async () => {
    const { holds, repeats, hold, flushed } = setup();
    hold();
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS);
    expect(repeats).toHaveLength(1);
    holds.breakAll(); // a fight begins
    expect(flushed()).toBe(1);
    expect(holds.breaks).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(repeats).toHaveLength(1);
    hold(); // pressed again
    await vi.advanceTimersByTimeAsync(HOLD_FIRST_MS);
    expect(repeats).toHaveLength(2);
  });
});

/** A gamepad's held direction (gamepad.ts): the keyboard's pace, only while the game waits, spent by a new scene. */
describe("a gamepad's held direction", () => {
  afterEach(() => vi.unstubAllGlobals());

  const run = (holds: { pace: number; breaks: number; waiting: () => boolean }, until: number, onPoll?: (ms: number) => void) => {
    const pad = {
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    };
    pad.buttons[15].pressed = true; // the d-pad's right, held
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    const sent: [number, number][] = [];
    const input = new GamepadInput(
      (code) => sent.push([code, now]),
      () => false,
      holds,
    ) as unknown as { poll(now: number): void };
    let now = 0;
    for (; now <= until; now += 16) {
      onPoll?.(now);
      input.poll(now);
    }
    return sent;
  };

  it('repeats at the pace after the first wait', () => {
    const sent = run({ pace: INPUT_PACES.slow, breaks: 0, waiting: () => true }, 1000);
    expect(sent[0]).toEqual([K.Right, 0]);
    expect(sent[1][1]).toBeGreaterThanOrEqual(HOLD_FIRST_MS);
    for (let i = 2; i < sent.length; i++) expect(sent[i][1] - sent[i - 1][1]).toBeGreaterThanOrEqual(INPUT_PACES.slow);
    expect(sent.length).toBe(1 + 1 + Math.floor((1000 - 256) / 208));
  });

  it('sends no repeat while the game is busy', () => {
    expect(run({ pace: 150, breaks: 0, waiting: () => false }, 1000)).toHaveLength(1);
  });

  it('is spent by a new scene, until let go', () => {
    const holds = { pace: 150, breaks: 0, waiting: () => true };
    const sent = run(holds, 2000, (ms) => ms === 400 && holds.breaks++);
    expect(sent.every(([, at]) => at < 400)).toBe(true);
  });
});

/** A new scene, as the command prompt sees it (input.ts noteScene): what breaks the holds, and what does not. */
describe('a new scene', () => {
  const setup = () => {
    const { g, p } = newGame();
    let broken = 0;
    (p as { breakHolds?: () => void }).breakHolds = () => void broken++;
    Object.assign(g.s, { mapId: 0, level: 0, x: 0x80, y: 0x80 });
    noteScene(g);
    return { g, broken: () => broken };
  };

  it('is not a step, nor a step across the wrapping seam', () => {
    const { g, broken } = setup();
    g.s.x++;
    noteScene(g);
    g.s.x = 0xff;
    g.stood = null; // standing at the seam
    noteScene(g);
    g.s.x = 0;
    noteScene(g);
    expect(broken()).toBe(0);
  });

  it('is a jump, a map entered or a fight begun', () => {
    const { g, broken } = setup();
    g.s.x += 5; // a moongate
    noteScene(g);
    expect(broken()).toBe(1);
    g.s.mapId = 2; // a town
    noteScene(g);
    expect(broken()).toBe(2);
    g.s.mapId = 0xff; // a fight
    noteScene(g);
    expect(broken()).toBe(3);
    g.s.x += 3; // a fight's own moves are no jump
    noteScene(g);
    expect(broken()).toBe(3);
  });
});

describe('the settings', () => {
  it('give Max input Medium and Smooth motion on by default, and drop a value this build does not have', () => {
    expect(DEFAULTS.maxInput).toBe('medium');
    expect(DEFAULTS.smoothMotion).toBe(true);
    expect(normaliseOptions({ maxInput: 'warp' as never, smoothMotion: 'yes' as never })).toEqual({});
    expect(normaliseOptions({ maxInput: 'fast', smoothMotion: false })).toEqual({ maxInput: 'fast', smoothMotion: false });
  });
});
