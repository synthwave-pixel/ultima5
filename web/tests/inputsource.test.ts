import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { gameplayMenu } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';
import { fly, Landed } from './pilot.ts';

/** The switch to letter commands is a keyboard's to make: a thumb or a gamepad that chose it would be stranded. */
describe('the Input setting', () => {
  const labels = async (source: 'keyboard' | 'gamepad' | 'touch'): Promise<string[]> => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.lastSource = source;
    let seen: string[] = [];
    fly(g, p, [
      (game) => {
        if (seen.length) return undefined;
        seen = game.menuShown?.labels ?? [];
        return Pad.B;
      },
    ]);
    await gameplayMenu(g).catch((e: unknown) => {
      if (!(e instanceof Landed)) throw e;
    });
    return seen;
  };

  it('is offered to a keyboard', async () => {
    expect((await labels('keyboard')).some((l) => l.startsWith('Input:'))).toBe(true);
  });

  it('is not offered to a gamepad or a touch screen', async () => {
    expect((await labels('gamepad')).some((l) => l.startsWith('Input:'))).toBe(false);
    expect((await labels('touch')).some((l) => l.startsWith('Input:'))).toBe(false);
  });
});
