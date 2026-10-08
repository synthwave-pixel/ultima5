import { describe, expect, it } from 'vitest';
import { Intro } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/** Thine Adventure, answered with the choice `down` lines below the first (Modern, Classic, Story). */
async function adventure(down: number) {
  const { g, p } = newGame();
  g.options.input = 'controller';
  p.keys.push(...Array<number>(down).fill(K.Down), Pad.A);
  await (new Intro(g) as unknown as { adventure(): Promise<void> }).adventure();
  return g.options;
}

describe('Thine Adventure', () => {
  it('sets the Modern rules, the Classic or the Story', async () => {
    expect(await adventure(0)).toMatchObject({ rules: 'modern' });
    expect(await adventure(1)).toMatchObject({ rules: 'classic' });
    expect(await adventure(2)).toMatchObject({ rules: 'story' });
  });
});
