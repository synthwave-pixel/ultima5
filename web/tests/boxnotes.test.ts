import { describe, expect, it } from 'vitest';
import { K, Pad } from '../src/game/io.ts';
import { choose } from '../src/game/menu.ts';
import { journeyOnward } from '../src/game/run.ts';
import { newGame } from './helpers.ts';

/** A box's notes (menu.ts choose): under its lines, the note of the line the bar is on. */
describe("a box's notes", () => {
  it('say what the line under the bar does, and follow the bar', async () => {
    const { g, p } = newGame();
    journeyOnward(g);
    g.options.input = 'controller';
    const screens: string[] = [];
    const keys = [K.Down, Pad.B];
    p.next = () => {
      screens.push(p.rows.map((r) => r.join('')).join('\n'));
      return keys.shift();
    };
    await choose(
      g,
      'Export',
      [
        { label: 'To the clipboard', note: 'To paste into Import on another browser or device.' },
        { label: 'To a file', note: 'Saved as a file.' },
      ],
      0,
      true,
    );
    expect(screens[0]).toMatch(/To paste into Import/);
    expect(screens[1]).toMatch(/Saved as a file/);
    expect(screens[1]).not.toMatch(/To paste into/);
  });
});
