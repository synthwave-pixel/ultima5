import { describe, expect, it } from 'vitest';
import type { Game } from '../src/game/game.ts';
import { K, Pad, type HarpView } from '../src/game/io.ts';
import { stashWorldActors } from '../src/game/outdoors.ts';
import { journeyOnward } from '../src/game/run.ts';
import { enterTown, loadLevel, townLoop } from '../src/game/town.ts';
import { newGame, type FakePlatform } from './helpers.ts';

class Done extends Error {}

/** In Lord British's study at noon, at (x, y), the keyboard's every drawing kept. */
async function study(x: number, y: number): Promise<{ g: Game; p: FakePlatform; shown: (HarpView | null)[] }> {
  const { g, p } = newGame();
  journeyOnward(g);
  const s = g.s;
  stashWorldActors(g);
  Object.assign(s, { mapId: 0x11, level: 0, x: 15, y: 30, hour: 12 });
  await enterTown(g, true);
  Object.assign(s, { level: 2, x, y });
  loadLevel(g, true);
  s.activeMember = 0;
  const shown: (HarpView | null)[] = [];
  g.draw.harpsichord = (v) => shown.push(v);
  return { g, p, shown };
}

/** Play the keys given (a function's keys till it gives undefined), then stop the game. */
async function keys(g: Game, p: FakePlatform, script: (number | (() => number | undefined))[]): Promise<void> {
  let at = 0;
  p.next = () => {
    for (;;) {
      if (at >= script.length) throw new Done();
      const step = script[at];
      if (typeof step === 'number') {
        at++;
        return step;
      }
      const k = step();
      if (k !== undefined) return k;
      at++;
    }
  };
  try {
    await townLoop(g);
  } catch (e) {
    if (!(e instanceof Done)) throw e;
  }
}

const digit = (n: number): number => 0x30 + n;

/** Kenneth's lesson, among the clues heard (journal.ts). */
const lesson = (g: Game): void => {
  g.notes.push({ who: 'Lord Kenneth', where: 'Greyhaven', text: 'The first phrase goes 678 987 8767653.', date: '' });
};

describe('the harpsichord', () => {
  it('opens its keyboard when walked into from the side, and B leaves it', async () => {
    // West of the harpsichord at (17, 18), walking east into it.
    const { g, p, shown } = await study(16, 18);
    await keys(g, p, [K.Right, () => (shown.length ? undefined : K.Right), Pad.B]);
    expect([g.s.x, g.s.y]).toEqual([16, 18]);
    expect(shown[0]).toMatchObject({ at: 4, pressed: null, pops: [] });
    expect(shown.at(-1)).toBeNull();
  });

  it('plays the key under the bar, its number popping up, and the number keys play too', async () => {
    const { g, p, shown } = await study(16, 18);
    await keys(g, p, [K.Right, K.Right, Pad.A, digit(2), Pad.B]);
    const played = shown.filter((v): v is HarpView => v !== null).at(-1);
    expect(played?.pops.map((q) => q.key)).toEqual([5, 1]);
    expect(played?.at).toBe(1);
  });

  it('puts a gold dot on the next note of the tune for one who knows it', async () => {
    const { g, p, shown } = await study(16, 18);
    lesson(g);
    const tune = [...g.data.bytes(0x275a, 0xd)];
    // A wrong note first (1), to start the tune afresh; then its first two notes.
    await keys(g, p, [K.Right, digit(1), digit(tune[0]), digit(tune[1]), Pad.B]);
    const dots = shown.filter((v): v is HarpView => v !== null).map((v) => v.dot);
    expect(dots.slice(-3)).toEqual([tune[0] - 1, tune[1] - 1, tune[2] - 1]);
  });

  it('has no dot without the lesson, nor once the box is had', async () => {
    const { g, p, shown } = await study(16, 18);
    await keys(g, p, [K.Right, Pad.B]);
    expect(shown[0]?.dot).toBe(-1);
    const again = await study(16, 18);
    lesson(again.g);
    again.g.s.sandalwoodBox = 1;
    await keys(again.g, again.p, [K.Right, Pad.B]);
    expect(again.shown[0]?.dot).toBe(-1);
  });

  it('has no dot once the way is open', async () => {
    const { g, p, shown } = await study(16, 18);
    lesson(g);
    g.map[0xd * 32 + 0x11] ^= 0xb;
    await keys(g, p, [K.Right, Pad.B]);
    expect(shown[0]?.dot).toBe(-1);
  });
});
