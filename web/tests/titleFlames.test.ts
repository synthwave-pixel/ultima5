import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../src/game/appearance.ts';
import { chooseAppearance } from '../src/game/appearanceMenu.ts';
import type { Game } from '../src/game/game.ts';
import { askAddress, askName } from '../src/game/intro.ts';
import { K, Pad } from '../src/game/io.ts';
import { confirm } from '../src/game/menu.ts';
import { Framebuffer } from '../src/ui/framebuffer';
import { type FakePlatform, newGame } from './helpers.ts';

const fonts = [{ rows: new Uint8Array(128 * 8) }, { rows: new Uint8Array(128 * 8) }];

/**
 * While the character is made the title's flames flicker on behind its questions (Game.titleIdle), but not over a
 * question's own box, nor behind the Appearance screen, which covers them.
 */
describe('the title behind the new character’s questions', () => {
  /** A game whose key waits turn their idle over a few times before each key, counting the title's turns. */
  const watched = (): { g: Game; p: FakePlatform; turns: () => number } => {
    const { g, p } = newGame();
    let turns = 0;
    g.titleIdle = () => turns++;
    const waitKey = p.waitKey.bind(p);
    Object.assign(p, {
      waitKey: async (idle: () => void | Promise<void>) => {
        for (let i = 0; i < 3; i++) await idle();
        return waitKey();
      },
    });
    return { g, p, turns: () => turns };
  };

  it('turns while the name is asked', async () => {
    const { g, p, turns } = watched();
    p.keys.push(Pad.A); // Continue, where the bar starts with a name given
    await askName(g, 8, 15, 'Rowan');
    expect(turns()).toBeGreaterThan(0);
  });

  it('turns while how the Avatar is addressed is asked', async () => {
    const { g, p, turns } = watched();
    p.keys.push(K.Left, Pad.A);
    expect(await askAddress(g)).not.toBeNull();
    expect(turns()).toBeGreaterThan(0);
  });

  it('turns while the warning waits', async () => {
    const { g, p, turns } = watched();
    p.keys.push(Pad.B);
    await confirm(g, 'A new character begins a new game, and Rowan is lost.', true);
    expect(turns()).toBeGreaterThan(0);
  });

  it('stands still behind the Appearance screen', async () => {
    const { g, p, turns } = watched();
    Object.assign(g.options, { tileSet: 'standard', tiles: 'modern-pc', input: 'controller' });
    p.keys.push(Pad.B);
    await chooseAppearance(g, { ...DEFAULT_APPEARANCE });
    expect(turns()).toBe(0);
  });

  it('copies a flame row round a box on the title, leaving the box as it is', () => {
    const fb = new Framebuffer(new Uint8Array(512 * 128), fonts);
    fb.page = 1;
    fb.fill(0, 5, 319, 5, 4);
    fb.page = 0;
    fb.fill(0, 0, 319, 199, 0);
    fb.fill(100, 60, 200, 80, 1);
    fb.copyRow(1, 5, 0, 70, 0xf, [[100, 60, 200, 80]]);
    const row = fb.pages[0].subarray(70 * 320, 71 * 320);
    expect([row[0], row[99], row[100], row[150], row[200], row[201], row[319]]).toEqual([4, 4, 1, 1, 1, 4, 4]);
    // A row the box does not reach is copied whole.
    fb.copyRow(1, 5, 0, 90, 0xf, [[100, 60, 200, 80]]);
    expect(fb.pages[0].subarray(90 * 320, 91 * 320).every((v) => v === 4)).toBe(true);
  });
});
