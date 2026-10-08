import { describe, expect, it } from 'vitest';
import { updateFrame } from '../src/game/frame.ts';
import { enterTown } from '../src/game/town.ts';
import { newGame } from './helpers.ts';

/**
 * The figures' pace (frame.ts updateFrame, input.ts): a pass of the key-wait loop can leave the figures as they are,
 * as the Standard look does every other pass, while the tiles go on animating.
 */
describe('the figures’ pace', () => {
  const town = async (): Promise<ReturnType<typeof newGame>['g']> => {
    const { g } = newGame();
    Object.assign(g.s, { mapId: 1, level: 0, x: 15, y: 30 });
    await enterTown(g, true);
    Object.assign(g.s, { animate: 1, drawMap: 1 });
    return g;
  };
  const frames = (g: Awaited<ReturnType<typeof town>>): string => g.s.actors.map((a) => `${a.anim}:${a.b6}`).join(',');

  it('leaves the figures be on a pass without them, the tiles still animating', async () => {
    const g = await town();
    let tiles = 0;
    const was = g.p.animateTiles.bind(g.p);
    g.p.animateTiles = () => {
      tiles++;
      was();
    };
    const before = frames(g);
    for (let k = 0; k < 20; k++) updateFrame(g, false);
    expect(frames(g)).toBe(before);
    expect(tiles).toBe(20);
  });

  it('moves them on a pass with them', async () => {
    const g = await town();
    const before = frames(g);
    for (let k = 0; k < 20; k++) updateFrame(g);
    expect(frames(g)).not.toBe(before);
  });
});
