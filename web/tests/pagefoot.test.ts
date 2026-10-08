import { describe, expect, it } from 'vitest';
import { Pad } from '../src/game/io.ts';
import { showText } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** A long page's foot (menu.ts showText): how far down, and no buttons named to a controller. */
describe("a long page's foot", () => {
  it('says how far down, and names no buttons, with a controller', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    p.keys.push(Pad.B);
    await showText(
      g,
      'Long',
      Array.from({ length: 60 }, (_, i) => `Line ${i}`),
    );
    const screen = p.rows.map((r) => r.join('')).join('\n');
    expect(screen).toMatch(/\d+%/);
    expect(screen).not.toMatch(/D-pad|B close/);
  });
});
