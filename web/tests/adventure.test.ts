import { describe, expect, it } from 'vitest';
import { askAdventure } from '../src/game/characterQuestions.ts';
import { K, Pad } from '../src/game/io.ts';
import { newGame } from './helpers.ts';

/** Thine Adventure, answered with the choice `down` lines below the first (Modern, Classic, Story). */
async function adventure(down: number) {
  const { g, p } = newGame();
  g.options.input = 'controller';
  p.keys.push(...Array<number>(down).fill(K.Down), Pad.A);
  await askAdventure(g);
  return g.options;
}

/** Thine Adventure's lines as shown, the game's year given (or Ultima V's). */
async function lines(year?: number): Promise<string[]> {
  const { g, p } = newGame();
  g.options.input = 'controller';
  let shown: string[] = [];
  p.next = () => {
    shown = [...(g.menuShown?.labels ?? [])];
    return Pad.A;
  };
  await askAdventure(g, year);
  return shown;
}

describe('Thine Adventure', () => {
  it('sets the Modern rules, the Classic or the Story', async () => {
    expect(await adventure(0)).toMatchObject({ rules: 'modern' });
    expect(await adventure(1)).toMatchObject({ rules: 'classic' });
    expect(await adventure(2)).toMatchObject({ rules: 'story' });
  });

  it('names the year the game came out in Classic: 1988 for Ultima V, the year given for another game', async () => {
    expect(await lines()).toContain('Classic (as in 1988)');
    expect(await lines(1985)).toContain('Classic (as in 1985)');
  });
});
