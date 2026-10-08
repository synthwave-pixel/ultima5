import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Appearance, DEFAULT_APPEARANCE, LADY } from '../src/game/appearance.ts';
import { Intro, SCENE_MAP } from '../src/game/intro.ts';
import { localSave } from '../src/game/storage.ts';
import { newGame } from './helpers.ts';

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

/** The title's little scenes (Intro.view) for `polls` looks at the keys, in a look and tile set, a game saved or not. */
async function watch(options: { tileSet: 'standard' | 'original'; tiles: string }, saved: Appearance | null, polls = 300) {
  const { g, p } = newGame();
  Object.assign(g.options, options);
  store.clear();
  if (saved) {
    g.appearance = saved;
    g.s.members[0].gender = LADY;
    localSave.write(g);
    g.appearance = { ...DEFAULT_APPEARANCE };
  }
  const drawn: number[] = [];
  const worn: [Appearance, boolean | undefined][] = [];
  const leaders: unknown[] = [];
  Object.assign(p.fx, { tilePx: (t: number) => drawn.push(t) });
  Object.assign(p.draw, {
    avatar: (look: Appearance, lady?: boolean) => worn.push([look, lady]),
    leader: (at: unknown) => leaders.push(at),
  });
  let n = 0;
  let tiles = 0;
  Object.assign(p, { pollKey: () => (++n > polls ? 0x20 : 0), animateTiles: () => void tiles++ });
  await (new Intro(g) as unknown as { view(): Promise<void> }).view();
  const figure = (lo: number) => drawn.filter((t) => t >= lo && t <= lo + 3);
  return { avatar: figure(0x14c), shepherd: figure(0x150), worn, leaders, frames: n, tiles };
}

/** How often a figure drawn frame by frame changes its frame. */
const steps = (frames: number[]): number => frames.filter((t, i) => i > 0 && t !== frames[i - 1]).length;

describe('the title’s scenes', () => {
  const made: Appearance = { figure: 1, skin: 2, hair: 3, main: 4, trim: 5 };

  it('show the saved game’s Avatar as made, in the bedroom in the shepherd’s place, the mirror giving it back', async () => {
    const { avatar, shepherd, worn, leaders } = await watch({ tileSet: 'standard', tiles: 'modern-pc' }, made);
    expect(worn[0]).toEqual([made, true]);
    expect(avatar.length).toBeGreaterThan(0);
    expect(shepherd).toHaveLength(0);
    expect(leaders).toContainEqual(expect.objectContaining({ map: SCENE_MAP }));
    expect(leaders[leaders.length - 1]).toBeNull();
  });

  it('keep 1988’s shepherd at home where the tiles draw no Avatar of the player’s, or no game is saved', async () => {
    for (const [options, saved] of [
      [{ tileSet: 'standard', tiles: 'apple2' }, made],
      [{ tileSet: 'original', tiles: 'modern-pc' }, made],
      [{ tileSet: 'standard', tiles: 'modern-pc' }, null],
    ] as const) {
      const { avatar, shepherd, leaders } = await watch(options, saved);
      expect(shepherd.length, JSON.stringify(options)).toBeGreaterThan(0);
      expect(avatar).toHaveLength(0);
      expect(leaders).toHaveLength(0);
    }
  });

  it('step their figures at the game’s pace: half as often in the Modern look as in the PC (1988) look', async () => {
    const modern = steps((await watch({ tileSet: 'standard', tiles: 'apple2' }, null)).shepherd);
    const pc = steps((await watch({ tileSet: 'original', tiles: 'modern-pc' }, null)).shepherd);
    expect(modern).toBeGreaterThan(0);
    expect(modern).toBeLessThan(pc * 0.7);
  });

  it('move their water at the map’s pace in the Modern look, every other frame; each frame, as 1988’s, in the PC look', async () => {
    const modern = await watch({ tileSet: 'standard', tiles: 'modern-pc' }, null);
    const pc = await watch({ tileSet: 'original', tiles: 'modern-pc' }, null);
    // The same frames shown in each (as many looks at the keys): the Modern look's water half as often.
    expect(modern.frames).toBe(pc.frames);
    expect(Math.abs(modern.tiles * 2 - pc.tiles)).toBeLessThanOrEqual(2);
  });
});
