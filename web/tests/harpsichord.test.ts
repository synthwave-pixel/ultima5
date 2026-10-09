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
  it('opens its keyboard when walked into, and B leaves it', async () => {
    // On the stool north of the harpsichord at (17, 18), its one open side (walls west and south, a plant east),
    // walking south into it.
    const { g, p, shown } = await study(17, 17);
    await keys(g, p, [K.Down, () => (shown.length ? undefined : K.Down), Pad.B]);
    expect([g.s.x, g.s.y]).toEqual([17, 17]);
    expect(shown[0]).toMatchObject({ at: 4, pressed: null, pops: [] });
    expect(shown.at(-1)).toBeNull();
  });

  it('plays the key under the bar, its number popping up, and the number keys play too', async () => {
    const { g, p, shown } = await study(17, 17);
    await keys(g, p, [K.Down, K.Right, Pad.A, digit(2), Pad.B]);
    const played = shown.filter((v): v is HarpView => v !== null).at(-1);
    expect(played?.pops.map((q) => q.key)).toEqual([5, 1]);
    expect(played?.at).toBe(1);
  });

  it('puts a gold dot on the next note of the tune for one who knows it', async () => {
    const { g, p, shown } = await study(17, 17);
    lesson(g);
    const tune = [...g.data.bytes(0x275a, 0xd)];
    // A wrong note first (1), to start the tune afresh; then its first two notes.
    await keys(g, p, [K.Down, digit(1), digit(tune[0]), digit(tune[1]), Pad.B]);
    const dots = shown.filter((v): v is HarpView => v !== null).map((v) => v.dot);
    expect(dots.slice(-3)).toEqual([tune[0] - 1, tune[1] - 1, tune[2] - 1]);
  });

  it('has no dot without the lesson, nor once the box is had', async () => {
    const { g, p, shown } = await study(17, 17);
    await keys(g, p, [K.Down, Pad.B]);
    expect(shown[0]?.dot).toBe(-1);
    const again = await study(17, 17);
    lesson(again.g);
    again.g.s.sandalwoodBox = 1;
    await keys(again.g, again.p, [K.Down, Pad.B]);
    expect(again.shown[0]?.dot).toBe(-1);
  });

  it('holds the music while the keyboard is up, and lets it go when it closes', async () => {
    const { g, p, shown } = await study(17, 17);
    const holds: [string, boolean][] = [];
    g.sound.setHeld = (reason, held) => void holds.push([reason, held]);
    let heldWhileOpen = false;
    await keys(g, p, [
      K.Down,
      () => {
        if (!shown.length) return K.Down;
        heldWhileOpen = holds.at(-1)?.[1] === true;
        return undefined;
      },
      Pad.B,
    ]);
    expect(heldWhileOpen).toBe(true);
    expect(holds).toEqual([
      ['harpsichord', true],
      ['harpsichord', false],
    ]);
  });

  it('does not open the way for a wrong note, the rest played on from it, the dot back at the start', async () => {
    const { g, p, shown } = await study(17, 17);
    lesson(g);
    const tune = [...g.data.bytes(0x275a, 0xd)];
    const wall = g.map[0xd * 32 + 0x11];
    // The first four notes, a wrong one (4), then the rest from where the player was.
    await keys(g, p, [K.Down, digit(1), ...tune.slice(0, 4).map(digit), digit(4), ...tune.slice(4).map(digit), Pad.B]);
    expect(g.map[0xd * 32 + 0x11]).toBe(wall);
    const views = shown.filter((v): v is HarpView => v !== null);
    expect(views[1 + 1 + 4 + 1 - 1]?.dot).toBe(tune[0] - 1);
  });

  it('takes the first note played again as the tune begun again (as 1988 has it): the dot stays', async () => {
    const { g, p, shown } = await study(17, 17);
    lesson(g);
    const tune = [...g.data.bytes(0x275a, 0xd)];
    const wall = g.map[0xd * 32 + 0x11];
    await keys(g, p, [K.Down, digit(1), digit(tune[0]), digit(tune[0]), ...tune.slice(1).map(digit)]);
    const views = shown.filter((v): v is HarpView => v !== null);
    expect(views.slice(2, 4).map((v) => v.dot)).toEqual([tune[1] - 1, tune[1] - 1]);
    expect(g.map[0xd * 32 + 0x11]).not.toBe(wall);
    expect(shown.at(-1)).toBeNull();
  });

  it('has no dot once the way is open', async () => {
    const { g, p, shown } = await study(17, 17);
    lesson(g);
    g.map[0xd * 32 + 0x11] ^= 0xb;
    await keys(g, p, [K.Down, Pad.B]);
    expect(shown[0]?.dot).toBe(-1);
  });
});
