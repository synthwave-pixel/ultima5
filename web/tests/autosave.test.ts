import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { journeyOnward, runGame } from '../src/game/run.ts';
import { localSave } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';
import { command, fly, Landed } from './pilot.ts';

/** The browser's local storage, in memory. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

/** The ultima3 port's autosave: going into a place and coming out of one, the party saved outside it. */
describe('the game saves itself at doors', () => {
  it("coming out of Iolo's hut, and going back in", async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    const before = localSave.writes;
    const saved: { mapId: number; x: number; y: number }[] = [];
    const write = localSave.write.bind(localSave);
    localSave.write = (game) => {
      saved.push({ mapId: game.s.mapId, x: game.s.x, y: game.s.y });
      return write(game);
    };
    try {
      fly(
        g,
        p,
        [
          // Out through the door and off the map's edge, answering that yes, the party would leave...
          (game) => (game.s.mapId === 0 ? undefined : game.menuShown ? Pad.A : K.Down),
          // ...and straight back in.
          command('Enter'),
          (game) => (game.s.mapId === 0 ? Pad.A : undefined),
        ],
        80,
      );
      await runGame(g).catch((e: unknown) => {
        if (!(e instanceof Landed)) throw e;
      });
    } finally {
      localSave.write = write;
    }
    const hut = g.data.locations[12];
    expect(localSave.writes - before).toBe(2);
    // Both times it is the party outside that is saved, on the hut's square: never the inside of a place.
    expect(saved).toEqual([
      { mapId: 0, x: hut.x, y: hut.y },
      { mapId: 0, x: hut.x, y: hut.y },
    ]);
    expect(p.log.match(/\(saved\)/g)).toHaveLength(2);
    expect(g.s.mapId).toBe(13);
  });
});

describe('a window opened to look at a place (the tiles page: ?peek)', () => {
  it('saves nothing, and says nothing of saving', async () => {
    const { g } = newGame();
    const { autosave } = await import('../src/game/storage.ts');
    g.s.mapId = 0;
    const before = localSave.writes;
    localSave.off = true;
    try {
      expect(autosave(g)).toBe(false);
      localSave.write(g);
    } finally {
      localSave.off = false;
    }
    expect(localSave.writes).toBe(before);
  });
});

describe('the save note', () => {
  it('goes to the log, whatever window was being drawn in', async () => {
    const { autosave } = await import('../src/game/storage.ts');
    const { Win } = await import('../src/game/frame.ts');
    const { g } = newGame();
    journeyOnward(g);
    g.s.mapId = 0;
    g.text.select(Win.screen);
    g.text.moveTo(0, 1);
    expect(autosave(g)).toBe(true);
    expect(g.text.current).toBe(Win.screen);
    expect(g.text.screenText(1, 0, 0)).not.toBe('(');
  });
});
