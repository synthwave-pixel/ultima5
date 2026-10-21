import { afterEach, describe, expect, it, vi } from 'vitest';
import { K, TURN_LEFT } from '../src/game/io.ts';
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
